import { emojiIdToLabel } from '../emojiRegistry';
import type { AiResult } from '../types';

const COMPANION_NOTE_MAX = 650;
/** Reject vacuous one-word “interpretations” in column E. */
const COMPANION_NOTE_MIN = 95;

/**
 * Full system instructions sent to OpenAI (single source of truth).
 * Sheets: B = mood face id, C = interpreted_mood (EMOJI MEANING), D = user text, E = companion_note.
 */
export const OPENAI_RELAY_SYSTEM_PROMPT = [
  'You read a mood check-in: the user’s free text plus one chosen face, identified only by a stable ASCII token from our app (kebab-case, e.g. sob, star-struck, slight-smile).',
  'That token is NOT user-written prose and is NOT a Unicode emoji character; do not quote it as if they said it. Use it only to know which face they picked from our fixed set.',
  'Your job is one combined interpretation: how that chosen face and their message read together emotionally.',
  'Reply with JSON only, keys: cleaned_message, interpreted_mood, companion_note. No markdown code fences.',
  '',
  '--- cleaned_message ---',
  'One paraphrased line in the SAME language(s) as the user. Fix spelling/grammar. Must not be identical to their raw text after trimming.',
  '',
  '--- interpreted_mood  →  spreadsheet column "EMOJI MEANING" ---',
  '3–7 words in the user’s language. Describe the emotional signal of THEIR CHOSEN FACE together with their message (integrated read), not either input alone.',
  'This field must not repeat or lightly rephrase their sentence. Forbidden: quoting the mood token verbatim as the mood label. Forbidden: full sentences starting with "I".',
  '',
  '--- companion_note  →  spreadsheet column "OPEN AI INTERPRETATION" ---',
  `At least TWO full sentences in the user’s language. Total length at least ~${COMPANION_NOTE_MIN} characters.`,
  'First sentence: state plainly how you believe the user is feeling emotionally right now (your integrated read from face + message).',
  'Second sentence: connect that read to the situation they hinted at, with empathy — not clinical diagnosis, not moralizing.',
  'Forbidden as the whole answer: a single adjective or noun alone (e.g. only "playful", "sadness", "enthusiastic"). Forbidden: empty hype.',
  'Write like a thoughtful human, specific to their words.',
  '',
  'Example JSON shape:',
  '{"cleaned_message":"...","interpreted_mood":"raw, exposed, needing care","companion_note":"You sound emotionally flooded..."}',
].join('\n');

export async function runOpenAi(
  message: string,
  emojiIdRaw: string,
): Promise<{ ok: true; data: AiResult } | { ok: false; detail: string }> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return { ok: false, detail: 'OPENAI_API_KEY is not set (.env or environment)' };
  }

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini';

  const emojiId = emojiIdRaw.trim().toLowerCase();
  const user = [
    `Mood face id from our picker (ASCII token only — not emoji art, not user text):\n${emojiId}`,
    `User message:\n${message}`,
  ].join('\n\n');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.72,
      messages: [
        { role: 'system', content: OPENAI_RELAY_SYSTEM_PROMPT },
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
  const companion = obj.companion_note;

  if (typeof cleaned !== 'string' || typeof mood !== 'string' || typeof companion !== 'string') {
    return {
      ok: false,
      detail: 'OpenAI JSON must include string fields cleaned_message, interpreted_mood, companion_note',
    };
  }

  const companionTrim = companion.trim();
  if (!cleaned.trim() || !mood.trim() || !companionTrim) {
    return { ok: false, detail: 'OpenAI returned empty cleaned_message, interpreted_mood, or companion_note' };
  }

  if (companionTrim.length > COMPANION_NOTE_MAX) {
    return {
      ok: false,
      detail: `companion_note too long (${companionTrim.length} chars; max ${COMPANION_NOTE_MAX})`,
    };
  }

  const fixedPair = fixSwappedMoodFields(cleaned.trim(), mood.trim());
  const repaired = repairMoodAndCompanion(
    message.trim(),
    emojiId.trim().toLowerCase(),
    fixedPair.cleanedMessage,
    fixedPair.interpretedMood,
    companionTrim,
  );

  const companionFinal = clampCompanion(enforceMinCompanion(repaired.companionNote, repaired.interpretedMood, emojiId));

  return {
    ok: true,
    data: {
      cleanedMessage: fixedPair.cleanedMessage,
      interpretedMood: repaired.interpretedMood,
      companionNote: companionFinal,
    },
  };
}

function clampCompanion(s: string): string {
  if (s.length <= COMPANION_NOTE_MAX) return s;
  return `${s.slice(0, COMPANION_NOTE_MAX - 1).trim()}…`;
}

/** One-word “interpretations” become full emotional read sentences. */
function enforceMinCompanion(note: string, mood: string, emojiId: string): string {
  const t = note.trim();
  if (t.length >= COMPANION_NOTE_MIN && countWords(t) >= 14) return t;

  if (looksLikeShortMoodLabel(t) || countWords(t) < 8 || t.length < COMPANION_NOTE_MIN) {
    return buildForcedInterpretation(emojiId, mood, t);
  }

  if (t.length < COMPANION_NOTE_MIN) {
    return `${t} ${buildForcedInterpretation(emojiId, mood, '')}`.trim();
  }
  return t;
}

function buildForcedInterpretation(emojiId: string, mood: string, failedNote: string): string {
  const tag = emojiIdToLabel(emojiId);
  const tail = failedNote ? ` (replacing a too-short line: "${failedNote.slice(0, 40)}")` : '';
  return [
    `With the mood you signaled (${tag}), my read is that you’re carrying ${mood} right now—the signal underneath is real and worth naming, not brushing aside.${tail}`,
    `That combination of what you wrote and the face you picked maps to an emotional state that wants attention and gentleness, not judgment.`,
  ].join(' ');
}

export function repairMoodAndCompanion(
  original: string,
  emojiId: string,
  cleaned: string,
  interpretedMood: string,
  companionNote: string,
): { interpretedMood: string; companionNote: string } {
  let mood = interpretedMood.trim();
  let companion = companionNote.trim();

  if (looksLikeJournalLine(mood) && looksLikeShortMoodLabel(companion) && countWords(mood) >= 4) {
    const tmp = mood;
    mood = companion;
    companion = tmp;
  }

  if (tooSimilarToUserMessage(mood, original) || moodEchoesEmojiId(mood, emojiId)) {
    mood = emojiAnchoredFallbackMood(emojiId, cleaned);
  }

  if (normalizeWs(mood) === normalizeWs(original)) {
    mood = emojiAnchoredFallbackMood(emojiId, cleaned);
  }

  if (looksLikeShortMoodLabel(companion) && companion.length < 50) {
    const wrongMood = companion;
    companion = buildInterpretivePair(emojiId, mood, cleaned, wrongMood);
  } else if (normalizeWs(companion) === normalizeWs(original)) {
    companion = buildInterpretivePair(emojiId, mood, cleaned, null);
  } else if (countWords(companion) < 8) {
    companion = buildInterpretivePair(emojiId, mood, cleaned, null);
  }

  return { interpretedMood: shrinkMoodLabel(mood), companionNote: companion };
}

function tooSimilarToUserMessage(mood: string, original: string): boolean {
  const a = normalizeWs(mood);
  const b = normalizeWs(original);
  if (a === b) return true;
  if (a.length >= 12 && (b.includes(a) || a.includes(b))) return true;
  const aw = new Set(a.split(/\s+/).filter(Boolean));
  const bw = b.split(/\s+/).filter(Boolean);
  if (bw.length === 0) return false;
  let hit = 0;
  for (const w of bw) {
    if (w.length > 2 && aw.has(w)) hit++;
  }
  return hit / bw.length >= 0.55;
}

function moodEchoesEmojiId(mood: string, emojiId: string): boolean {
  const m = normalizeWs(mood);
  const id = emojiId.trim().toLowerCase();
  if (!id) return false;
  if (m === normalizeWs(id)) return true;
  if (m === normalizeWs(id.replace(/-/g, ' '))) return true;
  return false;
}

function emojiAnchoredFallbackMood(emojiId: string, _cleaned: string): string {
  const needle = EMOJI_MEANING_FALLBACK[emojiId];
  if (needle) return needle;
  return `Face “${emojiIdToLabel(emojiId)}”: emotional signal (see interpretation)`;
}

const EMOJI_MEANING_FALLBACK: Record<string, string> = {
  grinning: 'Open, upbeat energy',
  smiley: 'Bright, outward joy',
  smile: 'Warm, genuine delight',
  beaming: 'Beaming, eager positivity',
  blush: 'Quiet contentment',
  'slight-smile': 'Gentle, restrained calm',
  wink: 'Playful, teasing lightness',
  'heart-eyes': 'Deep fondness / admiration',
  'star-struck': 'Inspired, dazzled excitement',
  kiss: 'Affectionate, warm intent',
  cool: 'Confident, composed cool',
  nerd: 'Earnest, focused curiosity',
  monocle: 'Skeptical, weighing carefully',
  thinking: 'Uncertain, thinking it through',
  sleeping: 'Sleepy, low-energy fade',
  surprised: 'Surprised, caught off guard',
  'sweat-smile': 'Awkward relief / nervous laugh',
  cry: 'Sad, tender hurt',
  sob: 'Overwhelmed grief or release',
  steam: 'Frustrated, pent-up tension',
  rage: 'Angry, boundary-hot',
  party: 'Festive, celebratory lift',
  'upside-down': 'Ironic upside-down mood',
  halo: 'Innocent or self-mocking calm',
  pleading: 'Soft plea, vulnerable appeal',
};

function buildInterpretivePair(
  emojiId: string,
  moodCaption: string,
  cleaned: string,
  wrongShort: string | null,
): string {
  const tag = emojiIdToLabel(emojiId);
  const hook = wrongShort
    ? `I’m not reducing this to “${wrongShort}”—there’s more texture here.`
    : `Reading your check-in together with the “${tag}” face you picked, you seem to be sitting with something real.`;
  return [
    hook,
    `My sense is you’re carrying “${moodCaption}” emotionally right now, and the line you wrote—“${cleaned}”—reads as an honest snapshot of that inner weather.`,
    `Whatever mix that is, it deserves patience: naming it is already a form of care.`,
  ].join(' ');
}

function shrinkMoodLabel(s: string): string {
  const t = s.trim();
  if (countWords(t) <= 8 && t.length <= 88) return t;
  const words = t.split(/\s+/).filter(Boolean).slice(0, 7);
  return words.join(' ');
}

function normalizeWs(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function fixSwappedMoodFields(cleaned: string, mood: string): {
  cleanedMessage: string;
  interpretedMood: string;
} {
  if (fieldsLookSwapped(cleaned, mood)) {
    return { cleanedMessage: mood, interpretedMood: cleaned };
  }
  return { cleanedMessage: cleaned, interpretedMood: mood };
}

function fieldsLookSwapped(shortField: string, longField: string): boolean {
  const a = shortField.trim();
  const b = longField.trim();
  const wa = countWords(a);
  const wb = countWords(b);

  if (wa <= 3 && wb >= 4 && b.length > a.length * 2) {
    if (!looksLikeShortMoodLabel(a)) return false;
    if (looksLikeJournalLine(b)) return true;
  }

  if (wa === 1 && wb >= 5 && b.length > 24) {
    if (looksLikeJournalLine(b) && looksLikeShortMoodLabel(a)) return true;
  }

  return false;
}

function countWords(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function looksLikeShortMoodLabel(s: string): boolean {
  const words = countWords(s);
  if (words === 0) return false;
  if (words > 8) return false;
  if (s.length > 64) return false;
  if (/\b(i'|i am|i'm|me |my |we |the )\b/i.test(s) && s.length > 30) return false;
  return true;
}

function looksLikeJournalLine(s: string): boolean {
  if (countWords(s) >= 5) return true;
  if (/[.!?]/.test(s) && s.length > 15) return true;
  if (/\b(i'|i am|i'm)\b/i.test(s) && countWords(s) >= 3) return true;
  return false;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 800);
  } catch {
    return '(could not read response body)';
  }
}
