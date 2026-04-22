import fs from 'node:fs';
import path from 'node:path';

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const separatorIndex = trimmed.indexOf('=');
  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();

  if (!key) {
    return null;
  }

  const quote = value[0];
  if (
    value.length >= 2 &&
    (quote === '"' || quote === "'") &&
    value[value.length - 1] === quote
  ) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

export function loadLocalEnv(projectRoot) {
  for (const fileName of ['.env', '.env.local']) {
    const filePath = path.join(projectRoot, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const parsed = parseEnvLine(line);
      if (!parsed) {
        continue;
      }

      process.env[parsed.key] = parsed.value;
    }
  }
}

