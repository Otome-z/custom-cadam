import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './loadEnv.mjs';
import {
  MODEL_SPEC_SYSTEM_PROMPT,
  normalizeCatalogModel,
  fallbackCatalogModel,
  buildOpenScadFromModelSpec,
} from './modelCatalog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(__dirname, 'public');

loadLocalEnv(projectRoot);

const PORT = Number(process.env.PORT || 3001);

const QIANWEN_SITE_URL =
  process.env.QIANWEN_SITE_URL
  || process.env.OPENROUTER_SITE_URL
  || 'http://localhost:5174';
const QIANWEN_APP_NAME =
  process.env.QIANWEN_APP_NAME
  || process.env.OPENROUTER_APP_NAME
  || 'sub-cadam';
const QIANWEN_API_KEY =
  process.env.QIANWEN_API_KEY
  || process.env.OPENROUTER_API_KEY
  || '';
const QIANWEN_MODEL =
  process.env.QIANWEN_MODEL
  || process.env.OPENROUTER_MODEL
  || 'qwen-plus';
const QIANWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';


const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

function sendJson (res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(payload));
}

function sendText (res, statusCode, message) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(message);
}

function extractMessageText (content) {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (
          part &&
          typeof part === 'object' &&
          'text' in part &&
          typeof part.text === 'string'
        ) {
          return part.text;
        }

        return '';
      })
      .filter(Boolean)
      .join('\n');
  }

  return '';
}

function extractJsonPayload (rawText) {
  const trimmed = rawText.trim();
  const candidates = [trimmed];

  const exactBlock = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (exactBlock) {
    candidates.push(exactBlock[1].trim());
  }

  const codeBlock = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/i);
  if (codeBlock) {
    candidates.push(codeBlock[1].trim());
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    candidates.push(objectMatch[0]);
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }

  return null;
}

function readRequestBody (req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Request body is too large.'));
      }
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });

    req.on('error', reject);
  });
}

function normalizeProvider(provider) {
  return 'qianwen';
}

function resolveProviderConfig(provider) {
  return {
    name: 'Qianwen',
    url: QIANWEN_URL,
    apiKey: QIANWEN_API_KEY,
    model: QIANWEN_MODEL,
    headers: {
      'HTTP-Referer': QIANWEN_SITE_URL,
      'X-Title': QIANWEN_APP_NAME,
    },
  };
}

async function requestModel (
  {
    provider,
    messages,
    maxTokens = 4000,
    temperature = 0.2,
  },
) {
  const config = resolveProviderConfig(provider);

  if (!config.apiKey) {
    throw new Error('Missing QIANWEN_API_KEY in sub-cadam/.env');
  }

  if (!config.model) {
    throw new Error('Missing QIANWEN_MODEL in sub-cadam/.env');
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...config.headers,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      temperature,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`${config.name} request failed: ${response.status} ${errText}`);
  }

  return response.json();
}

async function requestModelStream (
  {
    provider,
    messages,
    maxTokens = 4000,
    temperature = 0.2,
    onDelta,
  },
) {
  const config = resolveProviderConfig(provider);

  if (!config.apiKey) {
    throw new Error('Missing QIANWEN_API_KEY in sub-cadam/.env');
  }

  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      ...config.headers,
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      messages,
    }),
  });

  if (!response.ok || !response.body) {
    const errText = await response.text();
    throw new Error(`${config.name} stream request failed: ${response.status} ${errText}`);
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
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data:')) {
        continue;
      }

      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') {
        continue;
      }

      let parsed;
      try {
        parsed = JSON.parse(data);
      } catch {
        continue;
      }

      const delta = parsed?.choices?.[0]?.delta;
      if (!delta || typeof onDelta !== 'function') {
        continue;
      }

      const reasoningChunk = extractMessageText(delta.reasoning_content);
      if (reasoningChunk) {
        onDelta({ type: 'thinking', text: reasoningChunk });
      }

      const contentChunk = extractMessageText(delta.content);
      if (contentChunk) {
        onDelta({ type: 'result', text: contentChunk });
      }
    }
  }
}

function buildUserContent(prompt, imageDataUrl) {
  const normalizedImageDataUrl = normalizeImageDataUrl(imageDataUrl);
  if (!normalizedImageDataUrl) {
    return prompt;
  }

  return [
    {
      type: 'text',
      text: prompt,
    },
    {
      type: 'image_url',
      image_url: {
        url: normalizedImageDataUrl,
      },
    },
  ];
}

function normalizeImageDataUrl(imageDataUrl) {
  if (typeof imageDataUrl !== 'string') {
    return '';
  }
  const trimmed = imageDataUrl.trim();
  if (!trimmed) {
    return '';
  }
  if (/^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(trimmed)) {
    return trimmed;
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(trimmed)) {
    return `data:image/png;base64,${trimmed.replace(/\s+/g, '')}`;
  }
  return '';
}

function getImageMeta(imageDataUrl) {
  const normalized = normalizeImageDataUrl(imageDataUrl);
  if (!normalized) {
    return { hasImage: false, mime: '', bytesApprox: 0 };
  }
  const mimeMatch = normalized.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,/);
  const base64 = normalized.slice(normalized.indexOf(',') + 1);
  const bytesApprox = Math.floor((base64.length * 3) / 4);
  return {
    hasImage: true,
    mime: mimeMatch?.[1] || 'image/unknown',
    bytesApprox,
  };
}

async function inferCatalogModel (prompt, provider, imageDataUrl = '') {
  try {
    console.log('[catalog] request meta:', {
      provider,
      model: QIANWEN_MODEL,
      image: getImageMeta(imageDataUrl),
      promptPreview: prompt.slice(0, 120),
    });
    if (imageDataUrl && !/vl/i.test(QIANWEN_MODEL)) {
      console.warn('[catalog] model may not be vision-capable for image input:', QIANWEN_MODEL);
    }

    const data = await requestModel({
      provider,
      maxTokens: 2200,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: MODEL_SPEC_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: buildUserContent(prompt, imageDataUrl),
        },
      ],
    });

    const rawText = extractMessageText(data?.choices?.[0]?.message?.content);
    const payload = extractJsonPayload(rawText);
    const normalized = normalizeCatalogModel(payload);
    console.log('[catalog] raw model text:', rawText);
    console.log('[catalog] extracted payload:', payload);
    console.log('[catalog] normalized model:', normalized);
    if (normalized) {
      return normalized;
    }

    console.warn('[catalog] normalize failed, will try repair step before fallback');
    const repaired = await repairCatalogModelSpec({
      prompt,
      provider,
      imageDataUrl,
      rawText,
      payload,
    });
    console.log('[catalog] repaired model:', repaired);
    return repaired;
  } catch (error) {
    console.warn('[sub-cadam] Catalog inference failed:', error);
    return null;
  }
}

async function inferCatalogModelStream (prompt, provider, imageDataUrl, onDelta) {
  let resultText = '';
  console.log('[catalog] stream request meta:', {
    provider,
    model: QIANWEN_MODEL,
    image: getImageMeta(imageDataUrl),
    promptPreview: prompt.slice(0, 120),
  });
  if (imageDataUrl && !/vl/i.test(QIANWEN_MODEL)) {
    console.warn('[catalog] model may not be vision-capable for image input:', QIANWEN_MODEL);
  }

  await requestModelStream({
    provider,
    maxTokens: 2200,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: MODEL_SPEC_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: buildUserContent(prompt, imageDataUrl),
      },
    ],
    onDelta: (delta) => {
      if (delta.type === 'result') {
        resultText += delta.text;
      }
      onDelta?.(delta);
    },
  });

  const payload = extractJsonPayload(resultText);
  const normalized = normalizeCatalogModel(payload);
  console.log('[catalog] raw model text:', resultText);
  console.log('[catalog] extracted payload:', payload);
  console.log('[catalog] normalized model:', normalized);
  if (normalized) {
    return normalized;
  }

  console.warn('[catalog] normalize failed, will try repair step before fallback');
  const repaired = await repairCatalogModelSpec({
    prompt,
    provider,
    imageDataUrl,
    rawText: resultText,
    payload,
  });
  console.log('[catalog] repaired model:', repaired);
  return repaired;
}

async function generateOpenScad (prompt, provider) {
  const catalogModelSpec = await inferCatalogModel(prompt, provider);
  const modelSpec = catalogModelSpec || fallbackCatalogModel(prompt, { hasImage: false });
  if (!catalogModelSpec) {
    console.warn('[catalog] using fallback model:', {
      hasImage: false,
      prompt,
      fallbackModelType: modelSpec?.modelType,
    });
  }
  const code = buildOpenScadFromModelSpec(modelSpec);

  if (!code) {
    throw new Error('Failed to build OpenSCAD from catalog model spec.');
  }

  return {
    code,
    modelSpec,
  };
}

async function generateOpenScadStream (prompt, provider, imageDataUrl, onDelta) {
  const catalogModelSpec = await inferCatalogModelStream(
    prompt,
    provider,
    imageDataUrl,
    onDelta,
  );
  const modelSpec = catalogModelSpec || fallbackCatalogModel(prompt, { hasImage: Boolean(imageDataUrl) });
  if (!catalogModelSpec) {
    console.warn('[catalog] using fallback model:', {
      hasImage: Boolean(imageDataUrl),
      prompt,
      fallbackModelType: modelSpec?.modelType,
    });
  }
  const code = buildOpenScadFromModelSpec(modelSpec);

  if (!code) {
    throw new Error('Failed to build OpenSCAD from catalog model spec.');
  }

  return {
    code,
    modelSpec,
  };
}

async function repairCatalogModelSpec({
  prompt,
  provider,
  imageDataUrl = '',
  rawText = '',
  payload,
}) {
  try {
    const repairPrompt = `You previously attempted to generate a yarn model spec from an image and prompt, but the output was invalid or unsupported.

Repair the result and return valid JSON only.

Important:
- If the image shows multiple independent yarn paths, output modelType = "yarn_path_collection".
- If the image shows vertical straight strands and horizontal folded/wavy/interlaced strands, output yarn_path_collection.
- Do not output yarn_sheet for this kind of image.
- Do not output woven_yarn_sheet unless the image is a globally regular woven sheet with one shared parameter set.
- Each visible yarn path must be one line item in lines[].
- Use supported line types only: straight, polyline, smoothPolyline, sine, bezier.
- Every point must be [x, y, z].
- lines must be a non-empty array if visible line paths exist.
- globalDefaults must exist.
- Return JSON only. No markdown. No explanation.

Original user prompt:
${prompt}

Invalid previous model output:
${rawText}

Extracted payload:
${JSON.stringify(payload)}

Return repaired JSON only.`;

    const data = await requestModel({
      provider,
      maxTokens: 2200,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: MODEL_SPEC_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: buildUserContent(repairPrompt, imageDataUrl),
        },
      ],
    });

    const repairedText = extractMessageText(data?.choices?.[0]?.message?.content);
    const repairedPayload = extractJsonPayload(repairedText);
    const repairedNormalized = normalizeCatalogModel(repairedPayload);
    console.log('[catalog] repair raw text:', repairedText);
    console.log('[catalog] repair payload:', repairedPayload);
    console.log('[catalog] repair normalized:', repairedNormalized);
    if (repairedNormalized) {
      return {
        ...repairedNormalized,
        source: 'catalog_repaired',
      };
    }
    return null;
  } catch (error) {
    console.warn('[catalog] repair failed:', error);
    return null;
  }
}

function sendSseEvent(res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function safeResolvePublicPath (urlPath) {
  const normalizedPath = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, '');
  return path.join(publicDir, normalizedPath);
}

function getMimeType (filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function serveStatic (res, pathname) {
  if (!fs.existsSync(publicDir)) {
    sendText(res, 404, 'Frontend has not been built yet. Run "npm run build" in sub-cadam.');
    return;
  }

  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  let filePath = safeResolvePublicPath(requestedPath);

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  const hasExtension = path.extname(filePath) !== '';
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    if (!hasExtension) {
      filePath = path.join(publicDir, 'index.html');
    } else {
      sendText(res, 404, 'Not found');
      return;
    }
  }

  try {
    const file = await fs.promises.readFile(filePath);
    res.writeHead(200, {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': filePath.endsWith('index.html')
        ? 'no-store'
        : 'public, max-age=31536000, immutable',
    });
    res.end(file);
  } catch (error) {
    console.error('Failed to serve file:', error);
    sendText(res, 500, 'Failed to read static file');
  }
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (url.pathname.startsWith('/api/')) {
    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (url.pathname === '/api/generate' && method === 'POST') {
      try {
        const body = await readRequestBody(req);
        const prompt =
          typeof body.prompt === 'string' ? body.prompt.trim() : '';
        const provider = normalizeProvider(body.provider);

        if (!prompt) {
          sendJson(res, 400, { error: 'Prompt is required.' });
          return;
        }

        const result = await generateOpenScad(prompt, provider);
        sendJson(res, 200, {
          prompt,
          provider,
          code: result.code,
          modelSpec: result.modelSpec,
        });
      } catch (error) {
        console.error('Generate API failed:', error);
        sendJson(res, 500, {
          error: error instanceof Error ? error.message : 'Unknown server error',
        });
      }
      return;
    }

    if (url.pathname === '/api/generate-stream' && method === 'POST') {
      try {
        const body = await readRequestBody(req);
        const prompt =
          typeof body.prompt === 'string' ? body.prompt.trim() : '';
        const provider = normalizeProvider(body.provider);
        const imageDataUrl = normalizeImageDataUrl(
          typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '',
        );
        const skipModelInference = Boolean(body.skipModelInference);
        const providedModelSpec = body.modelSpec && typeof body.modelSpec === 'object' ? body.modelSpec : null;

        if (!prompt) {
          sendJson(res, 400, { error: 'Prompt is required.' });
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-store',
          Connection: 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        });

        if (skipModelInference && providedModelSpec) {
          const normalizedProvidedModel = normalizeCatalogModel(providedModelSpec);
          console.log('[catalog] using frontend provided modelSpec:', {
            skipModelInference,
            hasImage: Boolean(imageDataUrl),
            normalized: Boolean(normalizedProvidedModel),
            modelType: normalizedProvidedModel?.modelType,
          });
          if (normalizedProvidedModel) {
            const directCode = buildOpenScadFromModelSpec(normalizedProvidedModel);
            if (directCode) {
              sendSseEvent(res, 'done', {
                prompt,
                provider,
                code: directCode,
                modelSpec: normalizedProvidedModel,
              });
              res.end();
              return;
            }
          }
          console.warn('[catalog] provided modelSpec invalid or failed to build, fallback to model inference');
        }

        const result = await generateOpenScadStream(
          prompt,
          provider,
          imageDataUrl,
          (delta) => {
            sendSseEvent(res, 'delta', delta);
          },
        );

        sendSseEvent(res, 'done', {
          prompt,
          provider,
          code: result.code,
          modelSpec: result.modelSpec,
        });
        res.end();
      } catch (error) {
        console.error('Generate stream API failed:', error);
        if (!res.headersSent) {
          sendJson(res, 500, {
            error: error instanceof Error ? error.message : 'Unknown server error',
          });
          return;
        }

        sendSseEvent(res, 'error', {
          error: error instanceof Error ? error.message : 'Unknown server error',
        });
        res.end();
      }
      return;
    }

    sendJson(res, 404, { error: 'API route not found.' });
    return;
  }

  if (method !== 'GET' && method !== 'HEAD') {
    sendText(res, 405, 'Method not allowed');
    return;
  }

  await serveStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`sub-cadam server running at http://localhost:${PORT}`);
});
