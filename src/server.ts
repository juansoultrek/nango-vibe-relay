import crypto from 'crypto';
import path from 'path';
import express from 'express';

import { LogStore } from './logging/logStore';
import { runPipeline } from './pipeline/runPipeline';
import {
  appendRowToSheet,
  fetchSpreadsheetTitleForTest,
  googleSheetsTabId,
  googleSheetsTabName,
} from './services/googleSheetsService';
import type { SubmitBody } from './types';

const logStore = new LogStore();
const app = express();

/** Leading path without trailing slash, e.g. "/nango"; "" means site root */
function normalizeBase(raw: string | undefined): string {
  const t = raw?.trim().replace(/^["']|["']$/g, '') || '';
  if (!t || t === '/') return '';
  const withSlash = t.startsWith('/') ? t : `/${t}`;
  return withSlash.replace(/\/+$/, '');
}

function readExplicitBase(): string {
  return (
    normalizeBase(process.env.APP_BASE_PATH) ||
    normalizeBase(process.env.BASE_PATH) ||
    normalizeBase(process.env.APPLICATION_BASE_PATH)
  );
}

/**
 * cPanel often sets PORT but env vars from the UI do not always reach the process.
 * If PORT is set (managed host) and no explicit base, default to /nango for this project.
 * Local `npm run dev` / `npm start` usually have no PORT → mount at site root.
 * Disable with APP_BASE_AUTO_NANGO=false if you use PORT locally without a subpath.
 */
function resolveMountPrefix(): string {
  const explicit = readExplicitBase();
  if (explicit) return explicit;

  const portManaged = process.env.PORT !== undefined && process.env.PORT !== '';
  const autoOff = process.env.APP_BASE_AUTO_NANGO === 'false';

  if (portManaged && !autoOff) {
    return normalizeBase(process.env.APP_BASE_FALLBACK_MOUNT || '/nango');
  }

  return '';
}

const MOUNT = resolveMountPrefix();
const PUBLIC_DIR = path.join(process.cwd(), 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

const routes = express.Router();

routes.get('/health', (_req, res) => {
  const sid = process.env.GOOGLE_SPREADSHEET_ID?.trim() ?? '';
  const rangeLegacy = process.env.GOOGLE_SHEETS_RANGE?.trim() || null;
  const sheetsDebug =
    process.env.SHEETS_DEBUG?.trim().toLowerCase() === '1' ||
    process.env.SHEETS_DEBUG?.trim().toLowerCase() === 'true' ||
    process.env.SHEETS_DEBUG?.trim().toLowerCase() === 'yes';
  res.json({
    ok: true,
    basePath: MOUNT || '/',
    explicitBase: readExplicitBase() || null,
    uptimeSeconds: Number(process.uptime().toFixed(3)),
    openai: {
      apiKeySet: Boolean(process.env.OPENAI_API_KEY?.trim()),
      model: process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    },
    sheets: {
      spreadsheetIdSet: Boolean(sid),
      spreadsheetIdLength: sid.length,
      sheetsTabName: googleSheetsTabName(),
      sheetsTabId: googleSheetsTabId(),
      sheetsRangeLegacy: rangeLegacy,
      sheetsDebug,
      /** What Node actually sees for SHEETS_DEBUG (null = unset). Helps verify cPanel injects the var. */
      sheetsDebugEnvRaw: process.env.SHEETS_DEBUG === undefined ? null : process.env.SHEETS_DEBUG,
    },
  });
});

routes.get('/logs/:requestId', (req, res) => {
  const requestId = req.params.requestId ?? '';
  const snap = logStore.snapshot(requestId);
  if (!snap) {
    res.status(404).json({ error: 'Unknown requestId' });
    return;
  }
  res.json({ requestId: snap.requestId, steps: snap.steps, finishedAt: snap.finishedAt });
});

routes.post('/submit', (req, res) => {
  const body = req.body as SubmitBody;
  if (!isRecord(body) || typeof body.message !== 'string' || typeof body.emoji !== 'string') {
    res.status(400).json({
      error: 'JSON body must include string fields "message" and "emoji"',
    });
    return;
  }

  const requestId = crypto.randomUUID();
  logStore.createRequest(requestId);

  res.status(202).json({ requestId });

  void runPipeline(logStore, requestId, body.message, body.emoji);
});

/** GET: read-only Nango → Sheets (title). If this fails, proxy/token/ID/scopes — not batchUpdate body. */
routes.get('/test/sheets-meta', async (_req, res) => {
  try {
    const result = await fetchSpreadsheetTitleForTest();
    if (result.ok) {
      res.json({
        ok: true,
        message: 'Nango proxy can read this spreadsheet.',
        spreadsheetId: result.spreadsheetId,
        title: result.title,
      });
      return;
    }
    res.status(502).json({ ok: false, detail: result.detail });
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, detail });
  }
});

/** Sheets test: browser visits use GET — explain; only POST runs the append. */
routes.get('/test/sheets', (_req, res) => {
  res.status(405).setHeader('Allow', 'POST');
  res.json({
    error:
      'Use POST, not GET. This endpoint appends one test row; the browser always sends GET when you paste the URL.',
    curl: 'curl -sS -X POST "$THIS_URL" -H "Content-Type: application/json" -d "{}"',
  });
});

/** Append one labelled test row via Nango → Sheets only (no OpenAI, no Slack). */
routes.post('/test/sheets', async (_req, res) => {
  const timestampIso = new Date().toISOString();
  try {
    const result = await appendRowToSheet({
      timestampIso,
      emoji: '🧪',
      originalMessage: '[Sheets connectivity test]',
      companionNote: '[Sheets connectivity test — companion]',
      interpretedMood: 'test',
    });

    if (result.ok) {
      res.json({
        ok: true,
        message: 'Test row appended. Check the spreadsheet for 🧪 and the test markers.',
      });
      return;
    }
    const body: { ok: false; detail: string; debug?: unknown } = {
      ok: false,
      detail: result.detail,
    };
    if ('debug' in result && result.debug !== undefined) {
      body.debug = result.debug;
    }
    res.status(502).json(body);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    res.status(500).json({ ok: false, detail });
  }
});

routes.use(express.static(PUBLIC_DIR));

/**
 * Many hosts (Passenger / reverse proxy) forward only the path *after* the public URL,
 * e.g. browser GET /nango/health → Node sees GET /health. Mount the same router at both
 * MOUNT and / so both patterns work. When MOUNT is empty, a single root mount is enough.
 *
 * Do NOT redirect GET /nango → /nango/: LiteSpeed often forwards /nango/ upstream as /nango,
 * which would repeat the redirect forever (308 loop).
 */
if (MOUNT) {
  app.use(MOUNT, routes);
}
app.use('/', routes);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

const rawPort = process.env.PORT;
const port = rawPort ? Number.parseInt(rawPort, 10) : 8787;
const listenPort = Number.isFinite(port) && port > 0 ? port : 8787;

app.listen(listenPort, () => {
  console.error(
    [
      'Nango Vibe Relay',
      `port=${listenPort}`,
      `cwd=${process.cwd()}`,
      `explicitBase=${JSON.stringify(readExplicitBase() || '')}`,
      `mount=${JSON.stringify(MOUNT || '/')}`,
    ].join(' | '),
  );
});
