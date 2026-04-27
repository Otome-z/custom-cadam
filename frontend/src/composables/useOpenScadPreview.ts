import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import type { BufferGeometry } from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { Parameter } from '@/types';
import { WorkerMessageType, type WorkerMessage, type WorkerResponseMessage } from '@/worker/types';


function cloneParameters(parameters: Parameter[]): Parameter[] {
  return structuredClone(parameters);
}

function normalizeWorkerError(response: WorkerResponseMessage): Error {
  const message = response.err?.stdErr?.join('\n').trim()
    || response.err?.message
    || 'OpenSCAD 编译失败。';
  return new Error(message);
}

export function useOpenScadPreview(
  code: Ref<string>,
  params: Ref<Parameter[]>,
) {
  const geometry = ref<BufferGeometry | null>(null);
  const output = ref<Blob | null>(null);
  const error = ref<Error | null>(null);
  const isCompiling = ref(false);

  const loader = new STLLoader();
  const worker = new Worker(new URL('../worker/worker.ts', import.meta.url), { type: 'module' });
  let activeRequestId: string | null = null;

  const clearGeometry = () => {
    geometry.value?.dispose();
    geometry.value = null;
  };

  const compile = () => {
    const source = code.value.trim();
    if (!source) {
      activeRequestId = null;
      output.value = null;
      clearGeometry();
      error.value = null;
      isCompiling.value = false;
      return;
    }

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    activeRequestId = requestId;
    isCompiling.value = true;
    error.value = null;

    const payload: WorkerMessage = {
      id: requestId,
      type: WorkerMessageType.PREVIEW,
      data: {
        code: source,
        fileType: 'stl',
        params: cloneParameters(params.value),
      },
    };

    worker.postMessage(payload);
  };

  worker.onmessage = (event: MessageEvent<WorkerResponseMessage>) => {
    const response = event.data;

    if (response.id !== activeRequestId) {
      return;
    }

    isCompiling.value = false;

    if (response.err || !response.data) {
      output.value = null;
      clearGeometry();
      error.value = normalizeWorkerError(response);
      return;
    }

    try {
      const stlBytes = new Uint8Array(response.data.output);
      const nextGeometry = loader.parse(stlBytes.buffer);
      nextGeometry.computeVertexNormals();

      clearGeometry();
      geometry.value = nextGeometry;
      output.value = new Blob([stlBytes], { type: 'model/stl' });
      error.value = null;
    } catch (parseError) {
      output.value = null;
      clearGeometry();
      error.value = parseError instanceof Error
        ? parseError
        : new Error('无法解析 OpenSCAD 输出的 STL。');
    }
  };

  worker.onerror = (workerError) => {
    isCompiling.value = false;
    output.value = null;
    clearGeometry();
    error.value = new Error(workerError.message || 'OpenSCAD worker 执行失败。');
  };

  watch(
    [() => code.value, () => JSON.stringify(params.value)],
    () => {
      window.requestAnimationFrame(compile);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    worker.terminate();
    clearGeometry();
  });

  return {
    geometry: computed(() => geometry.value),
    output: computed(() => output.value),
    error: computed(() => error.value),
    isCompiling: computed(() => isCompiling.value),
    recompile: compile,
  };
}
