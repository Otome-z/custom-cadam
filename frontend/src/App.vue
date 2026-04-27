<template>
  <div class="app-shell">
    <div class="ambient ambient-a"></div>
    <div class="ambient ambient-b"></div>

    <main class="layout">
      <section class="panel panel-form">
        <div class="eyebrow">sub-cadam</div>
        <h1>参数化文生模型最小闭环</h1>
        <p class="intro">
          这里保留一条最短链路：输入文案（可附带参考图片），后端请求 OpenRouter
          生成 OpenSCAD，前端 worker 编译 STL，并在右侧直接预览。
        </p>

        <form class="prompt-form" @submit.prevent="generateModel">
          <label class="field-label" for="prompt">描述你的模型</label>
          <textarea
            id="prompt"
            v-model="prompt"
            class="prompt-input"
            rows="8"
            placeholder="例如：生成一个参数化纱线面，由 12 根圆柱形纱线并排组成，单根直径 2mm，长度 120mm，相邻间距 1mm。"
          />
          <div class="upload-row">
            <label class="ghost-button upload-button" for="reference-image">
              {{ selectedImageName ? '更换参考图' : '上传参考图（可选）' }}
            </label>
            <input
              id="reference-image"
              class="file-input"
              type="file"
              accept="image/*"
              @change="onImagePicked"
            />
            <span v-if="selectedImageName" class="image-name">
              {{ selectedImageName }}
            </span>
            <button
              v-if="selectedImageName"
              class="ghost-button"
              type="button"
              @click="clearImage"
            >
              清空图片
            </button>
          </div>

          <div class="actions">
            <button class="primary-button" type="submit" :disabled="isGenerating">
              {{ isGenerating ? '生成中...' : '生成模型' }}
            </button>
            <button
              v-if="code"
              class="ghost-button"
              type="button"
              @click="copyCode"
            >
              {{ copied ? '已复制代码' : '复制 OpenSCAD' }}
            </button>
            <button
              v-if="code || previewError"
              class="ghost-button"
              type="button"
              :disabled="isGenerating"
              @click="generateModel"
            >
              {{ isGenerating ? '重新创建中...' : '重新创建' }}
            </button>
            <a
              v-if="downloadUrl"
              class="ghost-button"
              :href="downloadUrl"
              :download="downloadFilename"
            >
              下载 STL
            </a>
          </div>
        </form>

        <p v-if="requestError" class="status status-error">{{ requestError }}</p>
        <p v-else-if="lastPrompt" class="status">
          最近一次请求：{{ lastPrompt }}
        </p>

        <section
          v-if="streamStatusMessages.length || streamThinking || streamResultPreview || finalScadCode"
          class="subpanel stream-panel"
        >
          <div class="subpanel-header">
            <h2>生成流</h2>
            <span>{{ isGenerating ? 'streaming' : 'completed' }}</span>
          </div>

          <div v-if="streamStatusMessages.length" class="stream-section">
            <h3>状态</h3>
            <ul class="stream-list">
              <li v-for="(message, index) in streamStatusMessages" :key="`${index}-${message}`">
                {{ message }}
              </li>
            </ul>
          </div>

          <div v-if="streamThinking" class="stream-section">
            <h3>思考</h3>
            <pre class="stream-block">{{ streamThinking }}</pre>
          </div>

          <div v-if="streamResultPreview" class="stream-section">
            <h3>结果流</h3>
            <pre class="stream-block">{{ streamResultPreview }}</pre>
          </div>

          <div v-if="finalScadCode" class="stream-section">
            <h3>最终 OpenSCAD（用于生成）</h3>
            <pre class="stream-block">{{ finalScadCode }}</pre>
          </div>
        </section>

        <section v-if="editableParameters.length" class="subpanel">
          <div class="subpanel-header">
            <h2>参数</h2>
            <span>{{ editableParameters.length }} editable</span>
          </div>

          <div class="parameter-grid">
            <article
              v-for="parameter in editableParameters"
              :key="parameter.name"
              class="parameter-card"
            >
              <div class="parameter-meta">
                <strong>{{ parameter.displayName }}</strong>
                <span>{{ parameter.name }}</span>
              </div>

              <p v-if="parameter.description" class="parameter-description">
                {{ parameter.description }}
              </p>

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
                <input
                  type="checkbox"
                  :checked="Boolean(parameter.value)"
                  @change="setBooleanParameter(parameter.name, $event)"
                />
                <span>{{ Boolean(parameter.value) ? 'true' : 'false' }}</span>
              </label>
            </article>
          </div>
        </section>

        <section v-if="readonlyParameters.length" class="subpanel">
          <div class="subpanel-header">
            <h2>只读参数</h2>
            <span>{{ readonlyParameters.length }} complex</span>
          </div>
          <p class="readonly-note">
            当前版本为了流程简单，只开放 number / string / boolean 参数编辑。
          </p>
          <div class="readonly-list">
            <span
              v-for="parameter in readonlyParameters"
              :key="parameter.name"
              class="readonly-chip"
            >
              {{ parameter.name }}
            </span>
          </div>
        </section>

        <section v-if="code" class="subpanel code-panel">
          <div class="subpanel-header">
            <h2>OpenSCAD</h2>
            <span>{{ codeLineCount }} lines</span>
          </div>
          <pre class="code-block">{{ code }}</pre>
        </section>
      </section>

      <section class="panel panel-preview">
        <div class="preview-header">
          <div>
            <div class="eyebrow">Preview</div>
            <h2>Worker 编译结果</h2>
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
          :loading="isGenerating || isCompiling"
          :error="previewError"
          :show-recreate="Boolean(previewError)"
          @recreate="generateModel"
        />
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import ModelViewer from '@/components/ModelViewer.vue';
import { useOpenScadPreview } from '@/composables/useOpenScadPreview';
import { parseParameters } from '@/utils/parseParameters';
import type { GenerateRequest, GenerateResponse, Parameter } from '@/types';

const prompt = ref(
  '生成一个参数化纱线面，由 12 根圆柱形纱线并排组成，单根直径 2mm，长度 120mm，相邻间距 1mm。',
);
const code = ref('');
const parameters = ref<Parameter[]>([]);
const isGenerating = ref(false);
const requestError = ref('');
const copied = ref(false);
const lastPrompt = ref('');
const downloadUrl = ref<string | null>(null);
const referenceImageDataUrl = ref('');
const selectedImageName = ref('');
const streamStatusMessages = ref<string[]>([]);
const streamThinking = ref('');
const streamResultPreview = ref('');
const finalScadCode = ref('');

const { geometry, output, error: previewError, isCompiling } = useOpenScadPreview(
  code,
  parameters,
);

const editableParameters = computed(() =>
  parameters.value.filter((parameter) =>
    ['number', 'string', 'boolean'].includes(parameter.type),
  ),
);

const readonlyParameters = computed(() =>
  parameters.value.filter((parameter) =>
    !['number', 'string', 'boolean'].includes(parameter.type),
  ),
);

const codeLineCount = computed(() =>
  code.value ? code.value.split(/\r?\n/).length : 0,
);

const downloadFilename = computed(() => {
  const slug = (lastPrompt.value || 'sub-cadam-model')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `${slug || 'sub-cadam-model'}.stl`;
});

watch(output, (nextBlob) => {
  if (downloadUrl.value) {
    URL.revokeObjectURL(downloadUrl.value);
    downloadUrl.value = null;
  }

  if (nextBlob) {
    downloadUrl.value = URL.createObjectURL(nextBlob);
  }
});

watch(code, (nextCode) => {
  parameters.value = nextCode ? parseParameters(nextCode) : [];
});

async function generateModel() {
  const trimmedPrompt = prompt.value.trim();
  if (!trimmedPrompt) {
    requestError.value = '请输入一段模型描述。';
    return;
  }

  isGenerating.value = true;
  requestError.value = '';
  copied.value = false;
  streamStatusMessages.value = ['请求已发送，等待后端响应...'];
  streamThinking.value = '';
  streamResultPreview.value = '';
  finalScadCode.value = '';

  try {
    const response = await fetch('/api/generate/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(<GenerateRequest>{
        prompt: trimmedPrompt,
        imageDataUrl: referenceImageDataUrl.value || undefined,
      }),
    });

    if (!response.ok) {
      throw new Error('流式生成请求失败。');
    }

    if (!response.body) {
      throw new Error('浏览器不支持流式响应。');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      let splitIndex = buffer.indexOf('\n\n');

      while (splitIndex !== -1) {
        const block = buffer.slice(0, splitIndex);
        buffer = buffer.slice(splitIndex + 2);
        handleSseBlock(block);
        splitIndex = buffer.indexOf('\n\n');
      }
    }

    if (buffer.trim()) {
      handleSseBlock(buffer);
    }
  } catch (error) {
    requestError.value =
      error instanceof Error ? error.message : '生成请求失败。';
  } finally {
    isGenerating.value = false;
  }
}

function handleSseBlock(block: string) {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    return;
  }

  const eventLine = lines.find((line) => line.startsWith('event:'));
  const dataLine = lines.find((line) => line.startsWith('data:'));
  if (!eventLine || !dataLine) {
    return;
  }

  const event = eventLine.replace(/^event:\s*/, '');
  const payloadText = dataLine.replace(/^data:\s*/, '');
  let payload: Record<string, unknown> = {};

  try {
    payload = JSON.parse(payloadText);
  } catch {
    return;
  }

  if (event === 'status' && typeof payload.message === 'string') {
    streamStatusMessages.value.push(payload.message);
    return;
  }

  if (event === 'thinking_delta' && typeof payload.chunk === 'string') {
    streamThinking.value += payload.chunk;
    return;
  }

  if (event === 'result_delta' && typeof payload.chunk === 'string') {
    streamResultPreview.value += payload.chunk;
    return;
  }

  if (event === 'done') {
    const donePayload = payload as GenerateResponse;
    if (typeof donePayload.code === 'string') {
      const cleanCode = sanitizeOpenScadCode(donePayload.code);
      code.value = cleanCode;
      finalScadCode.value = cleanCode;
    }
    if (typeof donePayload.prompt === 'string') {
      lastPrompt.value = donePayload.prompt;
    }
    streamStatusMessages.value.push('生成完成。');
    return;
  }

  if (event === 'error' && typeof payload.error === 'string') {
    requestError.value = payload.error;
    streamStatusMessages.value.push('生成失败。');
  }
}

function sanitizeOpenScadCode(rawCode: string) {
  return rawCode
    .replace(/^```(?:openscad|scad)?\s*\n?/i, '')
    .replace(/\n?```$/i, '')
    .replace(/```(?:openscad|scad)?/gi, '')
    .replace(/```/g, '')
    .trim();
}

function onImagePicked(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    return;
  }

  if (!file.type.startsWith('image/')) {
    requestError.value = '仅支持上传图片文件。';
    clearImage();
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    if (typeof reader.result !== 'string') {
      requestError.value = '图片读取失败，请重试。';
      return;
    }

    referenceImageDataUrl.value = reader.result;
    selectedImageName.value = file.name;
    requestError.value = '';
  };
  reader.onerror = () => {
    requestError.value = '图片读取失败，请重试。';
  };
  reader.readAsDataURL(file);
}

function clearImage() {
  referenceImageDataUrl.value = '';
  selectedImageName.value = '';
  const input = document.getElementById('reference-image') as HTMLInputElement | null;
  if (input) {
    input.value = '';
  }
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

function updateParameterValue(
  parameterName: string,
  nextValue: Parameter['value'],
) {
  parameters.value = parameters.value.map((parameter) =>
    parameter.name === parameterName
      ? { ...parameter, value: nextValue }
      : parameter,
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

onBeforeUnmount(() => {
  if (downloadUrl.value) {
    URL.revokeObjectURL(downloadUrl.value);
  }
});
</script>
