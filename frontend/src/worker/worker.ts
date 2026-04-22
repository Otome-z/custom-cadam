import OpenSCADError from '@/lib/OpenSCADError';
import OpenSCADWrapper from './openSCAD';
import {
  WorkerMessageType,
  type WorkerMessage,
  type WorkerResponseMessage,
} from './types';

const openscad = new OpenSCADWrapper();

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, data } = event.data;

  try {
    const result =
      type === WorkerMessageType.PREVIEW
        ? await openscad.preview(data)
        : null;

    const response: WorkerResponseMessage = {
      id,
      type,
      data: result,
    };

    self.postMessage(response);
  } catch (error) {
    const normalizedError =
      error instanceof OpenSCADError
        ? {
            name: error.name,
            message: error.message,
            code: error.code,
            stdErr: error.stdErr,
          }
        : {
            name: error instanceof Error ? error.name : 'Error',
            message:
              error instanceof Error ? error.message : 'Unknown worker error',
          };

    const response: WorkerResponseMessage = {
      id,
      type,
      data: null,
      err: normalizedError,
    };

    self.postMessage(response);
  }
};

