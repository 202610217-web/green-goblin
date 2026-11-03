/* =================================================================
   scene.js — Three.js 3D 화면 담당
   - 카메라(비스듬히 내려다보는 시점), 마우스 회전/확대
   - 던전 단면도(층, 벽, 사다리, 횃불, 지상)
   - 칸 선택(마우스 올리기/클릭), 방 모델 배치
   - 손님 3D 모델, 동전/글자 효과
   게임 규칙(골드 계산 등)은 여기서 다루지 않는다 → game.js
   ================================================================= */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CONFIG, LAYOUT, GRAPHICS, GUEST_TYPES } from './config.js';
import {
  mat, buildRoomModel, createGoblin, createAdventurer, animateCharacter,
  makeEmojiSprite, makeTextSprite, emojiTexture, makeBrickTexture,
} from './models.js';

/* ---------------- 좌표 계산 ----------------
   x: 왼쪽(입구 통로) → 오른쪽(방 4칸)
   y: 위(지상) → 아래(지하 3층). 지하 1층 바닥 높이 = 0
   z: 뒤(뒷벽 -2) → 앞(관객 쪽 +2) */
const { CELL_W, CELL_H, CELL_D, SHAFT_W, SLAB } = LAYOUT;
const TOTAL_W = SHAFT_W + CELL_W * CONFIG.COLS;
const LEFT = -TOTAL_W / 2;
const RIGHT = TOTAL_W / 2;
const BACK_Z = -CELL_D / 2;
const FRONT_Z = CELL_D / 2;
const SURFACE_Y = CELL_H;             // 지상 높이
const CORRIDOR_Z = 1.35;              // 손님이 걸어다니는 앞쪽 복도
const LADDER_Z = 0.9;                 // 사다리 앞(손님이 오르내리는 곳)
export const SHAFT_X = LEFT + SHAFT_W / 2;

export const floorY = (f) => -f * CELL_H;                        // f층 바닥 높이
export const roomCenterX = (c) => LEFT + SHAFT_W + CELL_W * (c + 0.5);

/* ---------------- 내부 변수 ---------------- */
let renderer, scene, camera, controls;
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const hitBoxes = [];                  // 클릭 판정용 투명 상자들
const cells = {};                     // '층,칸' → { hit, tile, room, sign }
const floors = [];                    // 층별 { cover, lights, flames }
const roomAnimations = new Set();     // 움직이는 방 모델들
const guestMeshes = new Map();        // 손님 id → 3D 모델
const effects = [];                   // 동전, 떠오르는 글자 등
let boss = null;
const surfaceFlames = [];             // 지상 입구 횃불 불꽃
let hoveredKey = null;
let elapsed = 0;

const key = (f, c) => `${f},${c}`;

// 장면에서 빼낸 모델의 도형/재질을 메모리에서 해제 (공용 재질은 남김)
function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && !o.material.userData.shared) {
      if (o.isSprite && o.material.map && !o.material.map.userData.shared) o.material.map.dispose();
      o.material.dispose();
    }
  });
}

/* =================================================================
   초기화
   ================================================================= */
export function initScene(container) {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, GRAPHICS.MAX_PIXEL_RATIO));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(GRAPHICS.BACKGROUND);
  scene.fog = new THREE.Fog(GRAPHICS.BACKGROUND, 40, 85);

  // 카메라: 오른쪽 위 앞에서 비스듬히 내려다보는 시점 (아이소메트릭 느낌)
  camera = new THREE.PerspectiveCamera(35, container.clientWidth / container.clientHeight, 0.1, 200);
  camera.position.set(10, 6.5, 33);

  // 마우스 드래그 = 회전, 휠 = 확대/축소, 오른쪽 드래그 = 이동
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, -1.6, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = GRAPHICS.CAMERA_MIN_DIST;
  controls.maxDistance = GRAPHICS.CAMERA_MAX_DIST;
  controls.minPolarAngle = 0.45;           // 너무 위에서 보지 않도록
  controls.maxPolarAngle = 1.5;            // 바닥 아래로 내려가지 않도록
  controls.minAzimuthAngle = -1.1;         // 던전 뒤쪽으로 돌아가지 않도록
  controls.maxAzimuthAngle = 1.1;
  fitCameraToScreen();
  controls.update();

  buildLights();
  buildDungeon();
  buildSurface();

  window.addEventListener('resize', () => onResize(container));
  return renderer.domElement;
}

function onResize(container) {
  const w = container.clientWidth, h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  fitCameraToScreen();
}

// 세로로 긴 화면(휴대폰)에서도 던전 가로 전체가 보이도록 카메라 거리를 맞춘다
function fitCameraToScreen() {
  const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
  const needed = (TOTAL_W + 4) / (2 * Math.tan(hFov / 2));      // 던전 너비 + 여유
  controls.maxDistance = Math.max(GRAPHICS.CAMERA_MAX_DIST, needed * 1.3);
  const offset = camera.position.clone().sub(controls.target);
  if (offset.length() < needed) {
    offset.setLength(needed);
    camera.position.copy(controls.target).add(offset);
  }
}

/* ---------------- 조명 ---------------- */
function buildLights() {
  // 전체를 은은하게: 위는 보라, 아래는 초록빛
  scene.add(new THREE.HemisphereLight(0x9a7ad0, 0x2a4a2a, 1.4));
  // 앞에서 비추는 달빛 (단면도가 잘 보이도록)
  const moon = new THREE.DirectionalLight(0xc8b8ff, 1.3);
  moon.position.set(6, 14, 20);
  scene.add(moon);
}

/* ---------------- 던전 본체 ---------------- */
function buildDungeon() {
  const bottomY = floorY(CONFIG.FLOORS - 1) - SLAB;
  const totalH = SURFACE_Y - bottomY;

  // 뒷벽 (돌벽돌 텍스처)
  const wallTex = makeBrickTexture('#2c1d45', '#120a1f', TOTAL_W / 4, totalH / 4);
  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(TOTAL_W, totalH, 0.3),
    new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95 }),
  );
  backWall.position.set(0, bottomY + totalH / 2, BACK_Z - 0.15);
  scene.add(backWall);

  // 바깥 흙(양옆, 아래) — 단면도 느낌
  const earth = new THREE.MeshStandardMaterial({ map: makeBrickTexture('#24183a', '#0e0818', 4, 4), roughness: 1 });
  const sideW = 14;
  const leftEarth = new THREE.Mesh(new THREE.BoxGeometry(sideW, totalH, 16), earth);
  leftEarth.position.set(LEFT - sideW / 2, bottomY + totalH / 2 - SLAB, BACK_Z + CELL_D - 8);
  scene.add(leftEarth);
  const rightEarth = leftEarth.clone();
  rightEarth.position.x = RIGHT + sideW / 2;
  scene.add(rightEarth);
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(TOTAL_W + sideW * 2, 3, 16), earth);
  bottom.position.set(0, bottomY - 1.5 - SLAB, BACK_Z + CELL_D - 8);
  scene.add(bottom);

  const slabMat = mat(0x3a2a52);
  const tileEmpty = mat(0x3a2c52);
  const mossMat = mat(0x3f8a3a, { emissive: 0x0f2a0c });
  const dividerMat = new THREE.MeshStandardMaterial({ map: makeBrickTexture('#33224f', '#150c24', 1, 1), roughness: 0.9 });

  for (let f = 0; f < CONFIG.FLOORS; f++) {
    const y = floorY(f);
    const floorInfo = { lights: [], flames: [], cover: null, label: null };
    floors.push(floorInfo);

    // 방 칸마다: 바닥 타일 + 클릭 판정 상자
    for (let c = 0; c < CONFIG.COLS; c++) {
      const x = roomCenterX(c);
      const tile = new THREE.Mesh(new THREE.BoxGeometry(CELL_W, SLAB, CELL_D), tileEmpty);
      tile.position.set(x, y - SLAB / 2, 0);
      scene.add(tile);

      const hitMat = new THREE.MeshBasicMaterial({ color: 0x6fdc6f, transparent: true, opacity: 0, depthWrite: false });
      const hit = new THREE.Mesh(new THREE.BoxGeometry(CELL_W - 0.15, CELL_H - SLAB - 0.05, CELL_D - 0.1), hitMat);
      hit.position.set(x, y + (CELL_H - SLAB) / 2, 0);
      hit.userData = { floor: f, col: c };
      scene.add(hit);
      hitBoxes.push(hit);
      cells[key(f, c)] = { hit, tile, room: null, sign: null };
    }

    // 입구/사다리 통로 칸의 클릭 판정
    const shaftHit = new THREE.Mesh(
      new THREE.BoxGeometry(SHAFT_W - 0.1, CELL_H - SLAB, CELL_D - 0.1),
      new THREE.MeshBasicMaterial({ color: 0x6fdc6f, transparent: true, opacity: 0, depthWrite: false }),
    );
    shaftHit.position.set(SHAFT_X, y + (CELL_H - SLAB) / 2, 0);
    shaftHit.userData = { floor: f, col: -1 };
    scene.add(shaftHit);
    hitBoxes.push(shaftHit);
    cells[key(f, -1)] = { hit: shaftHit };

    // 통로 뒤쪽 좁은 발판 (층 표시 간판이 놓이는 곳)
    const ledge = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_W, SLAB, 1.2), slabMat);
    ledge.position.set(SHAFT_X, y - SLAB / 2, BACK_Z + 0.6);
    scene.add(ledge);
    const floorSign = makeTextSprite(`지하 ${f + 1}층`, { color: '#cfe9c7', bg: 'rgba(20,12,32,0.85)', border: '#3f8a3a', height: 0.42 });
    floorSign.position.set(SHAFT_X - 0.4, y + 1.75, BACK_Z + 0.5);
    scene.add(floorSign);

    // 방 사이 칸막이 벽 (앞쪽 복도는 열어 둠)
    for (let c = 0; c <= CONFIG.COLS; c++) {
      const x = LEFT + SHAFT_W + c * CELL_W;
      const depth = c === CONFIG.COLS ? CELL_D : CELL_D * 0.62;    // 맨 오른쪽 벽은 끝까지
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.2, CELL_H - SLAB, depth), dividerMat);
      wall.position.set(x, y + (CELL_H - SLAB) / 2, BACK_Z + depth / 2);
      scene.add(wall);
    }

    // 층 앞쪽 가장자리의 이끼 띠 (층 구분이 잘 보이도록)
    const moss = new THREE.Mesh(new THREE.BoxGeometry(TOTAL_W, 0.08, 0.12), mossMat);
    moss.position.set(0, y - 0.04, FRONT_Z);
    scene.add(moss);

    // 횃불: 칸막이마다 하나씩 (조명은 층마다 2개만 → 성능)
    for (let c = 0; c <= CONFIG.COLS; c++) {
      const x = LEFT + SHAFT_W + c * CELL_W;
      const flame = buildTorch(x, y + 1.9, BACK_Z + 0.22);
      floorInfo.flames.push(flame);
    }
    for (const c of [1, 3]) {
      const light = new THREE.PointLight(0xff8a3a, GRAPHICS.TORCH_INTENSITY, GRAPHICS.TORCH_DISTANCE, 1.3);
      light.position.set(LEFT + SHAFT_W + c * CELL_W, y + 1.9, BACK_Z + 1.2);
      light.userData.phase = Math.random() * 10;
      scene.add(light);
      floorInfo.lights.push(light);
    }

    // 잠긴 층 덮개: 어두운 바위 덩어리 + 자물쇠
    const cover = new THREE.Group();
    const coverBox = new THREE.Mesh(
      new THREE.BoxGeometry(TOTAL_W - 0.05, CELL_H - SLAB, CELL_D - 0.05),
      new THREE.MeshStandardMaterial({ color: 0x0b0714, transparent: true, opacity: 0.88, roughness: 1 }),
    );
    coverBox.position.set(0, y + (CELL_H - SLAB) / 2, 0);
    cover.add(coverBox);
    const lock = makeEmojiSprite('🔒', 1.0);
    lock.position.set(0, y + 1.75, FRONT_Z + 0.3);
    cover.add(lock);
    const lockText = makeTextSprite(`지하 ${f + 1}층 · 잠김`, { color: '#a597c4', height: 0.45 });
    lockText.position.set(0, y + 0.85, FRONT_Z + 0.3);
    cover.add(lockText);
    cover.visible = false;
    scene.add(cover);
    floorInfo.cover = cover;
  }

  // 맨 아래 바닥
  const base = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_W, SLAB, CELL_D), slabMat);
  base.position.set(SHAFT_X, floorY(CONFIG.FLOORS - 1) - SLAB / 2, 0);
  scene.add(base);

  // 맨 왼쪽 바깥 벽
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.2, totalH, CELL_D), dividerMat);
  leftWall.position.set(LEFT - 0.1, bottomY + totalH / 2, 0);
  scene.add(leftWall);

  buildLadder();
}

// 횃불 하나: 나무 손잡이 + 깜빡이는 불꽃
function buildTorch(x, y, z) {
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.45, 6), mat(0x4a2e1e));
  handle.position.set(x, y - 0.15, z);
  handle.rotation.x = 0.35;
  scene.add(handle);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.3, 8), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  flame.position.set(x, y + 0.15, z + 0.08);
  flame.userData.phase = Math.random() * 10;
  scene.add(flame);
  return flame;
}

// 통로의 사다리 (지상 → 맨 아래층까지)
function buildLadder() {
  const top = SURFACE_Y + 0.8;
  const bottom = floorY(CONFIG.FLOORS - 1);
  const h = top - bottom;
  const wood = mat(0x6a4426);
  for (const dx of [-0.45, 0.45]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 6), wood);
    rail.position.set(SHAFT_X + dx, bottom + h / 2, LADDER_Z - 0.4);
    scene.add(rail);
  }
  for (let y = bottom + 0.35; y < top; y += 0.45) {
    const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 6), wood);
    rung.rotation.z = Math.PI / 2;
    rung.position.set(SHAFT_X, y, LADDER_Z - 0.4);
    scene.add(rung);
  }
}

/* ---------------- 지상: 풀밭, 입구 아치, 나무, 고블린 사장 ---------------- */
function buildSurface() {
  const grass = mat(0x2f5a2a, { roughness: 1 });
  const dirt = mat(0x3a2a20, { roughness: 1 });
  // 지상 땅 (통로 위는 구멍)
  const groundL = new THREE.Mesh(new THREE.BoxGeometry(14, SLAB, 16), grass);
  groundL.position.set(LEFT - 7, SURFACE_Y - SLAB / 2, BACK_Z + CELL_D - 8);
  scene.add(groundL);
  const roomsW = RIGHT - (LEFT + SHAFT_W) + 14;
  const groundR = new THREE.Mesh(new THREE.BoxGeometry(roomsW, SLAB, 16), grass);
  groundR.position.set(LEFT + SHAFT_W + roomsW / 2, SURFACE_Y - SLAB / 2, BACK_Z + CELL_D - 8);
  scene.add(groundR);
  // 통로 뒤쪽 지붕(사다리 구멍만 남김)
  const shaftRoof = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_W, SLAB, 14), grass);
  shaftRoof.position.set(SHAFT_X, SURFACE_Y - SLAB / 2, BACK_Z - 7);
  scene.add(shaftRoof);
  // 지하 1층 천장 아래쪽 흙 띠
  const under = new THREE.Mesh(new THREE.BoxGeometry(TOTAL_W - SHAFT_W, 0.05, CELL_D), dirt);
  under.position.set((LEFT + SHAFT_W + RIGHT) / 2, SURFACE_Y - SLAB - 0.03, 0);
  scene.add(under);

  // 입구 아치 (돌기둥 2개 + 간판)
  const stone = mat(0x4a3a5e);
  for (const dx of [-SHAFT_W / 2 - 0.1, SHAFT_W / 2 + 0.1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.4), stone);
    pillar.position.set(SHAFT_X + dx, SURFACE_Y + 1.3, LADDER_Z);
    scene.add(pillar);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(SHAFT_W + 0.8, 0.4, 0.5), stone);
  beam.position.set(SHAFT_X, SURFACE_Y + 2.7, LADDER_Z);
  scene.add(beam);
  const sign = makeTextSprite('🏰 고블린 던전 호텔', { color: '#6fdc6f', bg: 'rgba(25,14,40,0.92)', border: '#6fdc6f', height: 0.75 });
  sign.position.set(SHAFT_X, SURFACE_Y + 3.45, LADDER_Z);
  scene.add(sign);
  // 입구 횃불 2개
  for (const dx of [-SHAFT_W / 2 - 0.1, SHAFT_W / 2 + 0.1]) {
    const flame = buildTorch(SHAFT_X + dx, SURFACE_Y + 2.95, LADDER_Z + 0.1);
    surfaceFlames.push(flame);
  }
  const gateLight = new THREE.PointLight(0xff8a3a, GRAPHICS.TORCH_INTENSITY, GRAPHICS.TORCH_DISTANCE, 1.3);
  gateLight.position.set(SHAFT_X, SURFACE_Y + 2.4, LADDER_Z + 1.5);
  scene.add(gateLight);

  // 나무와 바위 (장식)
  const trunk = mat(0x3a2618);
  const leaf = mat(0x1f4a2a, { roughness: 0.9 });
  const trees = [[LEFT - 9, -5], [LEFT - 5, -8], [2, -6], [8, -4], [-3, -9], [RIGHT + 4, -6], [LEFT - 11, 2]];
  for (const [x, z] of trees) {
    const s = 0.8 + Math.random() * 0.6;
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.2 * s, 1.2 * s, 6), trunk);
    t.position.set(x, SURFACE_Y + 0.6 * s, z);
    scene.add(t);
    for (let i = 0; i < 3; i++) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry((1.0 - i * 0.25) * s, 1.2 * s, 7), leaf);
      cone.position.set(x, SURFACE_Y + (1.3 + i * 0.6) * s, z);
      scene.add(cone);
    }
  }
  const rockMat = mat(0x3d3448, { flatShading: true });
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.3 + Math.random() * 0.4), rockMat);
    r.position.set(LEFT - 3 - Math.random() * 10, SURFACE_Y, -Math.random() * 8);
    scene.add(r);
  }

  // 고블린 사장: 입구 옆에서 손님을 맞이한다
  boss = createGoblin({ boss: true, scale: 1.15 });
  boss.position.set(LEFT - 1.3, SURFACE_Y, -0.2);   // 손님이 지나가는 길(앞쪽) 뒤에 선다
  boss.rotation.y = 0.4;
  scene.add(boss);
}

/* =================================================================
   외부에서 쓰는 함수들
   ================================================================= */

// 층 잠금 표시 켜기/끄기 (잠긴 층은 어둡게 + 횃불 꺼짐)
export function setFloorLocked(f, locked) {
  const info = floors[f];
  info.cover.visible = locked;
  info.lights.forEach((l) => (l.visible = !locked));
  info.flames.forEach((fl) => (fl.visible = !locked));
}

// 칸에 방 모델 놓기 / 치우기 (typeKey가 null이면 치움)
export function setRoomModel(f, c, typeKey, roomInfo) {
  const cell = cells[key(f, c)];
  if (cell.room) {
    scene.remove(cell.room);
    roomAnimations.delete(cell.room);
    disposeObject(cell.room);
    cell.room = null;
  }
  if (cell.sign) {
    scene.remove(cell.sign);
    disposeObject(cell.sign);
    cell.sign = null;
  }
  if (!typeKey) return;
  const model = buildRoomModel(typeKey);
  model.position.set(roomCenterX(c), floorY(f), 0);
  scene.add(model);
  if (model.userData.update) roomAnimations.add(model);
  cell.room = model;
  // 방 이름 간판
  const sign = makeTextSprite(`${roomInfo.emoji} ${roomInfo.name}`, { color: '#fff', bg: 'rgba(15,8,25,0.8)', border: roomInfo.color, height: 0.36 });
  sign.position.set(roomCenterX(c), floorY(f) + 1.95, BACK_Z + 0.45);
  scene.add(sign);
  cell.sign = sign;
}

// 마우스 위치의 칸 찾기 → { floor, col } (col -1 = 통로) 또는 null
export function pickCell(clientX, clientY) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObjects(hitBoxes, false);
  return hits.length ? hits[0].object.userData : null;
}

// 칸 강조 표시. mode: 'build'(초록) | 'demolish'(주황) | 'deny'(빨강) | null
const HOVER_COLORS = { build: 0x6fdc6f, demolish: 0xff9a3a, deny: 0xff4a4a, info: 0xa597c4 };
export function setHover(cell, mode) {
  if (hoveredKey) {
    const prev = cells[hoveredKey];
    if (prev) prev.hit.material.opacity = 0;
  }
  hoveredKey = null;
  if (!cell || !mode) return;
  const k = key(cell.floor, cell.col);
  const target = cells[k];
  if (!target) return;
  target.hit.material.color.setHex(HOVER_COLORS[mode]);
  target.hit.material.opacity = 0.2;
  hoveredKey = k;
}

/* ---------------- 손님 경로 ----------------
   경로는 {x,y,z} 점들의 배열. game.js가 이 점들을 따라 손님을 움직인다. */
export function spawnPoint() {
  return { x: LEFT - 9, y: SURFACE_Y, z: CORRIDOR_Z + 0.3 };
}
// 방에서 손님이 서 있는 자리
export function roomStandPoint(f, c) {
  return { x: roomCenterX(c) + 1.15, y: floorY(f), z: 0.35 };
}
// 지상 → 사다리 → 해당 층 복도 → 방
export function pathToRoom(f, c) {
  return [
    { x: SHAFT_X, y: SURFACE_Y, z: LADDER_Z },
    { x: SHAFT_X, y: floorY(f), z: LADDER_Z },
    { x: SHAFT_X + 0.6, y: floorY(f), z: CORRIDOR_Z },
    { x: roomCenterX(c) + 1.15, y: floorY(f), z: CORRIDOR_Z },
    roomStandPoint(f, c),
  ];
}
// 방 → 복도 → 사다리 → 지상 → 멀리 떠남
export function pathFromRoom(f, c) {
  const p = pathToRoom(f, c).reverse().slice(1);
  p.push(spawnPoint());
  return p;
}
// 빈 방이 없어 화난 손님: 1층 통로까지 내려와 둘러보고 다시 올라감
export function pathAngryVisit() {
  return [
    { x: SHAFT_X, y: SURFACE_Y, z: LADDER_Z },
    { x: SHAFT_X, y: floorY(0), z: LADDER_Z },
    { x: SHAFT_X + 0.8, y: floorY(0), z: CORRIDOR_Z },
    { x: SHAFT_X, y: floorY(0), z: LADDER_Z },
    { x: SHAFT_X, y: SURFACE_Y, z: LADDER_Z },
    spawnPoint(),
  ];
}

/* ---------------- 손님 3D 모델 ---------------- */
export function addGuestMesh(guest) {
  const gt = GUEST_TYPES[guest.type];
  const model = createAdventurer(guest.type, gt.color);
  model.scale.setScalar(guest.vip ? 1.1 : 1);
  const mood = makeEmojiSprite('😐', 0.75);
  mood.position.y = 2.05;
  model.add(mood);
  model.userData.mood = mood;
  model.userData.moodEmoji = '😐';
  model.position.set(guest.pos.x, guest.pos.y, guest.pos.z);
  scene.add(model);
  guestMeshes.set(guest.id, model);
}

// 손님 모델 위치/방향/기분 갱신
export function updateGuestMesh(guest, moodEmoji, walking) {
  const model = guestMeshes.get(guest.id);
  if (!model) return;
  model.position.set(guest.pos.x, guest.pos.y, guest.pos.z);
  model.rotation.y = guest.facing ?? 0;
  if (walking) model.position.y += Math.abs(Math.sin(elapsed * 11)) * 0.06;   // 통통 걷기
  animateCharacter(model, elapsed + guest.id, walking);
  if (model.userData.moodEmoji !== moodEmoji) {
    model.userData.mood.material.map = emojiTexture(moodEmoji);
    model.userData.mood.material.needsUpdate = true;
    model.userData.moodEmoji = moodEmoji;
  }
}

export function removeGuestMesh(id) {
  const model = guestMeshes.get(id);
  if (!model) return;
  scene.remove(model);
  disposeObject(model);
  guestMeshes.delete(id);
}

/* ---------------- 효과: 튀어오르는 동전 / 떠오르는 글자 ---------------- */
const coinGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.04, 14);
const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd257, metalness: 0.8, roughness: 0.3, emissive: 0x6a4a00 });

export function spawnCoins(pos, count) {
  for (let i = 0; i < count; i++) {
    const coin = new THREE.Mesh(coinGeo, coinMat);
    coin.position.set(pos.x, pos.y + 1.2, pos.z);
    coin.rotation.x = Math.PI / 2;
    scene.add(coin);
    effects.push({
      obj: coin, life: 1.3, maxLife: 1.3, floorY: pos.y + 0.05,
      vel: new THREE.Vector3((Math.random() - 0.5) * 2.5, 4 + Math.random() * 2.5, (Math.random() - 0.2) * 2),
      spin: 8 + Math.random() * 8, type: 'coin',
    });
  }
}

export function floatText(pos, text, color = '#ffd257') {
  const s = makeTextSprite(text, { color, height: 0.55 });
  s.position.set(pos.x, pos.y + 2.4, pos.z + 0.3);
  scene.add(s);
  effects.push({ obj: s, life: 1.6, maxLife: 1.6, type: 'text' });
}

function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life -= dt;
    if (e.type === 'coin') {
      e.vel.y -= 14 * dt;                                  // 중력
      e.obj.position.addScaledVector(e.vel, dt);
      if (e.obj.position.y < e.floorY) {                   // 바닥에서 통통
        e.obj.position.y = e.floorY;
        e.vel.y *= -0.45;
        e.vel.x *= 0.7;
        e.vel.z *= 0.7;
      }
      e.obj.rotation.z += e.spin * dt;
      e.obj.scale.setScalar(Math.min(1, e.life / 0.3));    // 마지막에 작아지며 사라짐
    } else {
      e.obj.position.y += dt * 0.9;
      e.obj.material.opacity = Math.min(1, e.life / 0.5);
    }
    if (e.life <= 0) {
      scene.remove(e.obj);
      if (e.type === 'text') disposeObject(e.obj);
      effects.splice(i, 1);
    }
  }
}

/* ---------------- 3D 좌표 → 화면 좌표 (말풍선 위치용) ---------------- */
const tmpVec = new THREE.Vector3();
export function bossScreenPosition() {
  if (!boss) return null;
  boss.getWorldPosition(tmpVec);
  tmpVec.y += 2.0;
  tmpVec.project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: rect.left + (tmpVec.x * 0.5 + 0.5) * rect.width,
    y: rect.top + (-tmpVec.y * 0.5 + 0.5) * rect.height,
    visible: tmpVec.z < 1,
  };
}

/* =================================================================
   매 프레임 그리기
   dt: 게임 시간(일시정지/배속 반영)
   ================================================================= */
export function renderFrame(dt) {
  elapsed += dt;
  // 방 애니메이션
  for (const room of roomAnimations) room.userData.update(elapsed, dt);
  // 횃불 깜빡임 (실제 시간 기준이라 일시정지 중에도 일렁인다)
  const now = performance.now() / 1000;
  for (const info of floors) {
    for (const l of info.lights) l.intensity = GRAPHICS.TORCH_INTENSITY * (0.85 + Math.sin(now * 7 + l.userData.phase) * 0.08 + Math.random() * 0.07);
    for (const fl of info.flames) fl.scale.set(1, 1 + Math.sin(now * 13 + fl.userData.phase) * 0.2, 1);
  }
  for (const fl of surfaceFlames) fl.scale.set(1, 1 + Math.sin(now * 13 + fl.userData.phase) * 0.2, 1);
  // 고블린 사장 숨쉬기 + 손 흔들기
  if (boss) {
    const p = boss.userData.parts;
    p.head.rotation.y = Math.sin(now * 0.9) * 0.3;
    p.armR.rotation.z = 0.25 + Math.max(0, Math.sin(now * 2.2)) * 1.6;
    boss.position.y = SURFACE_Y + Math.abs(Math.sin(now * 2.2)) * 0.04;
  }
  updateEffects(dt);
  controls.update();
  // 안개는 카메라 거리에 맞춰서 (멀리 떨어져 봐도 던전이 어두워지지 않게)
  const dist = camera.position.distanceTo(controls.target);
  scene.fog.near = dist + 8;
  scene.fog.far = dist + 50;
  renderer.render(scene, camera);
}

// 테스트용: 칸 가운데의 화면 좌표
export function cellScreenPosition(f, c) {
  const x = c < 0 ? SHAFT_X : roomCenterX(c);
  tmpVec.set(x, floorY(f) + 1.2, 0).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return { x: rect.left + (tmpVec.x * 0.5 + 0.5) * rect.width, y: rect.top + (-tmpVec.y * 0.5 + 0.5) * rect.height };
}

// 테스트용: 카메라/렌더러 정보
export function debugInfo() {
  return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries };
}
