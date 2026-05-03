import type { LogStep, PipelineStepKind, StepStatus } from '../types';

export type LogStoreSnapshot = {
  requestId: string;
  steps: LogStep[];
  finishedAt?: string;
};

/** In-memory logs keyed by request id (demo-oriented; restarting the server clears history). */

const MIN_MESSAGE_LENGTH = 50;

export class LogStore {
  private logs = new Map<string, LogStep[]>();
  private finished = new Map<string, string>();

  validateMessage(message: string): { ok: true } | { ok: false; error: string } {
    const trimmed = message.trim();
    if (trimmed.length < MIN_MESSAGE_LENGTH) {
      return {
        ok: false,
        error: `message must be at least ${MIN_MESSAGE_LENGTH} characters (${trimmed.length} provided)`,
      };
    }
    return { ok: true };
  }

  createRequest(requestId: string): void {
    this.logs.set(requestId, [
      step('pending', 'validate_input', 'Waiting to validate payload'),
      step('pending', 'openai_process', 'Waiting for AI processing'),
      step('pending', 'google_sheets_append', 'Waiting for Google Sheets append'),
      step('pending', 'slack_notify', 'Waiting for Slack notification'),
    ]);
  }

  get(requestId: string): LogStep[] | undefined {
    return this.logs.get(requestId);
  }

  markFinished(requestId: string): void {
    this.finished.set(requestId, new Date().toISOString());
  }

  isFinished(requestId: string): boolean {
    return this.finished.has(requestId);
  }

  snapshot(requestId: string): LogStoreSnapshot | undefined {
    const steps = this.logs.get(requestId);
    if (!steps) return undefined;
    return {
      requestId,
      steps: steps.map((s) => ({ ...s })),
      finishedAt: this.finished.get(requestId),
    };
  }

  mergeStep(requestId: string, kind: PipelineStepKind, patch: Partial<LogStep>): void {
    const steps = this.logs.get(requestId);
    if (!steps) return;
    const idx = steps.findIndex((s) => s.kind === kind);
    if (idx === -1) return;
    const prev = steps[idx];
    if (!prev) return;
    const next = { ...prev, ...patch, updatedAt: new Date().toISOString() } as LogStep;
    steps[idx] = next;
  }
}

function step(status: StepStatus, kind: PipelineStepKind, message: string): LogStep {
  return {
    id: `${kind}_0`,
    kind,
    status,
    message,
    updatedAt: new Date().toISOString(),
  };
}
