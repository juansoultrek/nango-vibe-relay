const MESSAGE_MIN = 10;
const MESSAGE_MAX = 500;

const messageEl = document.getElementById('message');
const emojiEl = document.getElementById('emoji');
const charCountEl = document.getElementById('char-count');
const submitEl = document.getElementById('submit');
const clearEl = document.getElementById('clear');
const bannerEl = document.getElementById('banner');
const logEl = document.getElementById('log');

if (!(messageEl instanceof HTMLTextAreaElement)) throw new Error('#message missing');
if (!(emojiEl instanceof HTMLInputElement)) throw new Error('#emoji missing');
if (!(charCountEl instanceof HTMLParagraphElement)) throw new Error('#char-count missing');
if (!(submitEl instanceof HTMLButtonElement)) throw new Error('#submit missing');
if (!(clearEl instanceof HTMLButtonElement)) throw new Error('#clear missing');
if (!(bannerEl instanceof HTMLParagraphElement)) throw new Error('#banner missing');
if (!(logEl instanceof HTMLDivElement)) throw new Error('#log missing');

let pollTimer = null;
let submitting = false;

function stopPolling() {
  if (pollTimer != null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function syncCharCount() {
  const n = messageEl.value.length;
  charCountEl.textContent = `${n} / ${MESSAGE_MAX}`;
}

function syncSubmitEnabled() {
  if (submitting) {
    submitEl.disabled = true;
    return;
  }
  const len = messageEl.value.trim().length;
  const okLen = len >= MESSAGE_MIN && len <= MESSAGE_MAX;
  const okEmoji = Boolean(emojiEl.value.trim());
  submitEl.disabled = !(okLen && okEmoji);
}

function setEmojiChoice(emojiId) {
  emojiEl.value = emojiId;

  document.querySelectorAll('.emoji-choice').forEach((btn) => {
    if (!(btn instanceof HTMLButtonElement)) return;
    btn.classList.toggle('is-selected', btn.dataset.emojiId === emojiId);
  });
  syncSubmitEnabled();
}

document.querySelectorAll('.emoji-choice').forEach((btn) => {
  if (!(btn instanceof HTMLButtonElement)) return;
  btn.addEventListener('click', () => {
    const id = btn.dataset.emojiId ?? '';
    setEmojiChoice(id);
  });
});

messageEl.addEventListener('input', () => {
  syncCharCount();
  syncSubmitEnabled();
});
syncCharCount();
syncSubmitEnabled();

clearEl.addEventListener('click', () => {
  messageEl.value = '';
  syncCharCount();
  setEmojiChoice('');
  bannerEl.textContent = '';
  bannerEl.classList.remove('error');
  logEl.innerHTML = '';
  stopPolling();
});

submitEl.addEventListener('click', async () => {
  bannerEl.classList.remove('error');
  bannerEl.textContent = '';
  logEl.innerHTML = '';
  stopPolling();

  const message = messageEl.value.trim();
  const emoji = emojiEl.value.trim();

  const len = message.length;
  if (len < MESSAGE_MIN || len > MESSAGE_MAX) {
    bannerEl.classList.add('error');
    bannerEl.textContent =
      len < MESSAGE_MIN
        ? `Message needs at least ${MESSAGE_MIN} characters (${len} now).`
        : `Message must be at most ${MESSAGE_MAX} characters (${len} now).`;
    return;
  }

  if (!emoji) {
    bannerEl.classList.add('error');
    bannerEl.textContent = 'Choose a mood emoji (tap a face).';
    return;
  }

  submitting = true;
  submitEl.disabled = true;
  try {
    const res = await fetch('submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, emoji }),
    });

    if (!res.ok) {
      const err = await readError(res);
      throw new Error(err);
    }

    const data = await res.json();
    const requestId = data && typeof data === 'object' ? data.requestId : null;
    if (typeof requestId !== 'string') {
      throw new Error('Unexpected response from /submit');
    }

    /** Empty on purpose — status is in the step log only (avoids stale “Accepted…” copy). */
    bannerEl.textContent = '';
    startPolling(requestId);
  } catch (err) {
    bannerEl.classList.add('error');
    bannerEl.textContent = err instanceof Error ? err.message : String(err);
  } finally {
    submitting = false;
    syncSubmitEnabled();
  }
});

function startPolling(requestId) {
  stopPolling();

  void refreshOnce(requestId);
  pollTimer = window.setInterval(() => {
    void refreshOnce(requestId);
  }, 1000);
}

async function refreshOnce(requestId) {
  const res = await fetch(`logs/${encodeURIComponent(requestId)}`);
  if (!res.ok) return;
  const body = await res.json();
  if (!body || typeof body !== 'object' || !Array.isArray(body.steps)) return;
  renderSteps(body.steps, requestId);

  if (body.finishedAt != null) {
    stopPolling();
  }
}

function renderSteps(steps, requestId) {
  const frag = document.createDocumentFragment();

  const rid = document.createElement('div');
  rid.className = 'log-request-id mono subtle';
  rid.textContent = `requestId: ${requestId}`;
  frag.appendChild(rid);

  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const kind = String(step.kind ?? 'step');
    const status = String(step.status ?? 'pending');
    const message = String(step.message ?? '');
    const attempt = typeof step.attempt === 'number' ? ` · attempt ${step.attempt}` : '';

    const row = document.createElement('div');
    row.className = 'step';
    row.dataset.status = status;
    if (kind === 'openai_process') {
      row.classList.add('step--openai');
    }

    const title = document.createElement('strong');
    title.textContent = `${prettyKind(kind)} · ${status}`;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${message}${attempt}`;

    row.appendChild(title);
    row.appendChild(meta);

    const ai = step.ai;
    if (ai && typeof ai === 'object') {
      const companion =
        typeof ai.companionNote === 'string' ? ai.companionNote : '';
      const cleaned = typeof ai.cleanedMessage === 'string' ? ai.cleanedMessage : '';
      const mood = typeof ai.interpretedMood === 'string' ? ai.interpretedMood : '';
      if (companion || cleaned || mood) {
        const preview = document.createElement('div');
        preview.className = 'ai-preview';
        const label = document.createElement('span');
        label.className = 'ai-preview-label';
        label.textContent = 'OpenAI response';
        const text = document.createElement('p');
        text.className = 'ai-preview-text';
        text.textContent = companion || cleaned;
        const refined = document.createElement('p');
        refined.className = 'ai-preview-refined';
        refined.textContent = cleaned && companion ? `Versión clara: ${cleaned}` : '';
        const sub = document.createElement('p');
        sub.className = 'ai-preview-mood';
        sub.textContent = mood ? `Tono: ${mood}` : '';
        preview.appendChild(label);
        preview.appendChild(text);
        if (refined.textContent) preview.appendChild(refined);
        preview.appendChild(sub);
        row.appendChild(preview);
      }
    }

    frag.appendChild(row);
  }

  logEl.innerHTML = '';
  logEl.appendChild(frag);
}

function prettyKind(kind) {
  switch (kind) {
    case 'validate_input':
      return 'Validate input';
    case 'openai_process':
      return 'OpenAI';
    case 'google_sheets_append':
      return 'Google Sheets';
    case 'slack_notify':
      return 'Slack';
    default:
      return kind;
  }
}

async function readError(res) {
  try {
    const text = await res.text();
    try {
      const json = JSON.parse(text);
      if (json && typeof json === 'object' && typeof json.error === 'string') return json.error;
    } catch {
      // ignore
    }
    return text.slice(0, 400) || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
