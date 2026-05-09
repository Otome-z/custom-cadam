import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetch as undiciFetch, setGlobalDispatcher, EnvHttpProxyAgent } from 'undici';
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

const PORT = Number(process.env.PORT || 3001);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-pro';
const GEMINI_URL =
  process.env.GEMINI_URL ||
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

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
      if (body.length > 10_000_000) {
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

async function generateOpenScad (prompt, image) {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing GEMINI_API_KEY in sub-cadam/.env');
  }

  const parts = [];
  parts.push({
    text: prompt || 'Convert this image to OpenSCAD code.',
  });

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
      throw new Error('Invalid image format. Expected Base64 Data URL.');
    }
  }

  const response = await undiciFetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [
        {
          parts: parts,
        },
      ],
      generationConfig: {
        maxOutputTokens: 4000,
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API request failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  console.log('Gemini Data:', JSON.stringify(data, null, 2));

  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('Gemini returned an empty response.');
  }

  const code = normalizeGeneratedCode(rawText);
  if (!code) {
    throw new Error('Could not parse OpenSCAD code from the response.');
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
        const image = typeof body.image === 'string' ? body.image : null;

        if (!prompt && !image) {
          sendJson(res, 400, { error: 'Prompt or image is required.' });
          return;
        }

        const code = await generateOpenScad(prompt, image);
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
