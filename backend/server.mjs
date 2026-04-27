import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './loadEnv.mjs';
import { SYSTEM_PROMPT } from './prompt.mjs';
import {
  MODEL_SPEC_SYSTEM_PROMPT,
  normalizeCatalogModel,
  buildOpenScadFromModelSpec,
} from './modelCatalog.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(__dirname, 'public');

loadLocalEnv(projectRoot);

const PORT = Number(process.env.PORT || 3001);

const PROJECT_SITE_URL =
  process.env.PROJECT_SITE_URL || process.env.OPENROUTER_SITE_URL || 'http://localhost:5174';
const QIANWEN_API_KEY =
  process.env.QIANWEN_API_KEY || process.env.OPENROUTER_API_KEY || '';
const QIANWEN_MODEL =
  process.env.QIANWEN_MODEL || process.env.OPENROUTER_MODEL || '';
const PROJECT_APP_NAME =
  process.env.PROJECT_APP_NAME || process.env.OPENROUTER_APP_NAME || 'sub-cadam';
const QIANWEN_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const MAX_REQUEST_BODY_BYTES = 12_000_000;
const QIANWEN_TIMEOUT_MS = 360_000;

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

function normalizeGeneratedCode (rawText) {
  const trimmed = rawText.trim();
  const normalizedFenceText = trimmed
    .replace(/^```(?:openscad|scad)?\s*\n?/i, '')
    .replace(/\n?```$/i, '')
    .replace(/```(?:openscad|scad)?/gi, '')
    .replace(/```/g, '')
    .trim();

  if (normalizedFenceText !== trimmed) {
    return normalizedFenceText;
  }

  const exactBlock = trimmed.match(/^```(?:openscad)?\s*\n?([\s\S]*?)\n?```$/i);
  if (exactBlock) {
    return exactBlock[1].trim();
  }

  const codeBlock = trimmed.match(/```(?:openscad)?\s*\n?([\s\S]*?)\n?```/i);
  if (codeBlock) {
    return codeBlock[1].trim();
  }

  return trimmed;
}

function ensureCurveResolutionDefaults (code) {
  if (!code.trim()) {
    return code;
  }

  let nextCode = code
    .replace(
      /(^|\n)([ \t]*)\$fn\s*=\s*(\d+(?:\.\d+)?)\s*;[^\n]*/g,
      (_match, prefix, indent, rawValue) =>
        `${prefix}${indent}$fn = ${Math.max(Number(rawValue), 96)};`,
    )
    .replace(
      /(^|\n)([ \t]*)\$fa\s*=\s*(\d+(?:\.\d+)?)\s*;[^\n]*/g,
      (_match, prefix, indent, rawValue) =>
        `${prefix}${indent}$fa = ${Math.min(Number(rawValue), 3)};`,
    )
    .replace(
      /(^|\n)([ \t]*)\$fs\s*=\s*(\d+(?:\.\d+)?)\s*;[^\n]*/g,
      (_match, prefix, indent, rawValue) =>
        `${prefix}${indent}$fs = ${Math.min(Number(rawValue), 0.4)};`,
    );

  const preamble = [];

  if (!/(^|\n)\s*\$fn\s*=/.test(nextCode)) {
    preamble.push('$fn = 96;');
  }

  if (!/(^|\n)\s*\$fa\s*=/.test(nextCode)) {
    preamble.push('$fa = 3;');
  }

  if (!/(^|\n)\s*\$fs\s*=/.test(nextCode)) {
    preamble.push('$fs = 0.4;');
  }

  if (!preamble.length) {
    return sanitizeUnsupportedFlowStatements(nextCode);
  }

  return sanitizeUnsupportedFlowStatements(`${preamble.join('\n')}\n\n${nextCode}`);
}

function sanitizeUnsupportedFlowStatements (code) {
  return code
    .replace(/\bbreak\s*;/g, 'echo("break_removed_for_openscad");')
    .replace(/\bcontinue\s*;/g, 'echo("continue_removed_for_openscad");');
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
      if (body.length > MAX_REQUEST_BODY_BYTES) {
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

async function requestOpenRouter ({ messages, maxTokens = 4000, temperature = 0.2 }) {
  if (!QIANWEN_API_KEY) {
    throw new Error('Missing QIANWEN_API_KEY in sub-cadam/.env');
  }

  if (!QIANWEN_MODEL) {
    throw new Error('Missing QIANWEN_MODEL in sub-cadam/.env');
  }

  const response = await fetch(QIANWEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${QIANWEN_API_KEY}`,
      'HTTP-Referer': PROJECT_SITE_URL,
      'X-Title': PROJECT_APP_NAME,
    },
    body: JSON.stringify({
      model: QIANWEN_MODEL,
      max_tokens: maxTokens,
      temperature,
      messages,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DashScope request failed: ${response.status} ${errText}`);
  }

  return response.json();
}

async function requestOpenRouterStream ({
  messages,
  maxTokens = 4000,
  temperature = 0.2,
}) {
  if (!QIANWEN_API_KEY) {
    throw new Error('Missing QIANWEN_API_KEY in sub-cadam/.env');
  }

  if (!QIANWEN_MODEL) {
    throw new Error('Missing QIANWEN_MODEL in sub-cadam/.env');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), QIANWEN_TIMEOUT_MS);

  try {
    const response = await fetch(QIANWEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${QIANWEN_API_KEY}`,
        'HTTP-Referer': PROJECT_SITE_URL,
        'X-Title': PROJECT_APP_NAME,
      },
      body: JSON.stringify({
        model: QIANWEN_MODEL,
        max_tokens: maxTokens,
        temperature,
        stream: true,
        messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DashScope stream failed: ${response.status} ${errText}`);
    }

    if (!response.body) {
      throw new Error('DashScope stream has no response body.');
    }

    return response.body;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sanitizeImageDataUrl (imageDataUrl) {
  if (typeof imageDataUrl !== 'string') {
    return '';
  }

  const trimmed = imageDataUrl.trim();
  if (!trimmed) {
    return '';
  }

  const isDataImage = /^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+$/.test(trimmed);
  if (!isDataImage) {
    throw new Error('Invalid imageDataUrl. Expected a base64 data URL.');
  }

  return trimmed;
}

function buildUserMessageContent (prompt, imageDataUrl) {
  if (!imageDataUrl) {
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
        url: imageDataUrl,
      },
    },
  ];
}

function writeSseEvent (res, event, payload) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function normalizeDeltaText (value) {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }

        if (
          part &&
          typeof part === 'object' &&
          'type' in part &&
          part.type === 'text' &&
          'text' in part &&
          typeof part.text === 'string'
        ) {
          return part.text;
        }

        return '';
      })
      .join('');
  }

  return '';
}

function getLinePayload (line) {
  const match = line.match(/^data:\s?(.*)$/);
  return match ? match[1] : '';
}

function processSseBlock (block, onPayload) {
  const lines = block
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const payload = getLinePayload(line);
    if (!payload || payload === '[DONE]') {
      continue;
    }

    let json;
    try {
      json = JSON.parse(payload);
    } catch {
      continue;
    }

    onPayload(json);
  }
}

function createThinkTagSplitter () {
  const THINK_OPEN = '<think>';
  const THINK_CLOSE = '</think>';
  const MIN_TAG_BUFFER = THINK_CLOSE.length;
  let inThink = false;
  let carry = '';

  function process (chunk) {
    let text = carry + chunk;
    carry = '';
    let thinkingText = '';
    let resultText = '';
    let cursor = 0;

    while (cursor < text.length) {
      if (inThink) {
        const closeIndex = text.indexOf(THINK_CLOSE, cursor);
        if (closeIndex === -1) {
          const safeEnd = Math.max(cursor, text.length - MIN_TAG_BUFFER);
          thinkingText += text.slice(cursor, safeEnd);
          carry = text.slice(safeEnd);
          break;
        }

        thinkingText += text.slice(cursor, closeIndex);
        cursor = closeIndex + THINK_CLOSE.length;
        inThink = false;
        continue;
      }

      const openIndex = text.indexOf(THINK_OPEN, cursor);
      if (openIndex === -1) {
        const safeEnd = Math.max(cursor, text.length - MIN_TAG_BUFFER);
        resultText += text.slice(cursor, safeEnd);
        carry = text.slice(safeEnd);
        break;
      }

      resultText += text.slice(cursor, openIndex);
      cursor = openIndex + THINK_OPEN.length;
      inThink = true;
    }

    return {
      thinkingText,
      resultText,
    };
  }

  function flushRemainder () {
    if (!carry) {
      return { thinkingText: '', resultText: '' };
    }

    const payload = inThink
      ? { thinkingText: carry, resultText: '' }
      : { thinkingText: '', resultText: carry };

    carry = '';
    return payload;
  }

  return {
    process,
    flushRemainder,
  };
}

async function streamOpenRouterToSse ({ res, prompt, imageDataUrl }) {
  writeSseEvent(res, 'status', { message: '正在连接模型...' });

  const bodyStream = await requestOpenRouterStream({
    maxTokens: 4000,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: buildUserMessageContent(prompt, imageDataUrl),
      },
    ],
  });

  writeSseEvent(res, 'status', { message: '模型已连接，开始生成...' });

  const reader = bodyStream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';
  const thinkTagSplitter = createThinkTagSplitter();

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

      processSseBlock(block, (json) => {
        const choice = json?.choices?.[0];
        const delta = choice?.delta || {};

        const reasoning = normalizeDeltaText(
          delta.reasoning_content || delta.reasoning || '',
        );
        if (reasoning) {
          writeSseEvent(res, 'thinking_delta', { chunk: reasoning });
        }

        const textChunk = normalizeDeltaText(delta.content);
        if (textChunk) {
          const separated = thinkTagSplitter.process(textChunk);
          if (separated.thinkingText) {
            writeSseEvent(res, 'thinking_delta', { chunk: separated.thinkingText });
          }
          if (separated.resultText) {
            fullText += separated.resultText;
            writeSseEvent(res, 'result_delta', { chunk: separated.resultText });
          }
        }
      });

      splitIndex = buffer.indexOf('\n\n');
    }
  }

  if (buffer.trim()) {
    processSseBlock(buffer, (json) => {
      const choice = json?.choices?.[0];
      const delta = choice?.delta || {};
      const reasoning = normalizeDeltaText(
        delta.reasoning_content || delta.reasoning || '',
      );
      if (reasoning) {
        writeSseEvent(res, 'thinking_delta', { chunk: reasoning });
      }

      const textChunk = normalizeDeltaText(delta.content);
      if (textChunk) {
        const separated = thinkTagSplitter.process(textChunk);
        if (separated.thinkingText) {
          writeSseEvent(res, 'thinking_delta', { chunk: separated.thinkingText });
        }
        if (separated.resultText) {
          fullText += separated.resultText;
          writeSseEvent(res, 'result_delta', { chunk: separated.resultText });
        }
      }
    });
  }

  const tail = thinkTagSplitter.flushRemainder();
  if (tail.thinkingText) {
    writeSseEvent(res, 'thinking_delta', { chunk: tail.thinkingText });
  }
  if (tail.resultText) {
    fullText += tail.resultText;
    writeSseEvent(res, 'result_delta', { chunk: tail.resultText });
  }

  const code = ensureCurveResolutionDefaults(normalizeGeneratedCode(fullText));
  if (!code) {
    throw new Error('OpenRouter returned an empty response.');
  }

  writeSseEvent(res, 'done', {
    prompt,
    code,
    modelSpec: null,
  });
}

async function inferCatalogModel (prompt, imageDataUrl) {
  try {
    const data = await requestOpenRouter({
      maxTokens: 1200,
      temperature: 0.1,
      messages: [
        {
          role: 'system',
          content: MODEL_SPEC_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: buildUserMessageContent(prompt, imageDataUrl),
        },
      ],
    });

    const rawText = extractMessageText(data?.choices?.[0]?.message?.content);
    const payload = extractJsonPayload(rawText);
    return normalizeCatalogModel(payload);
  } catch (error) {
    console.warn('[sub-cadam] Catalog inference failed:', error);
    return null;
  }
}

async function generateOpenScad (prompt, imageDataUrl) {
  const catalogModelSpec = await inferCatalogModel(prompt, imageDataUrl);
  if (catalogModelSpec) {
    const code = buildOpenScadFromModelSpec(catalogModelSpec);
    if (code) {
      return {
        code,
        modelSpec: catalogModelSpec,
      };
    }
  }

  const data = await requestOpenRouter({
    maxTokens: 4000,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: buildUserMessageContent(prompt, imageDataUrl),
      },
    ],
  });

  const rawText = extractMessageText(data?.choices?.[0]?.message?.content);
  const code = ensureCurveResolutionDefaults(normalizeGeneratedCode(rawText));

  if (!code) {
    throw new Error('OpenRouter returned an empty response.');
  }

  return {
    code,
    modelSpec: null,
  };
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
        const imageDataUrl = sanitizeImageDataUrl(body.imageDataUrl);

        if (!prompt) {
          sendJson(res, 400, { error: 'Prompt is required.' });
          return;
        }

        const result = await generateOpenScad(prompt, imageDataUrl);
        sendJson(res, 200, {
          prompt,
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

    if (url.pathname === '/api/generate/stream' && method === 'POST') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });

      try {
        const body = await readRequestBody(req);
        const prompt =
          typeof body.prompt === 'string' ? body.prompt.trim() : '';
        const imageDataUrl = sanitizeImageDataUrl(body.imageDataUrl);

        if (!prompt) {
          writeSseEvent(res, 'error', { error: 'Prompt is required.' });
          res.end();
          return;
        }

        await streamOpenRouterToSse({
          res,
          prompt,
          imageDataUrl,
        });
      } catch (error) {
        writeSseEvent(res, 'error', {
          error: error instanceof Error ? error.message : 'Unknown server error',
        });
      }

      res.end();
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
