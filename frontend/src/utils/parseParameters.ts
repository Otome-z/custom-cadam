import type {
  Parameter,
  ParameterOption,
  ParameterRange,
  ParameterType,
  ParameterValue,
} from '@/types';

type ParsedValue = {
  type: ParameterType;
  value: ParameterValue;
};

export function parseParameters(script: string): Parameter[] {
  const relevantScript = script.split(/^(module |function )/m)[0];
  const parameterRegex =
    /^([a-zA-Z0-9_$]+)\s*=\s*([^;]+);[\t\f\cK ]*(\/\/[^\n]*)?/gm;

  const parameters: Parameter[] = [];
  let match: RegExpExecArray | null;

  while ((match = parameterRegex.exec(relevantScript)) !== null) {
    const [, name, rawValue, comment] = match;

    if (
      rawValue !== 'true' &&
      rawValue !== 'false' &&
      (rawValue.match(/^[a-zA-Z_]/) || rawValue.includes('\n'))
    ) {
      continue;
    }

    let parsedValue: ParsedValue;
    try {
      parsedValue = convertValue(rawValue.trim());
    } catch {
      continue;
    }

    const displayName =
      name === '$fn'
        ? 'Resolution'
        : name
            .replace(/_/g, ' ')
            .replace(/\b\w/g, (char) => char.toUpperCase());

    let range: ParameterRange | undefined;
    let options: ParameterOption[] | undefined;

    if (comment) {
      const rawComment = comment.replace(/^\/\//, '').trim();
      const cleaned = rawComment.replace(/^\[+|\]+$/g, '');

      if (!Number.isNaN(Number(rawComment))) {
        range =
          parsedValue.type === 'string'
            ? { max: Number(cleaned) }
            : { step: Number(cleaned) };
      } else if (rawComment.startsWith('[') && cleaned.includes(',')) {
        options = cleaned
          .split(',')
          .map((entry) => entry.trim())
          .map((entry) => {
            const [value, label] = entry.split(':');
            return {
              value: parsedValue.type === 'number' ? Number(value) : value,
              label: label || value,
            };
          });
      } else if (/^-?\d+(?::-?\d+(\.\d+)?){1,2}$/.test(cleaned)) {
        const [min, maxOrStep, max] = cleaned.split(':').map(Number);
        range = {
          min,
          max: max ?? maxOrStep,
          step: max ? maxOrStep : undefined,
        };
      }
    }

    const description = findDescriptionAbove(relevantScript, match[0]);

    parameters.push({
      name,
      displayName,
      value: parsedValue.value,
      defaultValue: parsedValue.value,
      type: parsedValue.type,
      description,
      range,
      options,
    });
  }

  return parameters;
}

function convertValue(rawValue: string): ParsedValue {
  if (/^-?\d+(\.\d+)?$/.test(rawValue)) {
    return { type: 'number', value: Number(rawValue) };
  }

  if (rawValue === 'true' || rawValue === 'false') {
    return { type: 'boolean', value: rawValue === 'true' };
  }

  if (/^".*"$/.test(rawValue)) {
    return {
      type: 'string',
      value: rawValue.replace(/^"(.*)"$/, '$1'),
    };
  }

  if (rawValue.startsWith('[') && rawValue.endsWith(']')) {
    const items = rawValue
      .slice(1, -1)
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (items.every((item) => /^-?\d+(\.\d+)?$/.test(item))) {
      return {
        type: 'number[]',
        value: items.map(Number),
      };
    }

    if (items.every((item) => item === 'true' || item === 'false')) {
      return {
        type: 'boolean[]',
        value: items.map((item) => item === 'true'),
      };
    }

    if (items.every((item) => /^".*"$/.test(item))) {
      return {
        type: 'string[]',
        value: items.map((item) => item.slice(1, -1)),
      };
    }
  }

  throw new Error(`Unsupported parameter value: ${rawValue}`);
}

function findDescriptionAbove(script: string, fullMatch: string) {
  const before = script.split(new RegExp(`^${escapeRegExp(fullMatch)}`, 'gm'))[0] || '';
  const lines = before.trimEnd().split('\n');
  const lastLine = lines[lines.length - 1]?.trim();

  if (lastLine?.startsWith('//')) {
    const description = lastLine.replace(/^\/\//, '').trim();
    return description || undefined;
  }

  return undefined;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
