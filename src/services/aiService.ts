import type { AiResult } from '../types';

export async function runOpenAi(
  message: string,
  emoji: string,
): Promise<{ ok: true; data: AiResult } | { ok: false; detail: string }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return { ok: false, detail: 'OPENAI_API_KEY is not set (.env or environment)' };
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

  const system = [
    'You process a user-written message and mood emoji.',
    'Return compact JSON with keys: cleaned_message (string, plain text, no emoji), interpreted_mood (short string describing the mood implied by the emoji and text).',
    'Do not wrap JSON in markdown fences.',
  ].join(' ');

  const user = [
    `Emoji: ${emoji}`,
    `Message:\n${message}`,
  ].join('\n\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!res.ok) {
    const text = await safeText(res);
    return { ok: false, detail: `OpenAI HTTP ${res.status}: ${text}` };
  }

  type OpenAiShape = {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const payload = (await res.json()) as OpenAiShape;
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    return { ok: false, detail: 'OpenAI response missing choices[0].message.content' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    return { ok: false, detail: 'OpenAI returned invalid JSON' };
  }

  const obj = parsed as Record<string, unknown>;
  const cleaned = obj.cleaned_message;
  const mood = obj.interpreted_mood;

  if (typeof cleaned !== 'string' || typeof mood !== 'string' || !cleaned.trim() || !mood.trim()) {
    return { ok: false, detail: 'OpenAI JSON missing cleaned_message or interpreted_mood strings' };
  }

  return {
    ok: true,
    data: {
      cleanedMessage: cleaned.trim(),
      interpretedMood: mood.trim(),
    },
  };
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 800);
  } catch {
    return '(could not read response body)';
  }
}
