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

        <form v-if="activeMode === 'llm'" class="prompt-form" @submit.prevent="generateModelStream">
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
              :disabled="(!geometry && !hasWovenCatalogTag) || isExporting"
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
          class="viewer"
          :geometry="geometry"
          :code="code"
          :parameters="parameters"
          :model-spec="modelSpec"
          :loading="isGenerating || isCompiling"
          :error="previewError"
          :show-recreate="Boolean(previewError)"
          @recreate="generateModelStream"
        />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { BufferGeometry, Material, Object3D } from 'three';
import ModelViewer from '@/components/ModelViewer.vue';
import { useOpenScadPreview } from '@/composables/useOpenScadPreview';
import { parseParameters } from '@/utils/parseParameters';
import type { Parameter } from '@/types';
import { exportPreviewGeometry, type ExportFormat } from '@/utils/exportGeometry';
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
const parameters = ref<Parameter[]>([]);
const isGenerating = ref(false);
const requestError = ref('');
const copied = ref(false);
const lastPrompt = ref('');
const thinkingText = ref('');
const showThinking = ref(false);
const imageDataUrl = ref('');
const uploadedImageName = ref('');
const exportError = ref('');
const isExporting = ref(false);
const selectedExportFormat = ref<ExportFormat>('obj');

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

const codeLineCount = computed(() => (code.value ? code.value.split(/\r?\n/).length : 0));


watch(code, (nextCode) => {
  parameters.value = nextCode ? parseParameters(nextCode) : [];
});

watch(geometry, () => {
  exportError.value = '';
});

async function generateModelStream() {
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
  copied.value = false;
  thinkingText.value = '';
  showThinking.value = false;

  try {
    const response = await fetch('/api/generate-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: trimmedPrompt,
        provider: 'qianwen',
        imageDataUrl: imageDataUrl.value || undefined,
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
          if (payload.type === 'thinking' && payload.text) {
            thinkingText.value += payload.text;
          }
          continue;
        }

        if (eventName === 'done') {
          const donePayload = payload as StreamDonePayload;
          code.value = donePayload.code;
          modelSpec.value = donePayload.modelSpec ?? null;
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

async function downloadExportedModel() {
  const exportSource = resolveExportSource();
  if (!exportSource) {
    exportError.value = '当前没有可导出的几何体，请先生成模型。';
    return;
  }

  isExporting.value = true;
  exportError.value = '';

  try {
    const { blob, extension } = await exportPreviewGeometry(exportSource, selectedExportFormat.value);
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
  return !geometry.value && hasWovenCatalogTag.value;
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



</script>
