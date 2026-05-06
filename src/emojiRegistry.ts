/**
 * Mood picker: stable ASCII ids (what the client submits, Sheets column EMOJI stores,
 * OpenAI receives). Display glyphs live only in the HTML grid.
 */

export const EMOJI_ID_TO_GLYPH: Record<string, string> = {
  grinning: '😀',
  smiley: '😃',
  smile: '😄',
  beaming: '😁',
  blush: '😊',
  'slight-smile': '🙂',
  wink: '😉',
  'heart-eyes': '😍',
  'star-struck': '🤩',
  kiss: '😘',
  cool: '😎',
  nerd: '🤓',
  monocle: '🧐',
  thinking: '🤔',
  sleeping: '😴',
  surprised: '😮',
  'sweat-smile': '😅',
  cry: '😢',
  sob: '😭',
  steam: '😤',
  rage: '😡',
  party: '🥳',
  'upside-down': '🙃',
  halo: '😇',
  pleading: '🥺',
} as const;

const GLYPH_TO_ID: Record<string, string> = (() => {
  const acc: Record<string, string> = {};
  for (const [id, g] of Object.entries(EMOJI_ID_TO_GLYPH)) acc[g] = id;
  return acc;
})();

export const KNOWN_MOOD_EMOJI_IDS = Object.freeze(Object.keys(EMOJI_ID_TO_GLYPH));

/** Readable label for prose (fallback / repair paths), ASCII only. */
export function emojiIdToLabel(id: string): string {
  return id.trim().toLowerCase().replace(/-/g, ' ');
}

/** Accept canonical id or legacy single-glyph submits; return canonical id or null. */
export function resolveMoodEmojiInput(raw: string): string | null {
  const t = raw.trim().toLowerCase();
  if (!t) return null;
  if (t in EMOJI_ID_TO_GLYPH) return t;
  return GLYPH_TO_ID[t] ?? null;
}
