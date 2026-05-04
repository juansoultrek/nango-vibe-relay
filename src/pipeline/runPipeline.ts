import { LogStore } from '../logging/logStore';
import { runOpenAi } from '../services/aiService';
import { appendRowToSheet } from '../services/googleSheetsService';
import { postSlackSummary } from '../services/slackService';

export async function runPipeline(
  logStore: LogStore,
  requestId: string,
  messageRaw: string,
  emojiRaw: string,
): Promise<void> {
  try {
    const message = messageRaw.trim();
    const emoji = emojiRaw.trim();

    logStore.mergeStep(requestId, 'validate_input', { status: 'running', message: 'Validating payload' });

    const validation = logStore.validateMessage(message);
    if (!validation.ok) {
      logStore.mergeStep(requestId, 'validate_input', {
        status: 'error',
        message: validation.error,
      });
      logStore.markFinished(requestId);
      return;
    }

    const emojiValidation = logStore.validateEmoji(emoji);
    if (!emojiValidation.ok) {
      logStore.mergeStep(requestId, 'validate_input', {
        status: 'error',
        message: emojiValidation.error,
      });
      logStore.markFinished(requestId);
      return;
    }

    logStore.mergeStep(requestId, 'validate_input', { status: 'success', message: 'Payload looks good' });

    logStore.mergeStep(requestId, 'openai_process', { status: 'running', message: 'Calling OpenAI' });
    const ai = await runOpenAi(message, emoji);
    if (!ai.ok) {
      logStore.mergeStep(requestId, 'openai_process', {
        status: 'error',
        message: ai.detail,
      });
      logStore.markFinished(requestId);
      return;
    }

    logStore.mergeStep(requestId, 'openai_process', {
      status: 'success',
      message: `Interpreted mood: ${ai.data.interpretedMood}`,
    });

    const timestampIso = new Date().toISOString();

    const sheetsOk = await runSheetsWithRetries(logStore, requestId, {
      emoji,
      originalMessage: message,
      cleanedMessage: ai.data.cleanedMessage,
      interpretedMood: ai.data.interpretedMood,
      timestampIso,
    });

    if (!sheetsOk) {
      logStore.mergeStep(requestId, 'slack_notify', {
        status: 'error',
        message: 'Skipped because Google Sheets did not succeed',
      });
      logStore.markFinished(requestId);
      return;
    }

    const snapshot = `${emoji} *${ai.data.interpretedMood}*\n${ai.data.cleanedMessage}`;
    await runSlack(logStore, requestId, snapshot);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    logStore.mergeStep(requestId, 'slack_notify', {
      status: 'error',
      message: `Unexpected pipeline error: ${detail}`,
    });
  } finally {
    logStore.markFinished(requestId);
  }
}

async function runSheetsWithRetries(
  logStore: LogStore,
  requestId: string,
  row: {
    originalMessage: string;
    emoji: string;
    cleanedMessage: string;
    interpretedMood: string;
    timestampIso: string;
  },
): Promise<boolean> {
  const attempts = [1, 2, 3] as const;
  for (const attempt of attempts) {
    const isRetry = attempt > 1;
    logStore.mergeStep(requestId, 'google_sheets_append', {
      status: isRetry ? 'retry' : 'running',
      attempt,
      message: isRetry ? `Retrying Sheets append (${attempt}/3)` : 'Appending row via Nango proxy',
    });

    const res = await appendRowToSheet(row);
    if (res.ok) {
      logStore.mergeStep(requestId, 'google_sheets_append', {
        status: 'success',
        attempt,
        message: 'Google Sheets append succeeded',
      });
      return true;
    }

    const terminal = attempt === attempts.length;
    if (terminal) {
      logStore.mergeStep(requestId, 'google_sheets_append', {
        status: 'error',
        attempt,
        message: res.detail,
      });
      return false;
    }

    await new Promise((r) => setTimeout(r, 250 * attempt));
  }

  return false;
}

async function runSlack(logStore: LogStore, requestId: string, snapshot: string): Promise<void> {
  logStore.mergeStep(requestId, 'slack_notify', { status: 'running', message: 'Posting Slack message' });

  const res = await postSlackSummary(snapshot);
  if (!res.ok) {
    logStore.mergeStep(requestId, 'slack_notify', { status: 'error', message: res.detail });
    return;
  }

  logStore.mergeStep(requestId, 'slack_notify', { status: 'success', message: 'Posted to Slack channel' });
}
