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

/** Full URL to Nango's proxy endpoint for a given downstream API URL (no secrets in the URL). */
export function buildNangoProxyUrl(env: NangoEnv, downstreamUrl: string): string {
  const encoded = encodeURIComponent(downstreamUrl);
  return `${env.host.replace(/\/+$/, '')}/proxy/${encoded}`;
}

/** Call an upstream HTTPS URL via Nango. `downstreamUrl` must include scheme and host (e.g. https://slack.com/api/…). */
export async function nangoProxyFetch(env: NangoEnv, downstreamUrl: string, init: RequestInit): Promise<Response> {
  const url = buildNangoProxyUrl(env, downstreamUrl);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${env.secret}`);
  headers.set('Provider-Config-Key', env.providerConfigKey);
  headers.set('Connection-Id', env.connectionId);

  const nextInit: RequestInit = { ...init, headers };
  return fetch(url, nextInit);
}
