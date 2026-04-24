import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
import {
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Parameter } from '@/types';

type PreviewGeometryOptions = {
  count: number;
  radius: number;
  diameter: number;
  length: number;
  gap: number;
  radialSegments: number;
  tubularSegments: number;
  arcAngle: number | null;
  arcRadius: number | null;
};

export function useOpenScadPreview(
  code: Ref<string>,
  params: Ref<Parameter[]>,
) {
  const geometry = ref<BufferGeometry | null>(null);
  const output = ref<Blob | null>(null);
  const error = ref<Error | null>(null);
  const isCompiling = ref(false);

  const compile = () => {
    if (!code.value.trim()) {
      output.value = null;
      geometry.value?.dispose();
      geometry.value = null;
      error.value = null;
      isCompiling.value = false;
      return;
    }

    isCompiling.value = true;
    error.value = null;

    try {
      const nextGeometry = createNativePreviewGeometry(code.value, params.value);
      geometry.value?.dispose();
      geometry.value = nextGeometry;
      output.value = null;
    } catch (compileError) {
      output.value = null;
      geometry.value?.dispose();
      geometry.value = null;
      error.value = compileError instanceof Error
        ? compileError
        : new Error('Failed to build native three.js preview geometry.');
    } finally {
      isCompiling.value = false;
    }
  };

  watch(
    [() => code.value, () => JSON.stringify(params.value)],
    () => {
      window.requestAnimationFrame(compile);
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    geometry.value?.dispose();
    geometry.value = null;
  });

  return {
    geometry: computed(() => geometry.value),
    output: computed(() => output.value),
    error: computed(() => error.value),
    isCompiling: computed(() => isCompiling.value),
    recompile: compile,
  };
}

function createNativePreviewGeometry(code: string, parameters: Parameter[]): BufferGeometry {
  const options = resolvePreviewGeometryOptions(code, parameters);
  console.log({
    options,
    code,
    parameters,
  })
  return options.arcAngle !== null && options.arcRadius !== null
    ? createArcBundleGeometry(options)
    : createStraightBundleGeometry(options);
}

function resolvePreviewGeometryOptions(_code: string, parameters: Parameter[]): PreviewGeometryOptions {
  const count = Math.max(1, Math.round(readNumber(parameters, [
    'num_strands',
    'strand_count',
    'yarn_count',
    'bundle_count',
    'count',
  ]) ?? 1));

  const diameter = readDiameter(parameters);
  const radius = readRadius(parameters, diameter);
  const length = Math.max(0.1, readNumber(parameters, [
    'strand_length',
    'yarn_length',
    'length',
    'tube_length',
    'height',
  ]) ?? 120);

  const gap = Math.max(0, readNumber(parameters, [
    'spacing',
    'strand_spacing',
    'strand_gap',
    'gap',
    'pitch_gap',
  ]) ?? 0);

  const radialSegments = Math.max(48, Math.round(readNumber(parameters, [
    'radial_segments',
    'resolution',
    'segments',
    '$fn',
  ]) ?? 64));

  const tubularSegments = Math.max(64, Math.round(readNumber(parameters, [
    'tubular_segments',
    'path_segments',
    'curve_segments',
  ]) ?? 96));

  const arcAngle = readNumber(parameters, [
    'arc_angle',
    'curve_angle',
    'bend_angle',
  ]);

  const arcRadius = readNumber(parameters, [
    'arc_radius',
    'curve_radius',
    'bend_radius',
  ]);

  return {
    count,
    radius,
    diameter,
    length,
    gap,
    radialSegments,
    tubularSegments,
    arcAngle,
    arcRadius,
  };
}

function createStraightBundleGeometry(options: PreviewGeometryOptions): BufferGeometry {
  const spacing = options.diameter + options.gap;
  const xStart = -((options.count - 1) * spacing) / 2;
  const strandGeometries: BufferGeometry[] = [];

  for (let index = 0; index < options.count; index += 1) {
    const strand = new CylinderGeometry(
      options.radius,
      options.radius,
      options.length,
      options.radialSegments,
      1,
      false,
    );
    strand.rotateX(Math.PI / 2);
    strand.translate(xStart + spacing * index, 0, 0);
    strandGeometries.push(strand);
  }

  return mergeBundleGeometries(strandGeometries);
}

function createArcBundleGeometry(options: PreviewGeometryOptions): BufferGeometry {
  const spacing = options.diameter + options.gap;
  const xStart = -((options.count - 1) * spacing) / 2;
  const arcRadius = Math.max(options.arcRadius ?? options.length / Math.PI, options.radius * 3);
  const arcAngleRad = normalizeAngleRadians(options.arcAngle ?? 180);
  const strandGeometries: BufferGeometry[] = [];

  for (let index = 0; index < options.count; index += 1) {
    const centerX = xStart + spacing * index;
    const points = buildArcPoints(centerX, arcRadius, arcAngleRad);
    const path = new CatmullRomCurve3(points, false, 'catmullrom', 0.5);
    const strand = new TubeGeometry(
      path,
      options.tubularSegments,
      options.radius,
      options.radialSegments,
      false,
    );
    strandGeometries.push(strand);
  }

  return mergeBundleGeometries(strandGeometries);
}

function mergeBundleGeometries(geometries: BufferGeometry[]): BufferGeometry {
  const merged = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => {
    if (geometry !== merged) {
      geometry.dispose();
    }
  });

  if (!merged) {
    throw new Error('Failed to merge native preview geometries.');
  }

  merged.computeVertexNormals();
  merged.normalizeNormals();
  merged.center();
  return merged;
}

function buildArcPoints(centerX: number, radius: number, angleRad: number): Vector3[] {
  const pointCount = Math.max(24, Math.ceil((Math.abs(angleRad) / Math.PI) * 48));
  const points: Vector3[] = [];
  const start = -angleRad / 2;

  for (let i = 0; i <= pointCount; i += 1) {
    const t = i / pointCount;
    const theta = start + angleRad * t;
    const y = radius * Math.cos(theta);
    const z = radius * Math.sin(theta);
    points.push(new Vector3(centerX, y, z));
  }

  return points;
}

function normalizeAngleRadians(rawAngleDeg: number): number {
  const safeDeg = Math.max(1, Math.min(359, Math.abs(rawAngleDeg)));
  return (safeDeg * Math.PI) / 180;
}

function readDiameter(parameters: Parameter[]): number {
  const explicitDiameter = readNumber(parameters, [
    'strand_diameter',
    'yarn_diameter',
    'diameter',
    'tube_diameter',
  ]);

  if (explicitDiameter !== null) {
    return Math.max(0.1, explicitDiameter);
  }

  const radius = readRadius(parameters, null);
  return Math.max(0.1, radius * 2);
}

function readRadius(parameters: Parameter[], knownDiameter: number | null): number {
  const explicitRadius = readNumber(parameters, [
    'strand_radius',
    'yarn_radius',
    'radius',
    'tube_radius',
  ]);

  if (explicitRadius !== null) {
    return Math.max(0.05, explicitRadius);
  }

  const fallbackDiameter = knownDiameter ?? 2;
  return Math.max(0.05, fallbackDiameter / 2);
}

function readNumber(parameters: Parameter[], names: string[]): number | null {
  const lookup = new Map(
    parameters.map((parameter) => [parameter.name.trim().toLowerCase(), parameter]),
  );

  for (const name of names) {
    const candidate = lookup.get(name.toLowerCase());
    if (!candidate) {
      continue;
    }

    const value = Number(candidate.value);
    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}
