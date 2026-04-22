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
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { BufferGeometry, Mesh } from 'three';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const props = defineProps<{
  geometry: BufferGeometry | null;
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
let animationFrame = 0;
let resizeObserver: ResizeObserver | null = null;
let yarnColorMap: THREE.CanvasTexture | null = null;
let yarnBumpMap: THREE.CanvasTexture | null = null;

function createYarnTexture(kind: 'color' | 'bump') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');

  if (!context) {
    return null;
  }

  if (kind === 'color') {
    context.fillStyle = '#c9df66';
    context.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 4) {
      const alpha = 0.08 + Math.random() * 0.08;
      context.fillStyle = `rgba(235,255,180,${alpha.toFixed(3)})`;
      context.fillRect(0, y, 256, 2);
    }

    for (let x = 0; x < 256; x += 6) {
      const alpha = 0.04 + Math.random() * 0.06;
      context.fillStyle = `rgba(110,130,40,${alpha.toFixed(3)})`;
      context.fillRect(x, 0, 1, 256);
    }
  } else {
    context.fillStyle = '#808080';
    context.fillRect(0, 0, 256, 256);

    for (let y = 0; y < 256; y += 4) {
      const light = 120 + Math.floor(Math.random() * 80);
      context.fillStyle = `rgb(${light},${light},${light})`;
      context.fillRect(0, y, 256, 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  texture.colorSpace = kind === 'color' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  return texture;
}

function getYarnMaterial(size: THREE.Vector3) {
  if (!yarnColorMap) {
    yarnColorMap = createYarnTexture('color');
  }

  if (!yarnBumpMap) {
    yarnBumpMap = createYarnTexture('bump');
  }

  const maxDim = Math.max(size.x, size.y, size.z, 1);
  const repeat = Math.max(2, Math.round(maxDim / 12));

  yarnColorMap?.repeat.set(repeat, repeat);
  yarnBumpMap?.repeat.set(repeat * 1.6, repeat * 1.6);

  return new THREE.MeshPhysicalMaterial({
    color: '#cfdf6f',
    map: yarnColorMap ?? undefined,
    bumpMap: yarnBumpMap ?? undefined,
    bumpScale: 0.35,
    roughness: 0.92,
    metalness: 0,
    sheen: 0.6,
    sheenColor: new THREE.Color('#eff8c8'),
    sheenRoughness: 0.85,
    clearcoat: 0.04,
    clearcoatRoughness: 1,
  });
}

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

  if (!nextGeometry) {
    return;
  }

  nextGeometry.computeBoundingBox();
  const bounds = nextGeometry.boundingBox;
  const size = bounds
    ? bounds.getSize(new THREE.Vector3())
    : new THREE.Vector3(80, 80, 80);

  modelMesh = new THREE.Mesh(
    nextGeometry,
    getYarnMaterial(size),
  );

  modelMesh.rotation.x = -Math.PI / 2;
  modelMesh.castShadow = true;
  modelMesh.receiveShadow = true;
  scene.add(modelMesh);
  fitCameraToMesh();
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

onBeforeUnmount(() => {
  window.cancelAnimationFrame(animationFrame);
  resizeObserver?.disconnect();
  controls?.dispose();
  if (modelMesh) {
    (modelMesh.material as THREE.Material).dispose();
  }
  yarnColorMap?.dispose();
  yarnBumpMap?.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
  renderer = null;
  scene = null;
  camera = null;
  controls = null;
  modelMesh = null;
  yarnColorMap = null;
  yarnBumpMap = null;
});
</script>
