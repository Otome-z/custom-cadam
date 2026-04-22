import type { Parameter } from '@/types';

export const enum WorkerMessageType {
  PREVIEW = 'preview',
}

export type OpenScadWorkerPayload = {
  code: string;
  fileType: 'stl';
  params: Parameter[];
};

export type OpenScadWorkerResult = {
  output: Uint8Array;
  fileType: 'stl';
  exitCode: number;
  duration: number;
  log: {
    stdErr: string[];
    stdOut: string[];
  };
};

export type WorkerMessage = {
  id: string;
  type: WorkerMessageType.PREVIEW;
  data: OpenScadWorkerPayload;
};

export type WorkerResponseMessage = {
  id: string;
  type: WorkerMessageType.PREVIEW;
  data: OpenScadWorkerResult | null;
  err?: {
    name?: string;
    message?: string;
    code?: string;
    stdErr?: string[];
  };
};

