import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Agent,
  fetch as undiciFetch,
  setGlobalDispatcher,
  EnvHttpProxyAgent,
} from 'undici';
import { loadLocalEnv } from './loadEnv.mjs';
import { SYSTEM_PROMPT } from './prompt.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(__dirname, 'public');

loadLocalEnv(projectRoot);

if (process.env.HTTP_PROXY || process.env.HTTPS_PROXY) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

// Used only by requests that must bypass the global HTTP(S) proxy.
const directDispatcher = new Agent();

const PORT = Number(process.env.PORT || 3001);
const MAX_REQUEST_BODY_SIZE = 60_000_000;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
const GEMINI_URL =
  process.env.GEMINI_URL ||
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

// Keep the original Google Gemini integration as the default. Set this to
// "lk-gemini" to use lk888.ai's Gemini-compatible chat API.
const configuredProvider = (process.env.OPENSCAD_PROVIDER || 'gemini').toLowerCase();
const OPENSCAD_PROVIDER =
  configuredProvider === 'nano-banana' ? 'lk-gemini' : configuredProvider;
const LK_GEMINI_API_KEY =
  process.env.LK_GEMINI_API_KEY || process.env.NANO_BANANA_API_KEY || '';
const LK_GEMINI_MODEL =
  process.env.LK_GEMINI_MODEL || 'gemini-3.1-pro-preview';
const LK_GEMINI_BASE_URL = (
  process.env.LK_GEMINI_BASE_URL || 'https://api.lk888.ai'
).replace(/\/$/, '');
const LK_GEMINI_URL =
  process.env.LK_GEMINI_URL ||
  `${LK_GEMINI_BASE_URL}/v1beta/models/${LK_GEMINI_MODEL}:generateContent`;

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

function readRequestBody (req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_REQUEST_BODY_SIZE) {
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

class InvalidRequestError extends Error {}

function parseGenerateRequest (body) {
  if (Array.isArray(body.contents)) {
    if (body.contents.length === 0) {
      throw new InvalidRequestError('contents must not be empty.');
    }

    const prompt = body.contents
      .flatMap((content) => Array.isArray(content?.parts) ? content.parts : [])
      .map((part) => typeof part?.text === 'string' ? part.text.trim() : '')
      .filter(Boolean)
      .join('\n');

    return { prompt, contents: body.contents };
  }

  // Backwards compatibility for the original local prompt/image request body.
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const image = typeof body.image === 'string' ? body.image : '';
  if (!prompt && !image) {
    throw new InvalidRequestError('contents or prompt/image is required.');
  }

  const parts = [{
    text: prompt || 'Convert these images to OpenSCAD code.',
  }];

  if (image) {
    // Expected format: data:image/jpeg;base64,...
    const match = image.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
    if (match) {
      parts.push({
        inlineData: {
          mimeType: match[1],
          data: match[2],
        },
      });
    } else {
      throw new InvalidRequestError(
        'Invalid image format. Expected each params.images item to be a Base64 Data URL.'
      );
    }
  }

  return {
    prompt,
    contents: [{ role: 'user', parts }],
  };
}

function createGenerateContentBody (contents) {
  return {
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }]
    },
    contents,
    generationConfig: {
      maxOutputTokens: 4000,
      temperature: 0.2,
    },
  };
}

async function requestGenerateContent ({
  url,
  apiKey,
  providerName,
  body,
  dispatcher,
}) {
  const headers = {
    'Content-Type': 'application/json',
  };

  if (providerName === 'Gemini 3.1 Pro') {
    headers['x-goog-api-key'] = apiKey;
  }

  let response;
  try {
    response = await undiciFetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      dispatcher,
    });
  } catch (error) {
    const causeMessage =
      error && typeof error === 'object' && 'cause' in error &&
      error.cause instanceof Error
        ? error.cause.message
        : error instanceof Error
          ? error.message
          : 'Unknown network error';

    console.error(`${providerName} API network error:`, causeMessage);
    throw new Error(`${providerName} API request failed: ${causeMessage}`);
  }

  const responseText = await response.text();
  const logUrl = new URL(url);
  logUrl.search = '';
  console.log(`${providerName} API response (${response.status}) from ${logUrl}:`);
  console.log(responseText);

  if (!response.ok) {
    let upstreamMessage = responseText;
    try {
      const errorData = JSON.parse(responseText);
      upstreamMessage =
        errorData?.error?.message || errorData?.message || responseText;
    } catch {
      // Non-JSON upstream errors are returned verbatim.
    }

    throw new Error(
      `${providerName} API request failed (${response.status}): ${upstreamMessage}`
    );
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error(
      `${providerName} API returned invalid JSON (${response.status}).`
    );
  }

  const rawText = extractMessageText(data?.candidates?.[0]?.content?.parts);
  if (!rawText) {
    throw new Error(`${providerName} returned an empty text response.`);
  }

  const code = normalizeGeneratedCode(rawText);
  if (!code) {
    throw new Error('Could not parse OpenSCAD code from the response.');
  }

  return code;
}

async function generateOpenScadWithGemini (contents) {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY in .env');
  }

  return requestGenerateContent({
    url: GEMINI_URL,
    apiKey: GEMINI_API_KEY,
    providerName: 'Gemini',
    body: createGenerateContentBody(contents),
  });
}

async function generateOpenScadWithLkGemini (contents) {
  if (!LK_GEMINI_API_KEY) {
    throw new Error('Missing LK_GEMINI_API_KEY in .env');
  }

  return requestGenerateContent({
    url: LK_GEMINI_URL,
    apiKey: LK_GEMINI_API_KEY,
    providerName: 'Gemini 3.1 Pro',
    body: createGenerateContentBody(contents),
    dispatcher: directDispatcher,
  });
}

async function generateOpenScad ({ contents }) {
  if (OPENSCAD_PROVIDER === 'gemini') {
    return generateOpenScadWithGemini(contents);
  }

  if (OPENSCAD_PROVIDER === 'lk-gemini') {
    return generateOpenScadWithLkGemini(contents);
  }

  throw new Error(
    `Unsupported OPENSCAD_PROVIDER: ${OPENSCAD_PROVIDER}. Expected "gemini" or "lk-gemini".`
  );
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
        const request = parseGenerateRequest(body);
        const code = await generateOpenScad(request);
        sendJson(res, 200, { prompt: request.prompt, code });
      } catch (error) {
        console.error('Generate API failed:', error);
        sendJson(res, error instanceof InvalidRequestError ? 400 : 500, {
          error: error instanceof Error ? error.message : 'Unknown server error',
        });
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
