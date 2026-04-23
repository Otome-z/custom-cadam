declare module 'three' {
  export class BufferGeometry {
    center(): this;
    computeVertexNormals(): void;
    computeBoundingBox(): void;
    normalizeNormals(): void;
    dispose(): void;
    boundingBox: Box3 | null;
  }

  export class Material {
    dispose(): void;
  }

  export class Mesh {
    constructor(geometry?: BufferGeometry, material?: Material);
    rotation: { x: number };
    position: { x: number; y: number };
    geometry: BufferGeometry;
    material: Material;
    castShadow: boolean;
    receiveShadow: boolean;
  }

  export class WebGLRenderer {
    constructor(options?: Record<string, unknown>);
    domElement: HTMLCanvasElement;
    outputColorSpace: unknown;
    shadowMap: { enabled: boolean };
    setPixelRatio(value: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
    render(scene: Scene, camera: PerspectiveCamera): void;
    dispose(): void;
  }

  export class Scene {
    background: unknown;
    add(...objects: unknown[]): void;
    remove(...objects: unknown[]): void;
  }

  export class PerspectiveCamera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    position: { set(x: number, y: number, z: number): void };
    aspect: number;
    near: number;
    far: number;
    updateProjectionMatrix(): void;
  }

  export class Color {
    constructor(color?: unknown);
  }

  export class HemisphereLight {
    constructor(skyColor?: unknown, groundColor?: unknown, intensity?: number);
  }

  export class DirectionalLight {
    constructor(color?: unknown, intensity?: number);
    position: { set(x: number, y: number, z: number): void };
    castShadow: boolean;
  }

  export class CircleGeometry extends BufferGeometry {
    constructor(radius?: number, segments?: number);
  }

  export class CylinderGeometry extends BufferGeometry {
    constructor(
      radiusTop?: number,
      radiusBottom?: number,
      height?: number,
      radialSegments?: number,
    );
  }

  export class MeshStandardMaterial extends Material {
    constructor(parameters?: Record<string, unknown>);
  }

  export class MeshPhysicalMaterial extends Material {
    constructor(parameters?: Record<string, unknown>);
  }

  export class CanvasTexture {
    constructor(canvas: HTMLCanvasElement);
    wrapS: unknown;
    wrapT: unknown;
    anisotropy: number;
    colorSpace: unknown;
    repeat: {
      set(x: number, y: number): void;
    };
    dispose(): void;
  }

  export class Box3 {
    setFromObject(object: unknown): this;
    getSize(target: Vector3): Vector3;
    getCenter(target: Vector3): Vector3;
  }

  export class Vector3 {
    constructor(x?: number, y?: number, z?: number);
    x: number;
    y: number;
    z: number;
    set(x: number, y: number, z: number): this;
  }

  export const SRGBColorSpace: unknown;
  export const NoColorSpace: unknown;
  export const RepeatWrapping: unknown;
}

declare module 'three/examples/jsm/controls/OrbitControls.js' {
  export class OrbitControls {
    constructor(object: unknown, domElement: HTMLElement);
    enableDamping: boolean;
    dampingFactor: number;
    target: {
      set(x: number, y: number, z: number): void;
      copy(value: unknown): void;
    };
    update(): void;
    dispose(): void;
  }
}

declare module 'three/examples/jsm/loaders/STLLoader.js' {
  import type { BufferGeometry } from 'three';

  export class STLLoader {
    parse(data: ArrayBufferLike): BufferGeometry;
  }
}

declare module 'three/examples/jsm/utils/BufferGeometryUtils.js' {
  import type { BufferGeometry } from 'three';

  export function mergeVertices(
    geometry: BufferGeometry,
    tolerance?: number,
  ): BufferGeometry;
}
