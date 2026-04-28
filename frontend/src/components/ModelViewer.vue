<template>
  <div class="viewer-shell">
    <div ref="canvasHost" class="viewer-canvas"></div>

    <div v-if="loading" class="viewer-overlay">
      <span>创建模型中...</span>
    </div>
    <div v-else-if="error" class="viewer-overlay viewer-overlay-error">
      <div class="viewer-error-card">
        <span>{{ error.message }}</span>
        <button
          v-if="showRecreate"
          class="viewer-recreate-button"
          type="button"
          @click="$emit('recreate')"
        >
          重新创建
        </button>
      </div>
    </div>
    <div v-else-if="!hasRenderableModel" class="viewer-overlay viewer-overlay-idle">
      <span>待生成模型</span>
    </div>

    <div v-if="hasRenderableModel" class="viewer-metrics">
      <span>{{ metricText.native }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { BufferGeometry, Mesh } from 'three';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Parameter } from '@/types';
import { createWovenTubeGroup } from '@/utils/wovenGeometry';

const props = defineProps<{
  geometry: BufferGeometry | null;
  code: string;
  parameters: Parameter[];
  modelSpec?: any | null;
  loading: boolean;
  error: Error | null;
  showRecreate?: boolean;
}>();

defineEmits<{
  recreate: [];
}>();

const canvasHost = ref<HTMLDivElement | null>(null);

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;
let modelMesh: Mesh | null = null;
let modelGroup: THREE.Group | null = null;
let animationFrame = 0;
let resizeObserver: ResizeObserver | null = null;
const metricText = ref({
  native: 'Native: -',
});
const hasWovenCatalogTag = computed(() => props.code.includes('catalog_model: woven_yarn_sheet'));
const isYarnPathCollection = computed(() => props.modelSpec?.modelType === 'yarn_path_collection');
const hasRenderableModel = computed(
  () => isYarnPathCollection.value || hasWovenCatalogTag.value || Boolean(props.geometry),
);

function initScene() {
  if (!canvasHost.value) {
    return;
  }

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  canvasHost.value.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color('#091017');

  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(160, 120, 160);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0, 18, 0);

  const hemiLight = new THREE.HemisphereLight('#f6eee1', '#0a141a', 1.2);
  const keyLight = new THREE.DirectionalLight('#fff4dd', 1.6);
  keyLight.position.set(180, 220, 120);
  keyLight.castShadow = true;

  const fillLight = new THREE.DirectionalLight('#a7ddff', 0.6);
  fillLight.position.set(-120, 100, -80);

  const rimLight = new THREE.DirectionalLight('#c1ffd9', 0.5);
  rimLight.position.set(60, 40, -180);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(180, 64),
    new THREE.MeshStandardMaterial({
      color: '#0f1a21',
      roughness: 1,
      metalness: 0,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.6;

  scene.add(hemiLight, keyLight, fillLight, rimLight, floor);

  resizeObserver = new ResizeObserver(() => resizeRenderer());
  resizeObserver.observe(canvasHost.value);
  resizeRenderer();
  animate();
}

function resizeRenderer() {
  if (!renderer || !camera || !canvasHost.value) {
    return;
  }

  const { clientWidth, clientHeight } = canvasHost.value;
  renderer.setSize(clientWidth, clientHeight, false);
  camera.aspect = clientWidth / Math.max(clientHeight, 1);
  camera.updateProjectionMatrix();
}

function fitCameraToMesh() {
  if (!camera || !controls) {
    return;
  }

  const target = modelGroup || modelMesh;
  if (!target) {
    return;
  }

  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const distance = maxDim * 2.4;

  camera.near = Math.max(0.1, maxDim / 100);
  camera.far = Math.max(1000, maxDim * 20);
  camera.position.set(center.x + distance, center.y + distance * 0.65, center.z + distance);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
}

function disposeObject3D(node: THREE.Object3D) {
  node.traverse((child) => {
    const maybeMesh = child as THREE.Mesh;
    if (maybeMesh.geometry) {
      maybeMesh.geometry.dispose();
    }
    const material = maybeMesh.material;
    if (Array.isArray(material)) {
      material.forEach((item) => item.dispose());
    } else {
      material?.dispose();
    }
  });
}

function setGeometry(nextGeometry: BufferGeometry | null) {
  if (!scene) {
    return;
  }

  if (modelMesh) {
    scene.remove(modelMesh);
    (modelMesh.material as THREE.Material).dispose();
    modelMesh = null;
  }
  if (modelGroup) {
    scene.remove(modelGroup);
    disposeObject3D(modelGroup);
    modelGroup = null;
  }

  if (isYarnPathCollection.value && props.modelSpec) {
    modelGroup = createYarnPathCollectionGroup(props.modelSpec);
    modelGroup.position.x = -36;
    scene.add(modelGroup);
    metricText.value = {
      native: buildStatsLabel('Native', modelGroup, 'tube'),
    };
    fitCameraToMesh();
    return;
  }

  if (hasWovenCatalogTag.value) {
    modelGroup = createWovenTubeGroup(props.parameters);
    modelGroup.position.x = -36;
    scene.add(modelGroup);
    metricText.value = {
      native: buildStatsLabel('Native', modelGroup, 'tube'),
    };
    fitCameraToMesh();
    return;
  }

  if (!nextGeometry) {
    metricText.value = {
      native: 'Native: -',
    };
    return;
  }

  modelMesh = new THREE.Mesh(
    nextGeometry,
    new THREE.MeshStandardMaterial({
      color: '#7a8e2c',
      roughness: 0.24,
      metalness: 0.04,
    }),
  );

  modelMesh.rotation.x = -Math.PI / 2;
  modelMesh.position.x = -36;
  modelMesh.castShadow = true;
  modelMesh.receiveShadow = true;
  scene.add(modelMesh);

  metricText.value = {
    native: buildStatsLabel('Native', modelMesh.geometry, 'native'),
  };

  fitCameraToMesh();
}

function normalizeLinePoint(point: unknown): THREE.Vector3 | null {
  if (!Array.isArray(point)) {
    return null;
  }

  const x = Number(point[0]);
  const y = Number(point[1]);
  const z = Number(point.length >= 3 ? point[2] : 0);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  return new THREE.Vector3(x, y, z);
}

function getLineNumber(line: Record<string, unknown>, key: string, fallback: number): number {
  const value = Number(line[key]);
  return Number.isFinite(value) ? value : fallback;
}

function getLineColor(line: Record<string, unknown>, fallback: string): string {
  const value = line.color;
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function createCurveFromLine(
  line: Record<string, unknown>,
  defaults: { pathSegments: number },
): any | null {
  const rawPoints = Array.isArray(line.points) ? line.points : [];
  const points = rawPoints.map((point) => normalizeLinePoint(point)).filter((point): point is THREE.Vector3 => Boolean(point));
  if (points.length < 2) {
    return null;
  }

  const lineType = typeof line.type === 'string' ? line.type.trim() : 'smoothPolyline';
  if (lineType === 'straight') {
    return new THREE.LineCurve3(points[0], points[1]);
  }

  if (lineType === 'polyline') {
    const curvePath = new (THREE as any).CurvePath();
    for (let index = 0; index < points.length - 1; index += 1) {
      curvePath.add(new THREE.LineCurve3(points[index], points[index + 1]));
    }
    return curvePath;
  }

  if (lineType === 'sine') {
    const start = points[0];
    const end = points[1];
    const direction = new THREE.Vector3(end.x - start.x, end.y - start.y, end.z - start.z);
    const length = Math.sqrt(direction.x ** 2 + direction.y ** 2 + direction.z ** 2);
    if (length <= 0.0001) {
      return new THREE.LineCurve3(start, end);
    }
    direction.set(direction.x / length, direction.y / length, direction.z / length);

    const cross = (a: THREE.Vector3, b: THREE.Vector3) =>
      new THREE.Vector3(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x,
      );
    const magnitude = (v: THREE.Vector3) => Math.sqrt(v.x ** 2 + v.y ** 2 + v.z ** 2);
    const up = new THREE.Vector3(0, 0, 1);
    let normal = cross(direction, up);
    if (magnitude(normal) < 1e-3) {
      normal = cross(direction, new THREE.Vector3(1, 0, 0));
    }
    const normalLength = Math.max(1e-6, magnitude(normal));
    normal.set(normal.x / normalLength, normal.y / normalLength, normal.z / normalLength);

    const sampleCount = Math.max(2, Math.round(getLineNumber(line, 'pathSegments', defaults.pathSegments)));
    const amplitude = Math.max(0, getLineNumber(line, 'amplitude', 0));
    const period = Math.max(0.1, getLineNumber(line, 'period', 8));
    const sinePoints: THREE.Vector3[] = [];

    for (let index = 0; index <= sampleCount; index += 1) {
      const t = index / sampleCount;
      const distance = t * length;
      const basePoint = new THREE.Vector3(
        start.x + direction.x * distance,
        start.y + direction.y * distance,
        start.z + direction.z * distance,
      );
      const offset = Math.sin((distance / period) * Math.PI * 2) * amplitude;
      sinePoints.push(new THREE.Vector3(
        basePoint.x + normal.x * offset,
        basePoint.y + normal.y * offset,
        basePoint.z + normal.z * offset,
      ));
    }

    return new THREE.CatmullRomCurve3(sinePoints, false, 'centripetal');
  }

  if (lineType === 'bezier') {
    if (points.length === 4) {
      return new (THREE as any).CubicBezierCurve3(points[0], points[1], points[2], points[3]);
    }
    if (points.length === 3) {
      return new (THREE as any).QuadraticBezierCurve3(points[0], points[1], points[2]);
    }
  }

  return new THREE.CatmullRomCurve3(points, false, 'centripetal');
}

function createTubeMeshFromLine(
  line: Record<string, unknown>,
  defaults: { yarnDiameter: number; radialSegments: number; pathSegments: number; color: string },
): THREE.Mesh | null {
  const curve = createCurveFromLine(line, defaults);
  if (!curve) {
    return null;
  }

  const yarnDiameter = Math.max(0.1, getLineNumber(line, 'yarnDiameter', defaults.yarnDiameter));
  const radialSegments = Math.max(12, Math.round(getLineNumber(line, 'radialSegments', defaults.radialSegments)));
  const pathSegments = Math.max(2, Math.round(getLineNumber(line, 'pathSegments', defaults.pathSegments)));
  const color = getLineColor(line, defaults.color);

  const geometry = new THREE.TubeGeometry(curve as any, pathSegments, yarnDiameter / 2, radialSegments, false);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.08,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createYarnPathCollectionGroup(modelSpec: any): THREE.Group {
  const group = new THREE.Group();
  const globalDefaults = modelSpec?.globalDefaults ?? {};
  const defaults = {
    yarnDiameter: Number(globalDefaults.yarnDiameter) || 1,
    radialSegments: Number(globalDefaults.radialSegments) || 64,
    pathSegments: Number(globalDefaults.pathSegments) || 80,
    color: typeof globalDefaults.color === 'string' && globalDefaults.color.trim() ? globalDefaults.color.trim() : '#d9ddd0',
  };

  const lines = Array.isArray(modelSpec?.lines) ? modelSpec.lines : [];
  lines.forEach((line: Record<string, unknown>, index: number) => {
    if (!line || typeof line !== 'object') {
      return;
    }

    const mesh = createTubeMeshFromLine(line, defaults);
    if (!mesh) {
      return;
    }

    (mesh as any).userData.lineId = typeof line.id === 'string' && line.id.trim() ? line.id.trim() : `line_${index + 1}`;
    (mesh as any).userData.lineSpec = line;
    group.add(mesh);
  });

  return group;
}

function buildStatsLabel(label: string, object: THREE.Object3D | BufferGeometry, normalMode: string) {
  let vertexCount = 0;
  let triangleCount = 0;

  if (object instanceof THREE.BufferGeometry) {
    const geometryData = object as BufferGeometry & {
      attributes?: { position?: { count?: number } };
      index?: { count?: number } | null;
    };
    vertexCount = geometryData.attributes?.position?.count ?? 0;
    triangleCount = geometryData.index
      ? Math.floor((geometryData.index.count ?? 0) / 3)
      : Math.floor(vertexCount / 3);
  } else {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.geometry) {
        return;
      }
      const geometryData = mesh.geometry as BufferGeometry & {
        attributes?: { position?: { count?: number } };
        index?: { count?: number } | null;
      };
      const childVertices = geometryData.attributes?.position?.count ?? 0;
      const childTriangles = geometryData.index
        ? Math.floor((geometryData.index.count ?? 0) / 3)
        : Math.floor(childVertices / 3);
      vertexCount += childVertices;
      triangleCount += childTriangles;
    });
  }

  return `${label}: v=${vertexCount} / t=${triangleCount} / n=${normalMode}`;
}

function animate() {
  if (!renderer || !scene || !camera) {
    return;
  }

  animationFrame = window.requestAnimationFrame(animate);
  controls?.update();
  renderer.render(scene, camera);
}

onMounted(() => {
  initScene();
  setGeometry(props.geometry);
});

watch(
  () => props.geometry,
  (nextGeometry) => {
    setGeometry(nextGeometry);
  },
);

watch(
  () => [props.code, JSON.stringify(props.parameters), JSON.stringify(props.modelSpec)],
  () => {
    setGeometry(props.geometry);
  },
);

onBeforeUnmount(() => {
  window.cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  controls?.dispose();
  if (modelMesh) {
    (modelMesh.material as THREE.Material).dispose();
  }
  if (modelGroup) {
    disposeObject3D(modelGroup);
  }
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  scene = null;
  camera = null;
  controls = null;
  modelMesh = null;
  modelGroup = null;
});
</script>

<style scoped>
.viewer-metrics {
  position: absolute;
  right: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.45);
  color: #d9e6a8;
  font-size: 12px;
  line-height: 1.35;
  pointer-events: none;
}
</style>
