<template>
  <div class="app-shell">
    <div class="ambient ambient-a"></div>
    <div class="ambient ambient-b"></div>

    <main class="layout">
      <section class="panel panel-form">
        <div class="eyebrow">sub-cadam</div>
        <h1>参数化文生模型最小闭环</h1>
        <p class="intro">
          这里保留一条最短链路：输入文案，后端请求 OpenRouter 生成
          OpenSCAD，前端 worker 编译 STL，并在右侧直接预览。
        </p>

        <form class="prompt-form" @submit.prevent="generateModel">
          <label class="field-label" for="prompt">描述你的模型</label>
          <textarea
            id="prompt"
            v-model="prompt"
            class="prompt-input"
            rows="8"
            placeholder="例如：生成一个带把手的参数化马克杯，杯壁厚度 3mm，杯高 95mm。"
          />

          <div class="image-upload-wrapper">
            <span class="field-label">模型视图（可选，可上传多张）</span>
            <div class="image-upload-grid">
              <div
                v-for="view in imageViewOptions"
                :key="view.key"
                class="image-upload-card"
              >
                <label class="image-view-label" :for="`image-upload-${view.key}`">
                  {{ view.label }}
                </label>
                <div v-if="imageViews[view.key]" class="image-preview">
                  <img
                    :src="imageViews[view.key]"
                    :alt="`${view.label}预览`"
                    class="thumbnail"
                  />
                  <button
                    class="ghost-button remove-image"
                    type="button"
                    @click="removeImage(view.key)"
                  >
                    移除
                  </button>
                </div>
                <input
                  v-else
                  :id="`image-upload-${view.key}`"
                  type="file"
                  accept="image/*"
                  class="image-input"
                  @change="handleImageUpload($event, view.key)"
                />
              </div>
            </div>
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

type ImageViewKey = 'reference' | 'top' | 'left' | 'right' | 'front';
const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const imageViewOptions: Array<{ key: ImageViewKey; label: string }> = [
  { key: 'reference', label: '参考图' },
  { key: 'top', label: '俯视图' },
  { key: 'left', label: '左视图' },
  { key: 'right', label: '右视图' },
  { key: 'front', label: '正视图' },
];

const prompt = ref(
  '根据图片生成',
);
const code = ref('');
const parameters = ref<Parameter[]>([]);
const isGenerating = ref(false);
const requestError = ref('');
const copied = ref(false);
const lastPrompt = ref('');
const downloadUrl = ref<string | null>(null);
const imageViews = ref<Record<ImageViewKey, string>>({
  reference: '',
  top: '',
  left: '',
  right: '',
  front: '',
});

const hasImages = computed(() =>
  imageViewOptions.some((view) => Boolean(imageViews.value[view.key])),
);

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
  if (!trimmedPrompt && !hasImages.value) {
    requestError.value = '请输入一段模型描述或上传图片。';
    return;
  }

  isGenerating.value = true;
  requestError.value = '';
  copied.value = false;

  try {
    const parts: GenerateRequest['contents'][number]['parts'] = [{
      text: trimmedPrompt || 'Convert this image to OpenSCAD code.',
    }];
    for (const view of imageViewOptions) {
      const imageUrl = imageViews.value[view.key];
      if (!imageUrl) {
        continue;
      }

      const match = imageUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (!match) {
        throw new Error(`${view.label}格式无效，请重新上传。`);
      }
      parts.push({ text: `以下图片是模型的${view.label}：` });
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      });
    }

    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
      } satisfies GenerateRequest),
    });

    const payload = (await response.json()) as GenerateResponse & { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || '生成请求失败。');
    }

    code.value = payload.code;
    lastPrompt.value = payload.prompt;
  } catch (error) {
    requestError.value =
      error instanceof Error ? error.message : '生成请求失败。';
  } finally {
    isGenerating.value = false;
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

function handleImageUpload(event: Event, viewKey: ImageViewKey) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) {
    return;
  }

  if (file.size > MAX_IMAGE_SIZE) {
    requestError.value = `${imageViewOptions.find((view) => view.key === viewKey)?.label || '图片'}不能超过 8 MB。`;
    target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    if (typeof e.target?.result === 'string') {
      imageViews.value[viewKey] = e.target.result;
    }
  };
  reader.readAsDataURL(file);
}

function removeImage(viewKey: ImageViewKey) {
  imageViews.value[viewKey] = '';
}

onBeforeUnmount(() => {
  if (downloadUrl.value) {
    URL.revokeObjectURL(downloadUrl.value);
  }
});
</script>
