import { nangoProxyFetch, sheetsNangoEnv } from './nangoProxy';

export type SheetsAppendInput = {
  originalMessage: string;
  emoji: string;
  cleanedMessage: string;
  interpretedMood: string;
  timestampIso: string;
};

export async function appendRowToSheet(
  row: SheetsAppendInput,
): Promise<{ ok: true } | { ok: false; detail: string }> {
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
    return {
      ok: false,
      detail: `Google Sheets HTTP ${res.status}: ${await safeText(res)}`,
    };
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
