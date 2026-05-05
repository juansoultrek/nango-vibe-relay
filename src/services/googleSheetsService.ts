import { nangoProxyFetch, buildNangoProxyUrl, sheetsNangoEnv } from './nangoProxy';

export type SheetsAppendInput = {
  originalMessage: string;
  emoji: string;
  cleanedMessage: string;
  interpretedMood: string;
  timestampIso: string;
};

export type SheetsAppendDebug = {
  downstreamUrl: string;
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

  const rangeRaw = process.env.GOOGLE_SHEETS_RANGE?.trim() || 'Sheet1!A1';
  const downstream = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(rangeRaw)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const debug = sheetsDebugEnabled();
  const nangoProxyUrl = debug ? buildNangoProxyUrl(env.env, downstream) : '';

  if (debug) {
    console.error('[nango-vibe-relay:SHEETS_DEBUG] downstreamUrl=', downstream);
    console.error('[nango-vibe-relay:SHEETS_DEBUG] nangoProxyUrl=', nangoProxyUrl);
  }

  const values = [[
    row.timestampIso,
    row.emoji,
    row.originalMessage,
    row.cleanedMessage,
    row.interpretedMood,
  ]];

  const res = await nangoProxyFetch(env.env, downstream, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values }),
  });

  if (!res.ok) {
    const bodyText = await safeText(res);
    const fail: { ok: false; detail: string; debug?: SheetsAppendDebug } = {
      ok: false,
      detail: `Google Sheets HTTP ${res.status}: ${bodyText}`,
    };
    if (debug) {
      fail.debug = {
        downstreamUrl: downstream,
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

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 800);
  } catch {
    return '(could not read response body)';
  }
}
