import * as THREE from 'three';
import type { Parameter } from '@/types';
import type { ExportFormat } from '@/utils/exportGeometry';

type WovenGeometryMode = 'preview' | 'export';

type WovenGeometryOptions = {
  mode?: WovenGeometryMode;
  format?: ExportFormat;
};

function readNumericParameter(parameters: Parameter[], name: string, fallback: number): number {
  const parameter = parameters.find((item) => item.name === name);
  const rawValue = parameter?.value;
  const value = typeof rawValue === 'number' ? rawValue : Number(rawValue);
  return Number.isFinite(value) ? value : fallback;
}

export function createWovenTubeGroup(parameters: Parameter[], options: WovenGeometryOptions = {}): THREE.Group {
  const mode = options.mode ?? 'preview';
  const isExportMode = mode === 'export';
  const isBinaryStl = options.format === 'stl-binary';

  const radialSegmentBase = Math.round(readNumericParameter(parameters, 'radial_segments', 128));
  const radialSegments = isExportMode
    ? Math.max(8, Math.min(isBinaryStl ? 12 : 16, Math.round(radialSegmentBase / 8)))
    : Math.max(12, radialSegmentBase);
  const yarnDiameter = Math.max(0.2, readNumericParameter(parameters, 'yarn_diameter', 1));
  const radius = yarnDiameter / 2;
  const warpCount = Math.max(1, Math.round(readNumericParameter(parameters, 'warp_count', 10)));
  const warpSpacing = Math.max(0.2, readNumericParameter(parameters, 'warp_spacing', 2));
  const warpLength = Math.max(1, readNumericParameter(parameters, 'warp_length', 100));
  const weftCount = Math.max(1, Math.round(readNumericParameter(parameters, 'weft_count', 10)));
  const weftSpacing = Math.max(0.2, readNumericParameter(parameters, 'weft_spacing', 2));
  const weftLength = Math.max(1, readNumericParameter(parameters, 'weft_length', 100));
  const amplitude = Math.max(0, readNumericParameter(parameters, 'amplitude', yarnDiameter));
  const weftPeriod = Math.max(0.5, readNumericParameter(parameters, 'weft_period', 4 * warpSpacing));
  const pathSegmentBase = Math.round(readNumericParameter(parameters, 'path_segments', 160));
  const pathSegments = isExportMode
    ? Math.max(24, Math.min(pathSegmentBase, isBinaryStl ? 40 : 56))
    : Math.max(64, pathSegmentBase);
  const adaptiveSegmentsRaw = Math.max(pathSegments, Math.ceil(weftLength / Math.max(0.2, yarnDiameter * 0.25)));
  const adaptiveSegments = isExportMode
    ? Math.max(48, Math.min(adaptiveSegmentsRaw, isBinaryStl ? 72 : 96))
    : adaptiveSegmentsRaw;
  const waveSampleSegments = isExportMode
    ? Math.max(96, Math.min(adaptiveSegments * 2, isBinaryStl ? 144 : 192))
    : Math.max(adaptiveSegments * 4, 256);
  const waveTubeSegments = isExportMode
    ? Math.max(96, Math.min(adaptiveSegments * 2, isBinaryStl ? 132 : 180))
    : Math.max(adaptiveSegments * 6, 384);
  const warpTubeSegments = isExportMode ? Math.max(12, Math.min(pathSegments, 24)) : 32;
  const sqrt2 = Math.sqrt(2);

  const group = new THREE.Group();

  const buildMaterial = (hexColor: string) => new THREE.MeshStandardMaterial({
    color: hexColor,
    roughness: 0.24,
    metalness: 0.04,
  });

  for (let i = 0; i < warpCount; i += 1) {
    const cx = (i * warpSpacing) / sqrt2;
    const cy = (-i * warpSpacing) / sqrt2;
    const end = (warpLength * sqrt2);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(cx, cy, 0),
      new THREE.Vector3(cx + end / sqrt2, cy - end / sqrt2, 0),
    ], false, 'centripetal');
    const geometry = new THREE.TubeGeometry(curve, warpTubeSegments, radius, radialSegments, false);
    const material = buildMaterial(i % 2 === 0 ? '#8c9b84' : '#d9ddd0');
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  for (let j = 0; j < weftCount; j += 1) {
    const points: THREE.Vector3[] = [];
    const x0 = (j * weftSpacing) / sqrt2;
    const y0 = (j * weftSpacing) / sqrt2;
    for (let step = 0; step <= waveSampleSegments; step += 1) {
      const s = (step * weftLength) / waveSampleSegments;
      const baseX = s / sqrt2;
      const baseY = -s / sqrt2;
      const disp = amplitude * Math.sin(((360 * s) / weftPeriod + 90) * Math.PI / 180);
      const dispX = disp / sqrt2;
      const dispY = disp / sqrt2;
      points.push(new THREE.Vector3(baseX + dispX + x0, baseY + dispY + y0, 0));
    }
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const geometry = new THREE.TubeGeometry(curve, waveTubeSegments, radius, radialSegments, false);
    const material = buildMaterial(j === 0 ? '#d0b54b' : (j % 2 === 0 ? '#8c9b84' : '#d9ddd0'));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  return group;
}
