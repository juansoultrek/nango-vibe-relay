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
};

export type RequestLogSnapshot = {
  requestId: string;
  steps: LogStep[];
  finishedAt?: string;
};

export type SubmitBody = {
  message: unknown;
  emoji: unknown;
};

export type AiResult = {
  cleanedMessage: string;
  interpretedMood: string;
};
