<template>
  <div class="app-shell">
    <div class="ambient ambient-a"></div>
    <div class="ambient ambient-b"></div>

    <main class="layout">
      <section class="panel panel-form">
        <div class="eyebrow">配置</div>

        <div class="mode-row">
          <button
            class="ghost-button"
            :class="{ 'mode-active': activeMode === 'llm' }"
            type="button"
            @click="activeMode = 'llm'"
          >
            文生模型
          </button>
          <button
            class="ghost-button"
            :class="{ 'mode-active': activeMode === 'direct' }"
            type="button"
            @click="activeMode = 'direct'"
          >
            直接 OpenSCAD
          </button>
        </div>

        <form v-if="activeMode === 'llm'" class="prompt-form" @submit.prevent="generateModelStreamFromPrompt">
          <label class="field-label" for="prompt">描述你的模型</label>
          <textarea
            id="prompt"
            v-model="prompt"
            class="prompt-input"
            rows="8"
            placeholder="例如：生成一个参数化纱线面，由 12 根圆柱形纱线并排组成。"
          />

          <label class="field-label" for="image">上传参考图片（可选）</label>
          <input id="image" class="parameter-input" type="file" accept="image/*" @change="handleImageUpload" />
          <p v-if="uploadedImageName" class="status">已上传：{{ uploadedImageName }}</p>

          <div class="actions">
            <button class="primary-button" type="submit" :disabled="isGenerating">
              {{ isGenerating ? '生成中...' : '生成模型' }}
            </button>
            <button v-if="code" class="ghost-button" type="button" @click="copyCode">
              {{ copied ? '已复制代码' : '复制 OpenSCAD' }}
            </button>
          </div>
        </form>

        <form v-else class="prompt-form" @submit.prevent="applyDirectScad">
          <label class="field-label" for="direct-scad">直接粘贴 OpenSCAD</label>
          <textarea
            id="direct-scad"
            v-model="directScad"
            class="prompt-input"
            rows="10"
            placeholder="例如：cylinder(h = 120, r = 20, center = true, $fn = 128);"
          />
          <div class="actions">
            <button class="primary-button" type="submit">应用到预览</button>
            <button class="ghost-button" type="button" @click="copyCode" :disabled="!code">
              {{ copied ? '已复制代码' : '复制 OpenSCAD' }}
            </button>
          </div>

          <label class="field-label" for="done-payload-json">直接粘贴 donePayload JSON</label>
          <textarea
            id="done-payload-json"
            v-model="donePayloadJsonInput"
            class="prompt-input"
            rows="6"
            placeholder='粘贴 JSON.stringify(donePayload) 的结果'
          />
          <div class="actions">
            <button class="primary-button" type="button" @click="generateFromDonePayloadString">
              通过 donePayload 生成
            </button>
          </div>
          <p v-if="donePayloadError" class="status status-error">{{ donePayloadError }}</p>
        </form>

        <p v-if="requestError" class="status status-error">{{ requestError }}</p>
        <p v-if="!requestError && lastPrompt" class="status">最近一次请求：{{ lastPrompt }}</p>

        <section class="subpanel">
          <div class="subpanel-header">
            <h2>导出模型</h2>
            <span>3ds Max 二次编辑</span>
          </div>
          <p class="status">支持 three.js 导出器格式，可直接下载后导入 3ds Max。</p>
          <div class="export-row">
            <select v-model="selectedExportFormat" class="parameter-input export-select">
              <option v-for="option in exportFormatOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
            <button
              class="primary-button"
              type="button"
              :disabled="(!geometry && !hasWovenCatalogTag && !isYarnPathCollection) || isExporting"
              @click="downloadExportedModel"
            >
              {{ isExporting ? '导出中...' : '下载导出文件' }}
            </button>
          </div>
          <p class="status">{{ selectedExportHint }}</p>
          <p v-if="exportError" class="status status-error">{{ exportError }}</p>
        </section>

        <section v-if="thinkingText" class="subpanel code-panel">
          <div class="subpanel-header">
            <h2>思考过程</h2>
            <button class="ghost-button compact" type="button" @click="showThinking = !showThinking">
              {{ showThinking ? '隐藏' : '展示' }}
            </button>
          </div>
          <pre v-if="showThinking" class="code-block">{{ thinkingText }}</pre>
        </section>

        <section v-if="code" class="subpanel code-panel">
          <div class="subpanel-header">
            <h2>OpenSCAD 结果</h2>
            <span>{{ codeLineCount }} lines</span>
          </div>
          <pre class="code-block">{{ code }}</pre>
        </section>

        <section v-if="editableParameters.length" class="subpanel">
          <div class="subpanel-header">
            <h2>参数</h2>
            <span>{{ editableParameters.length }} editable</span>
          </div>
          <div class="parameter-grid">
            <article v-for="parameter in editableParameters" :key="parameter.name" class="parameter-card">
              <div class="parameter-meta">
                <strong>{{ parameter.displayName }}</strong>
                <span>{{ parameter.name }}</span>
              </div>
              <input
                v-if="parameter.type === 'number'"
                class="parameter-input"
                type="number"
                :min="parameter.range?.min"
                :max="parameter.range?.max"
                :step="parameter.range?.step ?? 1"
                :value="String(parameter.value)"
                @input="setNumberParameter(parameter.name, $event)"
              />
              <input
                v-else-if="parameter.type === 'string'"
                class="parameter-input"
                type="text"
                :value="String(parameter.value)"
                @input="setStringParameter(parameter.name, $event)"
              />
              <label v-else class="checkbox-row">
                <input type="checkbox" :checked="Boolean(parameter.value)" @change="setBooleanParameter(parameter.name, $event)" />
                <span>{{ Boolean(parameter.value) ? 'true' : 'false' }}</span>
              </label>
            </article>
          </div>
        </section>

        <section v-if="isYarnPathCollection" class="subpanel">
          <div class="subpanel-header">
            <h2>线条编辑</h2>
            <span>{{ yarnLines.length }} lines</span>
          </div>

          <div class="parameter-grid">
            <article v-for="line in yarnLines" :key="line.id" class="parameter-card">
              <div class="parameter-meta">
                <strong>{{ line.name || line.id }}</strong>
                <span>{{ line.type }}</span>
              </div>
              <button class="ghost-button compact" type="button" @click="selectedLineId = line.id">
                选择此线
              </button>
            </article>
          </div>

          <div v-if="selectedLine" class="parameter-grid" style="margin-top: 12px;">
            <article class="parameter-card">
              <div class="parameter-meta">
                <strong>编辑 {{ selectedLine.name || selectedLine.id }}</strong>
                <span>{{ selectedLine.id }}</span>
              </div>
              <label class="field-label">type</label>
              <select class="parameter-input" :value="selectedLine.type" @change="updateLineField(selectedLine.id, 'type', ($event.target as HTMLSelectElement).value)">
                <option value="straight">straight</option>
                <option value="polyline">polyline</option>
                <option value="smoothPolyline">smoothPolyline</option>
                <option value="sine">sine</option>
                <option value="bezier">bezier</option>
              </select>
              <label class="field-label">color</label>
              <input class="parameter-input" type="text" :value="String(selectedLine.color ?? '')" @input="updateLineField(selectedLine.id, 'color', ($event.target as HTMLInputElement).value)" />
              <label class="field-label">yarnDiameter</label>
              <input class="parameter-input" type="number" :value="String(selectedLine.yarnDiameter ?? 1)" step="0.1" @input="updateLineField(selectedLine.id, 'yarnDiameter', Number(($event.target as HTMLInputElement).value))" />
              <label class="field-label">radialSegments</label>
              <input class="parameter-input" type="number" :value="String(selectedLine.radialSegments ?? 64)" step="1" @input="updateLineField(selectedLine.id, 'radialSegments', Number(($event.target as HTMLInputElement).value))" />
              <label class="field-label">pathSegments</label>
              <input class="parameter-input" type="number" :value="String(selectedLine.pathSegments ?? 80)" step="1" @input="updateLineField(selectedLine.id, 'pathSegments', Number(($event.target as HTMLInputElement).value))" />
              <label class="field-label">amplitude</label>
              <input class="parameter-input" type="number" :value="String(selectedLine.amplitude ?? 0)" step="0.1" @input="updateLineField(selectedLine.id, 'amplitude', Number(($event.target as HTMLInputElement).value))" />
              <label class="field-label">period</label>
              <input class="parameter-input" type="number" :value="String(selectedLine.period ?? 8)" step="0.1" @input="updateLineField(selectedLine.id, 'period', Number(($event.target as HTMLInputElement).value))" />
              <label class="field-label">cornerRadius</label>
              <input class="parameter-input" type="number" :value="String(selectedLine.cornerRadius ?? 4)" step="0.1" @input="updateLineField(selectedLine.id, 'cornerRadius', Number(($event.target as HTMLInputElement).value))" />
            </article>
          </div>

          <div v-if="selectedLine" style="margin-top: 12px;">
            <div class="subpanel-header">
              <h2>Points</h2>
              <button class="ghost-button compact" type="button" @click="addLinePoint(selectedLine.id)">新增点</button>
            </div>
            <div class="parameter-grid">
              <article v-for="(point, pointIndex) in selectedLine.points" :key="`${selectedLine.id}-${pointIndex}`" class="parameter-card">
                <div class="parameter-meta">
                  <strong>P{{ pointIndex }}</strong>
                </div>
                <input class="parameter-input" type="number" :value="String(point?.[0] ?? 0)" step="0.1" @input="updateLinePoint(selectedLine.id, pointIndex, 'x', Number(($event.target as HTMLInputElement).value))" />
                <input class="parameter-input" type="number" :value="String(point?.[1] ?? 0)" step="0.1" @input="updateLinePoint(selectedLine.id, pointIndex, 'y', Number(($event.target as HTMLInputElement).value))" />
                <input class="parameter-input" type="number" :value="String(point?.[2] ?? 0)" step="0.1" @input="updateLinePoint(selectedLine.id, pointIndex, 'z', Number(($event.target as HTMLInputElement).value))" />
                <button class="ghost-button compact" type="button" :disabled="(selectedLine.points?.length ?? 0) <= 2" @click="removeLinePoint(selectedLine.id, pointIndex)">
                  删除点
                </button>
              </article>
            </div>
          </div>
        </section>
      </section>

      <section class="panel panel-preview">
        <div class="preview-header">
          <div>
            <div class="eyebrow">预览</div>
          </div>
          <div class="preview-state">
            <span :class="['state-pill', isCompiling ? 'state-busy' : 'state-idle']">
              {{ isCompiling ? 'Compiling' : 'Ready' }}
            </span>
          </div>
        </div>

        <ModelViewer
          ref="modelViewerRef"
          class="viewer"
          :geometry="geometry"
          :code="code"
          :parameters="parameters"
          :model-spec="modelSpec"
          v-model:selected-line-id="selectedLineId"
          :loading="isGenerating || isCompiling"
          :error="previewError"
          :show-recreate="Boolean(previewError)"
          @recreate="generateModelStreamFromLastResult"
        />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import * as THREE from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import ModelViewer from '@/components/ModelViewer.vue';
import { useOpenScadPreview } from '@/composables/useOpenScadPreview';
import { parseParameters } from '@/utils/parseParameters';
import type { Parameter } from '@/types';
import { createWovenTubeGroup } from '@/utils/wovenGeometry';

type StreamDonePayload = {
  prompt: string;
  code: string;
  modelSpec?: any | null;
};

const activeMode = ref<'llm' | 'direct'>('llm');
const prompt = ref('根据图片生成模型');
const directScad = ref('');
const code = ref('');
const modelSpec = ref<any | null>(null);
const selectedLineId = ref<string | null>(null);
const parameters = ref<Parameter[]>([]);
const isGenerating = ref(false);
const requestError = ref('');
const copied = ref(false);
const lastPrompt = ref('');
const thinkingText = ref('');
const showThinking = ref(false);
const imageDataUrl = ref('');
const uploadedImageName = ref('');
const donePayloadJsonInput = ref('');
const donePayloadError = ref('');
const exportError = ref('');
const isExporting = ref(false);
const selectedExportFormat = ref<ExportFormat>('obj');
const modelViewerRef = ref<{ getRenderObject?: () => Object3D | null } | null>(null);

const { geometry, error: previewError, isCompiling } = useOpenScadPreview(code, parameters);

const editableParameters = computed(() =>
  parameters.value.filter((parameter) => ['number', 'string', 'boolean'].includes(parameter.type)),
);
const exportFormatOptions: Array<{ value: ExportFormat; label: string; hint: string }> = [
  { value: 'obj', label: 'OBJ（推荐 3ds Max）', hint: '兼容性最佳，适合导入后继续编辑材质与结构。' },
  { value: 'stl-binary', label: 'STL Binary', hint: '适合几何体打印流程，几乎不包含材质信息。' },
  { value: 'stl-ascii', label: 'STL ASCII', hint: '文本版 STL，文件更大但便于检查。' },
  { value: 'ply-binary', label: 'PLY Binary', hint: '适合网格数据交换，常用于点云/扫描流程。' },
  { value: 'ply-ascii', label: 'PLY ASCII', hint: '文本版 PLY，调试友好但文件较大。' },
  { value: 'glb', label: 'GLB', hint: '单文件 glTF，便于传输；3ds Max 新版本可通过插件导入。' },
  { value: 'gltf', label: 'glTF', hint: 'JSON + 资源格式，适合实时流程交换。' },
];
const selectedExportHint = computed(
  () => exportFormatOptions.find((item) => item.value === selectedExportFormat.value)?.hint ?? '',
);
const hasWovenCatalogTag = computed(() => code.value.includes('catalog_model: woven_yarn_sheet'));
const isYarnPathCollection = computed(() => modelSpec.value?.modelType === 'yarn_path_collection');
const yarnLines = computed(() => (Array.isArray(modelSpec.value?.lines) ? modelSpec.value.lines : []));
const selectedLine = computed(() =>
  yarnLines.value.find((line: any) => line?.id === selectedLineId.value) ?? null,
);

const codeLineCount = computed(() => (code.value ? code.value.split(/\r?\n/).length : 0));


watch(code, (nextCode) => {
  parameters.value = nextCode ? parseParameters(nextCode) : [];
});

watch(geometry, () => {
  exportError.value = '';
});

watch(yarnLines, (lines) => {
  if (!selectedLineId.value) {
    return;
  }
  if (!lines.some((line: any) => line?.id === selectedLineId.value)) {
    selectedLineId.value = null;
  }
});

async function generateModelStream(options: { reuseLastResult?: boolean } = {}) {
  if (activeMode.value !== 'llm') {
    return;
  }

  const trimmedPrompt = prompt.value.trim();
  if (!trimmedPrompt) {
    requestError.value = '请输入一段模型描述。';
    return;
  }

  isGenerating.value = true;
  requestError.value = '';
  donePayloadError.value = '';
  copied.value = false;
  thinkingText.value = '';
  showThinking.value = false;

  try {
    const shouldReuseLastResult = Boolean(options.reuseLastResult && modelSpec.value);
    const response = await fetch('/api/generate-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: trimmedPrompt,
        provider: 'qianwen',
        imageDataUrl: imageDataUrl.value || undefined,
        modelSpec: shouldReuseLastResult ? modelSpec.value : undefined,
        skipModelInference: shouldReuseLastResult,
      }),
    });

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({ error: '生成请求失败。' }));
      throw new Error(payload.error || '生成请求失败。');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const eventMatch = chunk.match(/event:\s*(.+)/);
        const dataMatch = chunk.match(/data:\s*([\s\S]+)/);
        if (!eventMatch || !dataMatch) {
          continue;
        }

        const eventName = eventMatch[1].trim();
        const payload = JSON.parse(dataMatch[1]);

        if (eventName === 'delta') {
          // ignore thinking deltas; only keep final result
          continue;
        }

        if (eventName === 'done') {
          const donePayload = payload as StreamDonePayload;
          console.log('[generate-stream done]', JSON.stringify(donePayload));
          code.value = donePayload.code;
          modelSpec.value = donePayload.modelSpec ?? null;
          if (!Array.isArray(donePayload.modelSpec?.lines)) {
            selectedLineId.value = null;
          }
          lastPrompt.value = donePayload.prompt;
          directScad.value = donePayload.code;
        }

        if (eventName === 'error') {
          throw new Error(payload.error || '流式生成失败。');
        }
      }
    }
  } catch (error) {
    requestError.value = error instanceof Error ? error.message : '生成请求失败。';
  } finally {
    isGenerating.value = false;
  }
}

async function generateFromDonePayloadString() {
  if (activeMode.value !== 'direct') {
    return;
  }

  donePayloadError.value = '';
  requestError.value = '';
  const raw = donePayloadJsonInput.value.trim();
  if (!raw) {
    donePayloadError.value = '请先粘贴 donePayload 的 JSON 字符串。';
    return;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    donePayloadError.value = 'JSON 解析失败，请检查 donePayload 格式。';
    return;
  }

  const providedModelSpec = parsed?.modelSpec && typeof parsed.modelSpec === 'object'
    ? parsed.modelSpec
    : (parsed?.modelType ? parsed : null);
  if (!providedModelSpec) {
    donePayloadError.value = '找不到 modelSpec。请粘贴完整 donePayload JSON。';
    return;
  }

  isGenerating.value = true;
  try {
    const response = await fetch('/api/generate-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: typeof parsed?.prompt === 'string' && parsed.prompt.trim() ? parsed.prompt : 'from donePayload',
        provider: 'qianwen',
        modelSpec: providedModelSpec,
        skipModelInference: true,
      }),
    });

    if (!response.ok || !response.body) {
      const payload = await response.json().catch(() => ({ error: '生成请求失败。' }));
      throw new Error(payload.error || '生成请求失败。');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const eventMatch = chunk.match(/event:\s*(.+)/);
        const dataMatch = chunk.match(/data:\s*([\s\S]+)/);
        if (!eventMatch || !dataMatch) {
          continue;
        }

        const eventName = eventMatch[1].trim();
        const payload = JSON.parse(dataMatch[1]);

        if (eventName === 'done') {
          const donePayload = payload as StreamDonePayload;
          console.log('[generate-stream done]', JSON.stringify(donePayload));
          code.value = donePayload.code;
          modelSpec.value = donePayload.modelSpec ?? null;
          if (!Array.isArray(donePayload.modelSpec?.lines)) {
            selectedLineId.value = null;
          }
          lastPrompt.value = donePayload.prompt;
          directScad.value = donePayload.code;
        }

        if (eventName === 'error') {
          throw new Error(payload.error || '流式生成失败。');
        }
      }
    }
  } catch (error) {
    donePayloadError.value = error instanceof Error ? error.message : '通过 donePayload 生成失败。';
  } finally {
    isGenerating.value = false;
  }
}

function generateModelStreamFromPrompt() {
  return generateModelStream({ reuseLastResult: false });
}

function generateModelStreamFromLastResult() {
  return generateModelStream({ reuseLastResult: true });
}

function applyDirectScad() {
  const trimmed = directScad.value.trim();
  if (!trimmed) {
    requestError.value = '请输入 OpenSCAD 代码。';
    return;
  }

  requestError.value = '';
  thinkingText.value = '';
  code.value = trimmed;
  modelSpec.value = null;
  selectedLineId.value = null;
  lastPrompt.value = '直接 OpenSCAD 模式';
}

async function handleImageUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (!file) {
    imageDataUrl.value = '';
    uploadedImageName.value = '';
    return;
  }

  uploadedImageName.value = file.name;
  imageDataUrl.value = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('图片读取失败。'));
    reader.readAsDataURL(file);
  });
}

async function copyCode() {
  if (!code.value) {
    return;
  }

  await navigator.clipboard.writeText(code.value);
  copied.value = true;
  window.setTimeout(() => {
    copied.value = false;
  }, 1500);
}

function updateParameterValue(parameterName: string, nextValue: Parameter['value']) {
  parameters.value = parameters.value.map((parameter) =>
    parameter.name === parameterName ? { ...parameter, value: nextValue } : parameter,
  );
}

function setNumberParameter(parameterName: string, event: Event) {
  const target = event.target as HTMLInputElement;
  updateParameterValue(parameterName, Number(target.value));
}

function setStringParameter(parameterName: string, event: Event) {
  const target = event.target as HTMLInputElement;
  updateParameterValue(parameterName, target.value);
}

function setBooleanParameter(parameterName: string, event: Event) {
  const target = event.target as HTMLInputElement;
  updateParameterValue(parameterName, target.checked);
}

function updateLineField(lineId: string, field: string, value: unknown) {
  if (!isYarnPathCollection.value || !Array.isArray(modelSpec.value?.lines)) {
    return;
  }

  modelSpec.value = {
    ...modelSpec.value,
    lines: modelSpec.value.lines.map((line: any) =>
      line?.id === lineId ? { ...line, [field]: value } : line,
    ),
  };
}

function updateLinePoint(lineId: string, pointIndex: number, axis: 'x' | 'y' | 'z', value: number) {
  if (!isYarnPathCollection.value || !Number.isFinite(value)) {
    return;
  }

  modelSpec.value = {
    ...modelSpec.value,
    lines: modelSpec.value.lines.map((line: any) => {
      if (line?.id !== lineId) {
        return line;
      }
      const points = Array.isArray(line.points) ? [...line.points] : [];
      const currentPoint = Array.isArray(points[pointIndex]) ? [...points[pointIndex]] : [0, 0, 0];
      while (currentPoint.length < 3) {
        currentPoint.push(0);
      }
      const axisIndex = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
      currentPoint[axisIndex] = value;
      points[pointIndex] = currentPoint;
      return { ...line, points };
    }),
  };
}

function addLinePoint(lineId: string) {
  modelSpec.value = {
    ...modelSpec.value,
    lines: modelSpec.value.lines.map((line: any) => {
      if (line?.id !== lineId) {
        return line;
      }
      const points = Array.isArray(line.points) ? [...line.points] : [];
      const lastPoint = points[points.length - 1];
      const nextPoint = Array.isArray(lastPoint)
        ? [Number(lastPoint[0]) + 10, Number(lastPoint[1]), Number(lastPoint[2] ?? 0)]
        : [0, 0, 0];
      points.push(nextPoint);
      return { ...line, points };
    }),
  };
}

function removeLinePoint(lineId: string, pointIndex: number) {
  modelSpec.value = {
    ...modelSpec.value,
    lines: modelSpec.value.lines.map((line: any) => {
      if (line?.id !== lineId) {
        return line;
      }
      const points = Array.isArray(line.points) ? [...line.points] : [];
      if (points.length <= 2) {
        return line;
      }
      points.splice(pointIndex, 1);
      return { ...line, points };
    }),
  };
}

async function downloadExportedModel() {
  const exportSource = resolveExportSource();
  if (!exportSource) {
    exportError.value = '当前没有可导出的几何体，请先生成模型。';
    return;
  }

  isExporting.value = true;
  exportError.value = '';

  try {
    const { blob, extension } = await exportModelByFormat(exportSource, selectedExportFormat.value);
    const modelName = `model-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${modelName}.${extension}`;
    link.click();
    URL.revokeObjectURL(downloadUrl);
  } catch (error) {
    exportError.value = error instanceof Error ? error.message : '导出失败，请重试。';
  } finally {
    if (isDynamicExportSource(exportSource)) {
      disposeExportObject(exportSource);
    }
    isExporting.value = false;
  }
}

function resolveExportSource(): BufferGeometry | Object3D | null {
  const viewerObject = modelViewerRef.value?.getRenderObject?.();
  if (viewerObject) {
    return viewerObject;
  }

  if (isYarnPathCollection.value) {
    return createYarnPathCollectionExportGroup(modelSpec.value);
  }

  if (geometry.value) {
    return geometry.value;
  }

  if (hasWovenCatalogTag.value) {
    return createWovenTubeGroup(parameters.value, {
      mode: 'export',
      format: selectedExportFormat.value,
    });
  }

  return null;
}

function isDynamicExportSource(exportSource: BufferGeometry | Object3D): exportSource is Object3D {
  return exportSource instanceof THREE.Object3D;
}

function disposeExportObject(object: Object3D) {
  object.traverse((child) => {
    const maybeMesh = child as { geometry?: { dispose?: () => void }; material?: Material | Material[] };
    maybeMesh.geometry?.dispose?.();
    if (Array.isArray(maybeMesh.material)) {
      maybeMesh.material.forEach((material) => material.dispose());
    } else {
      maybeMesh.material?.dispose();
    }
  });
}

type ExportFormat =
  | 'stl-ascii'
  | 'stl-binary'
  | 'obj'
  | 'ply-ascii'
  | 'ply-binary'
  | 'gltf'
  | 'glb';

async function exportModelByFormat(exportSource: BufferGeometry | Object3D, format: ExportFormat) {
  const exportTarget = exportSource instanceof THREE.Object3D ? exportSource : new THREE.Mesh(
    exportSource,
    new THREE.MeshStandardMaterial({ color: '#7a8e2c', roughness: 0.24, metalness: 0.04 }),
  );

  prepareObjectForExport(exportTarget);

  if (format === 'obj') {
    const exporter = new OBJExporter();
    const objTarget = createCleanExportGroup(exportTarget);
    const result = exporter.parse(objTarget as any);
    disposeExportObject(objTarget);
    return { blob: new Blob([result], { type: 'text/plain;charset=utf-8' }), extension: 'obj' };
  }

  if (format === 'stl-ascii' || format === 'stl-binary') {
    const exporter = new STLExporter();
    const binary = format === 'stl-binary';
    const result = exporter.parse(exportTarget as any, { binary });
    return { blob: new Blob([result as BlobPart], { type: 'model/stl' }), extension: 'stl' };
  }

  if (format === 'ply-ascii' || format === 'ply-binary') {
    const exporter = new PLYExporter();
    const binary = format === 'ply-binary';
    const result = await new Promise<string | ArrayBuffer>((resolve) => {
      exporter.parse(exportTarget as any, (output) => resolve(output), { binary });
    });
    return { blob: new Blob([result], { type: 'application/octet-stream' }), extension: 'ply' };
  }

  const exporter = new GLTFExporter();
  const scene = new THREE.Scene();
  scene.add(exportTarget);
  const binary = format === 'glb';
  const result = await new Promise<object | ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      scene as any,
      (output) => resolve(output as object | ArrayBuffer),
      (error) => reject(error),
      { binary },
    );
  });

  if (binary) {
    return { blob: new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' }), extension: 'glb' };
  }
  return {
    blob: new Blob([JSON.stringify(result, null, 2)], { type: 'model/gltf+json' }),
    extension: 'gltf',
  };
}

function prepareObjectForExport(object: Object3D) {
  (object as any).updateMatrixWorld?.(true);
  object.traverse((child) => {
    const mesh = child as any;
    if (!mesh?.isMesh || !mesh.geometry) {
      return;
    }
    if (!mesh.geometry.getAttribute?.('normal')) {
      mesh.geometry.computeVertexNormals?.();
    }
    mesh.geometry.computeBoundingBox?.();
    mesh.geometry.computeBoundingSphere?.();
  });
}

function createCleanExportGroup(source: Object3D) {
  const group = new THREE.Group();
  (source as any).updateMatrixWorld?.(true);

  source.traverse((child) => {
    const mesh = child as any;
    if (!mesh?.isMesh || !mesh.geometry) {
      return;
    }

    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4?.(mesh.matrixWorld);
    if (!geometry.getAttribute?.('normal')) {
      geometry.computeVertexNormals?.();
    }

    const material = Array.isArray(mesh.material)
      ? mesh.material[0]?.clone?.()
      : mesh.material?.clone?.();

    const clonedMesh = new THREE.Mesh(
      geometry,
      material || new THREE.MeshStandardMaterial(),
    );
    (clonedMesh as any).userData = { ...(mesh.userData || {}) };
    group.add(clonedMesh);
  });

  return group;
}

function createYarnPathCollectionExportGroup(spec: any): Object3D {
  const group = new THREE.Group();
  const defaults = spec?.globalDefaults ?? {};
  const lines = Array.isArray(spec?.lines) ? spec.lines : [];

  lines.forEach((line: any) => {
    const points = (Array.isArray(line?.points) ? line.points : [])
      .map((point: any) => Array.isArray(point) ? new THREE.Vector3(Number(point[0]) || 0, Number(point[1]) || 0, Number(point[2]) || 0) : null)
      .filter(Boolean) as THREE.Vector3[];
    if (points.length < 2) {
      return;
    }
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const pathSegments = Math.max(2, Number(line?.pathSegments ?? defaults.pathSegments ?? 80));
    const radialSegments = Math.max(12, Number(line?.radialSegments ?? defaults.radialSegments ?? 64));
    const yarnDiameter = Math.max(0.1, Number(line?.yarnDiameter ?? defaults.yarnDiameter ?? 1));
    const color = typeof line?.color === 'string' ? line.color : (defaults.color || '#d9ddd0');
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(curve, pathSegments, yarnDiameter / 2, radialSegments, false),
      new THREE.MeshStandardMaterial({ color }),
    );
    group.add(mesh);
  });

  return group;
}



</script>
