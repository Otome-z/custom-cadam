import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from './loadEnv.mjs';
import { SYSTEM_PROMPT } from './prompt.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(__dirname, 'public');

loadLocalEnv(projectRoot);

const PORT = Number(process.env.PORT || 3001);

const OPENROUTER_SITE_URL =
  process.env.OPENROUTER_SITE_URL || 'http://localhost:5174';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || '';
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'sub-cadam';
const OPENROUTER_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';

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

async function generateOpenScad (prompt) {
  if (!OPENROUTER_API_KEY) {
    throw new Error('Missing OPENROUTER_API_KEY in sub-cadam/.env');
  }

  if (!OPENROUTER_MODEL) {
    throw new Error('Missing OPENROUTER_MODEL in sub-cadam/.env');
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      max_tokens: 4000,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DashScope request failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  console.log('data', data);
  console.log('data', data.choices[0]?.message);
  console.log('data', data.choices[0]?.message?.[0]);

  const rawText = extractMessageText(data?.choices?.[0]?.message?.content);
  const code = normalizeGeneratedCode(rawText);

  if (!code) {
    throw new Error('OpenRouter returned an empty response.');
  }

  return code;
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

        if (!prompt) {
          sendJson(res, 400, { error: 'Prompt is required.' });
          return;
        }

        const code = await generateOpenScad(prompt);
        sendJson(res, 200, { prompt, code });
      } catch (error) {
        console.error('Generate API failed:', error);
        sendJson(res, 500, {
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
