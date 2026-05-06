export type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'retry';

export type PipelineStepKind =
  | 'validate_input'
  | 'openai_process'
  | 'google_sheets_append'
  | 'slack_notify';

export type LogStep = {
  id: string;
  kind: PipelineStepKind;
  status: StepStatus;
  message: string;
  attempt?: number;
  updatedAt: string;
  /** When OpenAI succeeds, surfaced in /logs, popup, and step UI. */
  ai?: {
    cleanedMessage: string;
    interpretedMood: string;
    companionNote: string;
  };
};

export type RequestLogSnapshot = {
  requestId: string;
  steps: LogStep[];
  finishedAt?: string;
};

export type SubmitBody = {
  message: unknown;
  /** Canonical mood-face id from the picker (kebab-case), e.g. star-struck, sob — not a Unicode character. */
  emoji: unknown;
};

export type AiResult = {
  /** Paraphrased journal-style line (for Slack / secondary UI). */
  cleanedMessage: string;
  /** Short mood label (Sheets column “emoji meaning”). */
  interpretedMood: string;
  /** Warm validation + gentle “why” read — main text for popup & Sheets column E. */
  companionNote: string;
};
