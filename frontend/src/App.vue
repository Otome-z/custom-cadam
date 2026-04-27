<template>
  <div class="app-shell">
    <div class="ambient ambient-a"></div>
    <div class="ambient ambient-b"></div>

    <main class="layout">
      <section class="panel panel-form">
        <div class="eyebrow">sub-cadam</div>
        <h1>参数化文生模型最小闭环</h1>
        <p class="intro">
          支持三种链路：纯文本生成、图片+文本生成、以及直接输入 OpenSCAD。
        </p>

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
            <select
              v-model="selectedProvider"
              class="parameter-input provider-select"
              :disabled="isGenerating"
            >
              <option value="qianwen">千问（Qwen）</option>
              <option value="deepseek">DeepSeek v4</option>
            </select>
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
            <div class="eyebrow">Preview</div>
            <h2>Native three.js preview</h2>
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
          :compare-spec="compareSpec"
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
import ModelViewer from '@/components/ModelViewer.vue';
import { useOpenScadPreview } from '@/composables/useOpenScadPreview';
import { parseParameters } from '@/utils/parseParameters';
import type { Parameter } from '@/types';

type StreamDonePayload = {
  prompt: string;
  code: string;
  modelSpec?: { displayName?: string; modelType?: string; summary?: string } | null;
};

const activeMode = ref<'llm' | 'direct'>('llm');
const prompt = ref('生成一个参数化纱线面，由 1 根圆柱形纱线并排组成，单根直径 40mm，长度 120mm。');
const directScad = ref('');
const code = ref('');
const parameters = ref<Parameter[]>([]);
const isGenerating = ref(false);
const requestError = ref('');
const copied = ref(false);
const lastPrompt = ref('');
const selectedProvider = ref<'qianwen' | 'deepseek'>('qianwen');
const thinkingText = ref('');
const showThinking = ref(false);
const imageDataUrl = ref('');
const uploadedImageName = ref('');

const { geometry, error: previewError, isCompiling } = useOpenScadPreview(code, parameters);

const editableParameters = computed(() =>
  parameters.value.filter((parameter) => ['number', 'string', 'boolean'].includes(parameter.type)),
);

const codeLineCount = computed(() => (code.value ? code.value.split(/\r?\n/).length : 0));

const compareSpec = computed(() => {
  const diameter =
    getNumberParam('strand_diameter')
    ?? getNumberParam('yarn_diameter')
    ?? getNumberParam('diameter')
    ?? ((getNumberParam('radius') ?? 20) * 2);
  const height =
    getNumberParam('strand_length')
    ?? getNumberParam('yarn_length')
    ?? getNumberParam('length')
    ?? 120;
  const radialSegments = getNumberParam('radial_segments') ?? getNumberParam('$fn') ?? 64;

  return {
    radius: Math.max(0.1, diameter / 2),
    height: Math.max(0.1, height),
    radialSegments: Math.max(48, Math.round(radialSegments)),
  };
});

watch(code, (nextCode) => {
  parameters.value = nextCode ? parseParameters(nextCode) : [];
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
        provider: selectedProvider.value,
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

function getNumberParam(name: string) {
  const target = parameters.value.find((parameter) => parameter.name === name);
  return target && typeof target.value === 'number' ? target.value : null;
}

</script>
