import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { BufferGeometry } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { Parameter } from '@/types';
import {
  WorkerMessageType,
  type WorkerMessage,
  type WorkerResponseMessage,
} from '@/worker/types';

export function useOpenScadPreview(
  code: Ref<string>,
  params: Ref<Parameter[]>,
) {
  const workerRef = ref<Worker | null>(null);
  const geometry = ref<BufferGeometry | null>(null);
  const output = ref<Blob | null>(null);
  const error = ref<Error | null>(null);
  const isCompiling = ref(false);
  const latestJobId = ref('');
  let compileTimer: number | undefined;

  const handleWorkerMessage = (event: MessageEvent<WorkerResponseMessage>) => {
    const { id, data, err } = event.data;
    if (id !== latestJobId.value) {
      return;
    }

    isCompiling.value = false;

    if (err) {
      console.error('[sub-cadam] OpenSCAD worker error:', err);
      output.value = null;
      geometry.value?.dispose();
      geometry.value = null;
      error.value = new Error(err.message || 'OpenSCAD compilation failed.');
      return;
    }

    if (!data?.output) {
      output.value = null;
      geometry.value?.dispose();
      geometry.value = null;
      error.value = new Error('OpenSCAD worker returned no STL output.');
      return;
    }

    const blob = new Blob([data.output], { type: 'model/stl' });
    output.value = blob;
    error.value = null;

    blob.arrayBuffer().then((buffer) => {
      if (id !== latestJobId.value) {
        return;
      }

      const loader = new STLLoader();
      const nextGeometry = loader.parse(buffer);
      nextGeometry.center();
      nextGeometry.computeVertexNormals();

      geometry.value?.dispose();
      geometry.value = nextGeometry;
    });
  };

  const getWorker = () => {
    if (!workerRef.value) {
      workerRef.value = new Worker(new URL('../worker/worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.value.addEventListener('message', handleWorkerMessage);
    }

    return workerRef.value;
  };

  const compile = () => {
    if (!code.value.trim()) {
      output.value = null;
      geometry.value?.dispose();
      geometry.value = null;
      error.value = null;
      isCompiling.value = false;
      return;
    }

    const worker = getWorker();
    const jobId = `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    latestJobId.value = jobId;
    error.value = null;
    isCompiling.value = true;

    const workerParams = serializeParametersForWorker(params.value);
    console.log('[sub-cadam] OpenSCAD compile params:', workerParams);
    console.log('[sub-cadam] OpenSCAD code length:', code.value.length);

    const message: WorkerMessage = {
      id: jobId,
      type: WorkerMessageType.PREVIEW,
      data: {
        code: code.value,
        params: workerParams,
        fileType: 'stl',
      },
    };

    worker.postMessage(message);
  };

  watch(
    [() => code.value, () => JSON.stringify(params.value)],
    () => {
      window.clearTimeout(compileTimer);
      compileTimer = window.setTimeout(compile, 180);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    window.clearTimeout(compileTimer);
    workerRef.value?.removeEventListener('message', handleWorkerMessage);
    workerRef.value?.terminate();
    workerRef.value = null;
    geometry.value?.dispose();
    geometry.value = null;
  });

  return {
    geometry: computed(() => geometry.value),
    output: computed(() => output.value),
    error: computed(() => error.value),
    isCompiling: computed(() => isCompiling.value),
    recompile: compile,
  };
}

function serializeParametersForWorker(parameters: Parameter[]): Parameter[] {
  return parameters.map((parameter) => ({
    ...parameter,
    value: cloneParameterValue(parameter.value),
    defaultValue: cloneParameterValue(parameter.defaultValue),
    range: parameter.range ? { ...parameter.range } : undefined,
    options: parameter.options
      ? parameter.options.map((option) => ({ ...option }))
      : undefined,
  }));
}

function cloneParameterValue<T extends Parameter['value']>(value: T): T {
  return (Array.isArray(value) ? [...value] : value) as T;
}
