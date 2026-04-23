<template>
  <div class="viewer-shell">
    <div ref="canvasHost" class="viewer-canvas"></div>

    <div v-if="loading" class="viewer-overlay">
      <span>Compiling OpenSCAD preview...</span>
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
    <div v-else-if="!geometry" class="viewer-overlay viewer-overlay-idle">
      <span>Generate a model to preview it here.</span>
    </div>

    <div v-if="geometry" class="viewer-metrics">
      <span>{{ metricText.stl }}</span>
      <span>{{ metricText.reference }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { BufferGeometry, Mesh } from 'three';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const props = defineProps<{
  geometry: BufferGeometry | null;
  compareEnabled?: boolean;
  compareSpec?: {
    radius: number;
    height: number;
    radialSegments: number;
  } | null;
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
let referenceMesh: Mesh | null = null;
let animationFrame = 0;
let resizeObserver: ResizeObserver | null = null;
const metricText = ref({
  stl: 'STL: -',
  reference: 'Cylinder: -',
});

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
  if (!camera || !controls || !modelMesh) {
    return;
  }

  const box = new THREE.Box3().setFromObject(modelMesh);
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

function setGeometry(nextGeometry: BufferGeometry | null) {
  if (!scene) {
    return;
  }

  if (modelMesh) {
    scene.remove(modelMesh);
    (modelMesh.material as THREE.Material).dispose();
    modelMesh = null;
  }
  if (referenceMesh) {
    scene.remove(referenceMesh);
    referenceMesh.geometry.dispose();
    (referenceMesh.material as THREE.Material).dispose();
    referenceMesh = null;
  }

  if (!nextGeometry) {
    metricText.value = {
      stl: 'STL: -',
      reference: 'Cylinder: -',
    };
    return;
  }

  const shouldCompare = Boolean(props.compareEnabled && props.compareSpec);
  const compareOffset = shouldCompare ? 34 : 0;

  modelMesh = new THREE.Mesh(
    nextGeometry,
    new THREE.MeshStandardMaterial({
      color: '#7a8e2c',
      roughness: 0.24,
      metalness: 0.04,
    }),
  );

  modelMesh.rotation.x = -Math.PI / 2;
  modelMesh.position.x = shouldCompare ? -compareOffset : 0;
  modelMesh.castShadow = true;
  modelMesh.receiveShadow = true;
  scene.add(modelMesh);

  if (shouldCompare && props.compareSpec) {
    referenceMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(
        props.compareSpec.radius,
        props.compareSpec.radius,
        props.compareSpec.height,
        props.compareSpec.radialSegments,
      ),
      new THREE.MeshStandardMaterial({
        color: '#7a8e2c',
        roughness: 0.24,
        metalness: 0.04,
      }),
    );
    referenceMesh.position.x = compareOffset;
    referenceMesh.castShadow = true;
    referenceMesh.receiveShadow = true;
    scene.add(referenceMesh);
  }

  metricText.value = {
    stl: buildStatsLabel('STL', modelMesh.geometry, 'recomputed'),
    reference: referenceMesh
      ? buildStatsLabel('Cylinder', referenceMesh.geometry, 'native')
      : 'Cylinder: -',
  };

  fitCameraToMesh();
}

function buildStatsLabel(label: string, geometry: BufferGeometry, normalMode: string) {
  const geometryData = geometry as BufferGeometry & {
    attributes?: { position?: { count?: number } };
    index?: { count?: number } | null;
  };

  const vertexCount = geometryData.attributes?.position?.count ?? 0;
  const triangleCount = geometryData.index
    ? Math.floor((geometryData.index.count ?? 0) / 3)
    : Math.floor(vertexCount / 3);

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
  () => [props.compareEnabled, props.compareSpec] as const,
  () => {
    setGeometry(props.geometry);
  },
  { deep: true },
);

onBeforeUnmount(() => {
  window.cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  controls?.dispose();
  if (modelMesh) {
    (modelMesh.material as THREE.Material).dispose();
  }
  if (referenceMesh) {
    referenceMesh.geometry.dispose();
    (referenceMesh.material as THREE.Material).dispose();
  }
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  scene = null;
  camera = null;
  controls = null;
  modelMesh = null;
  referenceMesh = null;
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
