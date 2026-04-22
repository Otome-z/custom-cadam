import openscadFactory from '@/vendor/openscad-wasm/openscad.js';
import type { OpenSCAD } from '@/vendor/openscad-wasm/openscad.d';
import OpenSCADError from '@/lib/OpenSCADError';
import type { OpenScadWorkerPayload, OpenScadWorkerResult } from './types';

const fontsConf = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd">
<fontconfig></fontconfig>`;

let defaultFont: ArrayBuffer | undefined;

class OpenSCADWrapper {
  log = {
    stdErr: [] as string[],
    stdOut: [] as string[],
  };

  private logger = (type: 'stdErr' | 'stdOut') => (text: string) => {
    this.log[type].push(text);
  };

  private async createInstance(): Promise<OpenSCAD> {
    const instance = await openscadFactory({
      noInitialRun: true,
      print: this.logger('stdOut'),
      printErr: this.logger('stdErr'),
    });

    if (!defaultFont) {
      const response = await fetch(`${import.meta.env.BASE_URL}Geist-Regular.ttf`);
      defaultFont = await response.arrayBuffer();
    }

    instance.FS.mkdir('/fonts');
    instance.FS.writeFile('/fonts/fonts.conf', fontsConf);
    instance.FS.writeFile('/fonts/Geist-Regular.ttf', new Int8Array(defaultFont));

    return instance;
  }

  async preview(data: OpenScadWorkerPayload): Promise<OpenScadWorkerResult> {
    const parameters = data.params
      .map((parameter) => `-D${parameter.name}=${serializeValue(parameter.value)}`)
      .filter(Boolean);

    return this.execute(
      data.code,
      'stl',
      parameters.concat([
        '--export-format=binstl',
        '--enable=manifold',
        '--enable=fast-csg',
        '--enable=lazy-union',
        '--enable=roof',
      ]),
    );
  }

  private async execute(
    code: string,
    fileType: 'stl',
    parameters: string[],
  ): Promise<OpenScadWorkerResult> {
    const start = Date.now();
    this.log.stdErr = [];
    this.log.stdOut = [];

    const instance = await this.createInstance();
    const inputFile = '/input.scad';
    const outputFile = '/out.stl';

    instance.FS.writeFile(inputFile, code);

    let exitCode = 0;
    let output: Uint8Array;

    try {
      exitCode = instance.callMain([inputFile, '-o', outputFile, ...parameters]);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`OpenSCAD runtime failed: ${error.message}`);
      }
      throw new Error('OpenSCAD runtime failed.');
    }

    if (exitCode !== 0) {
      throw new OpenSCADError('OpenSCAD compilation failed.', code, this.log.stdErr);
    }

    try {
      output = instance.FS.readFile(outputFile, { encoding: 'binary' });
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to read STL output: ${error.message}`);
      }
      throw new Error('Failed to read STL output.');
    }

    return {
      output,
      fileType,
      exitCode,
      duration: Date.now() - start,
      log: this.log,
    };
  }
}

function serializeValue(value: unknown): string {
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'string') {
    return `"${value.replace(/(["\\])/g, '\\$1')}"`;
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeValue(item)).join(',')}]`;
  }

  return '0';
}

export default OpenSCADWrapper;

