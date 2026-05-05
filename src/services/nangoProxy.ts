/** Proxy HTTP requests through Nango (OAuth tokens remain in Nango). */

export type NangoEnv = {
  secret: string;
  host: string;
  providerConfigKey: string;
  connectionId: string;
};

export function readNangoEnv(): { ok: true } | { ok: false; missing: string } {
  const secret = process.env.NANGO_SECRET_KEY?.trim();
  if (!secret) return { ok: false, missing: 'NANGO_SECRET_KEY' };
  return { ok: true };
}

export function sheetsNangoEnv(): { ok: true; env: NangoEnv } | { ok: false; missing: string } {
  const base = readNangoEnv();
  if (!base.ok) return base;

  const providerConfigKey =
    process.env.NANGO_PROVIDER_CONFIG_KEY_GOOGLE_SHEETS?.trim() ||
    process.env.NANGO_GOOGLE_SHEETS_INTEGRATION_ID?.trim();
  const connectionId = process.env.NANGO_CONNECTION_ID_GOOGLE?.trim();

  if (!providerConfigKey) return { ok: false, missing: 'NANGO_PROVIDER_CONFIG_KEY_GOOGLE_SHEETS' };
  if (!connectionId) return { ok: false, missing: 'NANGO_CONNECTION_ID_GOOGLE' };

  return {
    ok: true,
    env: buildEnv(providerConfigKey, connectionId),
  };
}

export function slackNangoEnv(): { ok: true; env: NangoEnv } | { ok: false; missing: string } {
  const base = readNangoEnv();
  if (!base.ok) return base;

  const providerConfigKey =
    process.env.NANGO_PROVIDER_CONFIG_KEY_SLACK?.trim() || process.env.NANGO_SLACK_INTEGRATION_ID?.trim();
  const connectionId = process.env.NANGO_CONNECTION_ID_SLACK?.trim();

  if (!providerConfigKey) return { ok: false, missing: 'NANGO_PROVIDER_CONFIG_KEY_SLACK' };
  if (!connectionId) return { ok: false, missing: 'NANGO_CONNECTION_ID_SLACK' };

  return {
    ok: true,
    env: buildEnv(providerConfigKey, connectionId),
  };
}

function buildEnv(providerConfigKey: string, connectionId: string): NangoEnv {
  return {
    secret: process.env.NANGO_SECRET_KEY!.trim(),
    host: process.env.NANGO_HOST?.trim() || 'https://api.nango.dev',
    providerConfigKey,
    connectionId,
  };
}

/**
 * Nango resolves `GET ${host}/proxy/{path}` to `{integrationBaseUrl}/{path}`.
 * Do NOT pass a full URL (see Nango docs: path is appended to provider base — e.g. `v4/...` after `https://sheets.googleapis.com/`).
 * Passing `encodeURIComponent(https://...)` made Google serve 404 /https%253A...
 */
export function buildNangoProxyUrl(env: NangoEnv, providerPath: string): string {
  const p = providerPath.replace(/^\/+/, '');
  return `${env.host.replace(/\/+$/, '')}/proxy/${p}`;
}

/** @param providerPath Relative path (+ optional query) on the provider API, e.g. `v4/spreadsheets/{id}:batchUpdate` */
export async function nangoProxyFetch(env: NangoEnv, providerPath: string, init: RequestInit): Promise<Response> {
  const url = buildNangoProxyUrl(env, providerPath);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${env.secret}`);
  headers.set('Provider-Config-Key', env.providerConfigKey);
  headers.set('Connection-Id', env.connectionId);

  const nextInit: RequestInit = { ...init, headers };
  return fetch(url, nextInit);
}
