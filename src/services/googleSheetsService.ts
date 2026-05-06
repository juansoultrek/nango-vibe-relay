import { nangoProxyFetch, buildNangoProxyUrl, sheetsNangoEnv, type NangoEnv } from './nangoProxy';

export type SheetsAppendInput = {
  originalMessage: string;
  /** Column EMOJI: canonical picker id (e.g. sob), not a Unicode glyph. */
  emoji: string;
  interpretedMood: string;
  /** Popup + “OpenAI interpretation” column — encouragement + brief read. */
  companionNote: string;
  timestampIso: string;
};

/**
 * Column order written to A–E. Matches typical mood-log sheets:
 * mood label before the raw text, refined line last.
 * (We only auto-write row 1 when A1 is empty — rename headers in Sheets anytime.)
 */
export const SHEET_COLUMN_HEADERS = [
  'DATE',
  'EMOJI',
  'EMOJI MEANING',
  'ORIGINAL TEXT',
  'OPENAI INTERPRETATION',
] as const;

export type SheetsAppendDebug = {
  /** Path after Nango `/proxy/` (joined to Sheets base URL). */
  providerPath: string;
  nangoProxyUrl: string;
  httpStatus: number;
  responseContentType: string | null;
  responseBodyPrefix: string;
};

function sheetsDebugEnabled(): boolean {
  const v = process.env.SHEETS_DEBUG?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export type AppendRowResult = { ok: true } | { ok: false; detail: string; debug?: SheetsAppendDebug };

/**
 * Convert an ISO-8601 instant to Google Sheets date-time serial (same system as Excel).
 * Uses UTC instant → serial so applying **Format → Number → Date time** on column A works.
 */
export function isoUtcToSheetsSerial(iso: string): number {
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid ISO timestamp for Sheets: ${iso}`);
  }
  const MS_PER_DAY = 86400000;
  // Days since 1899-12-30 in the Sheets/Excel serial system (Unix epoch serial = 25569).
  return ms / MS_PER_DAY + 25569;
}

function timestampCellForSheet(timestampIso: string): string | number {
  const raw = process.env.GOOGLE_SHEETS_TIMESTAMP_AS_TEXT?.trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes') {
    return timestampIso;
  }
  return isoUtcToSheetsSerial(timestampIso);
}

/** Tab id for legacy batchUpdate callers (gid / sheet index). */
export function googleSheetsTabId(): number {
  const raw =
    process.env.GOOGLE_SHEETS_TAB_ID?.trim() ||
    process.env.GOOGLE_SHEETS_GID?.trim() ||
    '0';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Sheet tab title for API ranges (default first tab name in new spreadsheets). */
export function googleSheetsTabName(): string {
  const t = process.env.GOOGLE_SHEETS_TAB?.trim() || process.env.GOOGLE_SHEETS_TAB_NAME?.trim();
  if (t) return t;
  return 'Sheet1';
}

function ensureHeadersEnabled(): boolean {
  const v = process.env.GOOGLE_SHEETS_ENSURE_HEADERS?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}

/** Serialize appends so header row + first data row cannot interleave on a cold sheet. */
const sheetQueues = new Map<string, Promise<unknown>>();

function runSheetExclusive<T>(spreadsheetId: string, fn: () => Promise<T>): Promise<T> {
  const prev = sheetQueues.get(spreadsheetId) ?? Promise.resolve();
  const out = prev.catch(() => undefined).then(() => fn());
  sheetQueues.set(spreadsheetId, out.then(() => undefined).catch(() => undefined));
  return out;
}

/**
 * Append one data row with `spreadsheets.values.append` + USER_ENTERED so column-level
 * formatting in Google Sheets applies like normal typing (unlike appendCells raw grids).
 */
export async function appendRowToSheet(row: SheetsAppendInput): Promise<AppendRowResult> {
  const env = sheetsNangoEnv();
  if (!env.ok) {
    return {
      ok: false,
      detail: `Missing Nango/Google Sheets env: ${env.missing}`,
    };
  }

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) {
    return { ok: false, detail: 'GOOGLE_SPREADSHEET_ID is not set' };
  }

  return runSheetExclusive(spreadsheetId, async () => {
    const tab = googleSheetsTabName();
    const headerOk = ensureHeadersEnabled()
      ? await ensureHeaderRow(env.env, spreadsheetId, tab)
      : { ok: true as const };
    if (!headerOk.ok) return headerOk;

    const rowValues = [
      timestampCellForSheet(row.timestampIso),
      row.emoji,
      row.interpretedMood,
      row.originalMessage,
      row.companionNote,
    ];

    const anchor = `${tab}!A1`;
    const encodedRange = encodeURIComponent(anchor);
    const providerPath =
      `v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:append` +
      `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const debug = sheetsDebugEnabled();
    const nangoProxyUrl = debug ? buildNangoProxyUrl(env.env, providerPath) : '';

    if (debug) {
      console.error('[nango-vibe-relay:SHEETS_DEBUG] values.append providerPath=', providerPath);
      console.error('[nango-vibe-relay:SHEETS_DEBUG] nangoProxyUrl=', nangoProxyUrl);
    }

    const res = await nangoProxyFetch(env.env, providerPath, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values: [rowValues],
      }),
    });

    if (!res.ok) {
      const bodyText = await safeText(res);
      const fail: { ok: false; detail: string; debug?: SheetsAppendDebug } = {
        ok: false,
        detail: `Google Sheets HTTP ${res.status}: ${bodyText}`,
      };
      if (debug) {
        fail.debug = {
          providerPath,
          nangoProxyUrl,
          httpStatus: res.status,
          responseContentType: res.headers.get('content-type'),
          responseBodyPrefix: bodyText.slice(0, 500),
        };
        console.error('[nango-vibe-relay:SHEETS_DEBUG] error', JSON.stringify(fail.debug));
      }
      return fail;
    }

    return { ok: true };
  });
}

async function ensureHeaderRow(
  env: NangoEnv,
  spreadsheetId: string,
  tab: string,
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const range = `${tab}!A1:E1`;
  const getPath = `v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;

  const getRes = await nangoProxyFetch(env, getPath, { method: 'GET' });
  const getText = await safeText(getRes);
  if (!getRes.ok) {
    return { ok: false, detail: `Google Sheets (read header row) HTTP ${getRes.status}: ${getText}` };
  }

  let data: { values?: string[][] };
  try {
    data = JSON.parse(getText) as { values?: string[][] };
  } catch {
    return { ok: false, detail: `Invalid JSON reading header row: ${getText.slice(0, 400)}` };
  }

  const a1 = data.values?.[0]?.[0]?.trim();
  if (a1) {
    return { ok: true };
  }

  const putPath =
    `v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}` +
    `?valueInputOption=USER_ENTERED`;

  const putRes = await nangoProxyFetch(env, putPath, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      majorDimension: 'ROWS',
      values: [Array.from(SHEET_COLUMN_HEADERS)],
    }),
  });

  const putText = await safeText(putRes);
  if (!putRes.ok) {
    return { ok: false, detail: `Google Sheets (write header row) HTTP ${putRes.status}: ${putText}` };
  }

  return { ok: true };
}

/** GET spreadsheet metadata via Nango (read-only sanity check vs proxy failures after OAuth). */
export async function fetchSpreadsheetTitleForTest(): Promise<
  { ok: true; spreadsheetId: string; title: string } | { ok: false; detail: string }
> {
  const env = sheetsNangoEnv();
  if (!env.ok) {
    return { ok: false, detail: `Missing Nango/Google Sheets env: ${env.missing}` };
  }

  const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID?.trim();
  if (!spreadsheetId) {
    return { ok: false, detail: 'GOOGLE_SPREADSHEET_ID is not set' };
  }

  const providerPath = `v4/spreadsheets/${spreadsheetId}?fields=properties.title`;
  const res = await nangoProxyFetch(env.env, providerPath, { method: 'GET' });

  const text = await safeText(res);
  if (!res.ok) {
    return { ok: false, detail: `Google Sheets HTTP ${res.status}: ${text}` };
  }

  try {
    const data = JSON.parse(text) as { properties?: { title?: string } };
    const title = data.properties?.title ?? '(no title)';
    return { ok: true, spreadsheetId, title };
  } catch {
    return { ok: false, detail: `Invalid JSON from Sheets: ${text.slice(0, 400)}` };
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 800);
  } catch {
    return '(could not read response body)';
  }
}
