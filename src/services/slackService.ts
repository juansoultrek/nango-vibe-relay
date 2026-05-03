import { nangoProxyFetch, slackNangoEnv } from './nangoProxy';

export async function postSlackSummary(text: string): Promise<{ ok: true } | { ok: false; detail: string }> {
  const env = slackNangoEnv();
  if (!env.ok) {
    return { ok: false, detail: `Missing Nango/Slack env: ${env.missing}` };
  }

  const channel = process.env.SLACK_CHANNEL_ID?.trim();
  if (!channel) {
    return { ok: false, detail: 'SLACK_CHANNEL_ID is not set' };
  }

  const downstream = 'https://slack.com/api/chat.postMessage';
  const res = await nangoProxyFetch(env.env, downstream, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      channel,
      text,
    }),
  });

  if (!res.ok) {
    return { ok: false, detail: `Slack HTTP ${res.status}: ${await safeText(res)}` };
  }

  let body: unknown;
  try {
    body = await res.json() as unknown;
  } catch {
    return { ok: false, detail: 'Slack returned invalid JSON' };
  }

  const ok = typeof body === 'object' && body !== null && 'ok' in body && (body as { ok?: boolean }).ok === true;

  if (!ok) {
    return { ok: false, detail: `Slack chat.postMessage error=${JSON.stringify(body)}`.slice(0, 800) };
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
