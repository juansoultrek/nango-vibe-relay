import crypto from 'crypto';
import path from 'path';
import express from 'express';

import { LogStore } from './logging/logStore';
import { runPipeline } from './pipeline/runPipeline';
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
  res.json({
    ok: true,
    basePath: MOUNT || '/',
    explicitBase: readExplicitBase() || null,
    uptimeSeconds: Number(process.uptime().toFixed(3)),
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
