import { nangoProxyFetch, buildNangoProxyUrl, sheetsNangoEnv } from './nangoProxy';

export type SheetsAppendInput = {
  originalMessage: string;
  emoji: string;
  cleanedMessage: string;
  interpretedMood: string;
  timestampIso: string;
};

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

/** Tab id from `...#gid=<n>` in the Sheets URL; first tab is almost always 0. */
export function googleSheetsTabId(): number {
  const raw =
    process.env.GOOGLE_SHEETS_TAB_ID?.trim() ||
    process.env.GOOGLE_SHEETS_GID?.trim() ||
    '0';
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Append via `spreadsheet.batchUpdate`; Nango `/proxy/` must receive paths like `v4/...`, not full `https://...` URLs. */
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

  const sheetId = googleSheetsTabId();
  const providerPath = `v4/spreadsheets/${spreadsheetId}:batchUpdate`;

  const debug = sheetsDebugEnabled();
  const nangoProxyUrl = debug ? buildNangoProxyUrl(env.env, providerPath) : '';

  if (debug) {
    console.error('[nango-vibe-relay:SHEETS_DEBUG] providerPath=', providerPath);
    console.error('[nango-vibe-relay:SHEETS_DEBUG] sheetId=', sheetId);
    console.error('[nango-vibe-relay:SHEETS_DEBUG] nangoProxyUrl=', nangoProxyUrl);
  }

  const rowCells = [
    row.timestampIso,
    row.emoji,
    row.originalMessage,
    row.cleanedMessage,
    row.interpretedMood,
  ];

  const payload = {
    requests: [
      {
        appendCells: {
          sheetId,
          rows: [
            {
              values: rowCells.map((cell) => ({ userEnteredValue: { stringValue: cell } })),
            },
          ],
        },
      },
    ],
  };

  const res = await nangoProxyFetch(env.env, providerPath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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
