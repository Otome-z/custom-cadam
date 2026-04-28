import {
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
  type BufferGeometry,
} from 'three';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import { PLYExporter } from 'three/examples/jsm/exporters/PLYExporter.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

export type ExportFormat =
  | 'stl-ascii'
  | 'stl-binary'
  | 'obj'
  | 'ply-ascii'
  | 'ply-binary'
  | 'gltf'
  | 'glb';

export type ExportResult = {
  blob: Blob;
  extension: string;
};

export async function exportPreviewGeometry(
  exportSource: BufferGeometry | Object3D,
  format: ExportFormat,
): Promise<ExportResult> {
  const sourceObject = createExportObject(exportSource);

  switch (format) {
    case 'stl-ascii': {
      const exporter = new STLExporter();
      const text = exporter.parse(sourceObject as Mesh, { binary: false });
      return {
        blob: new Blob([String(text)], { type: 'model/stl' }),
        extension: 'stl',
      };
    }
    case 'stl-binary': {
      const exporter = new STLExporter();
      const data = exporter.parse(sourceObject as Mesh, { binary: true });
      return {
        blob: new Blob([data as BlobPart], { type: 'model/stl' }),
        extension: 'stl',
      };
    }
    case 'obj': {
      const exporter = new OBJExporter();
      const text = exporter.parse(sourceObject as Mesh);
      return {
        blob: new Blob([text], { type: 'text/plain;charset=utf-8' }),
        extension: 'obj',
      };
    }
    case 'ply-ascii': {
      const data = await exportPly(sourceObject, false);
      return {
        blob: new Blob([data], { type: 'application/octet-stream' }),
        extension: 'ply',
      };
    }
    case 'ply-binary': {
      const data = await exportPly(sourceObject, true);
      return {
        blob: new Blob([data], { type: 'application/octet-stream' }),
        extension: 'ply',
      };
    }
    case 'gltf': {
      const data = await exportGltf(sourceObject, false);
      return {
        blob: new Blob([JSON.stringify(data, null, 2)], { type: 'model/gltf+json' }),
        extension: 'gltf',
      };
    }
    case 'glb': {
      const data = await exportGltf(sourceObject, true);
      return {
        blob: new Blob([data as ArrayBuffer], { type: 'model/gltf-binary' }),
        extension: 'glb',
      };
    }
    default:
      throw new Error(`Unsupported export format: ${format as string}`);
  }
}

function createExportObject(exportSource: BufferGeometry | Object3D): Object3D {
  if (exportSource instanceof Object3D) {
    return exportSource;
  }

  return new Mesh(
    exportSource,
    new MeshStandardMaterial({
      color: '#7a8e2c',
      roughness: 0.24,
      metalness: 0.04,
    }),
  );
}

function exportPly(sourceObject: Object3D, binary: boolean): Promise<string | ArrayBuffer> {
  const exporter = new PLYExporter();
  return new Promise((resolve) => {
    exporter.parse(
      sourceObject as Mesh,
      (result) => {
        resolve(result);
      },
      { binary },
    );
  });
}

function exportGltf(sourceObject: Object3D, binary: boolean): Promise<object | ArrayBuffer> {
  const exporter = new GLTFExporter();
  const scene = new Scene();
  scene.add(sourceObject);

  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        resolve(result as object | ArrayBuffer);
      },
      (error) => {
        reject(error);
      },
      {
        binary,
      },
    );
  });
}
