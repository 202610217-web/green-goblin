/* =================================================================
   models.js — Three.js 기본 도형으로 만드는 3D 모델들
   (모델 파일 없이 박스/구/원기둥/원뿔을 조합)
   - 방 5종, 고블린, 모험가 손님
   - 이모지/글자 스프라이트
   각 모델은 THREE.Group 을 돌려주며,
   움직임이 있으면 group.userData.update(time, dt) 함수를 붙여 둔다.
   ================================================================= */
import * as THREE from 'three';

/* ---------------- 재질(material) 도우미 ----------------
   같은 색 재질을 여러 번 만들지 않도록 캐시한다 (성능) */
const matCache = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...opts });
    m.userData.shared = true;     // 여러 모델이 같이 쓰므로 지우면 안 됨
    matCache.set(key, m);
  }
  return matCache.get(key);
}

// 도형을 만들어 위치를 정하고 그룹에 넣는 짧은 함수
function add(group, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  group.add(m);
  return m;
}

/* ---------------- 이모지 / 글자 스프라이트 ---------------- */
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji"';
const textureCache = new Map();

// 이모지 한 글자를 텍스처로 (같은 이모지는 재사용)
export function emojiTexture(emoji) {
  if (!textureCache.has(emoji)) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    ctx.font = `100px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 64, 72);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.userData.shared = true;   // 같은 이모지는 재사용하므로 지우면 안 됨
    textureCache.set(emoji, tex);
  }
  return textureCache.get(emoji);
}

export function makeEmojiSprite(emoji, size = 0.6) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji), depthWrite: false }));
  s.scale.set(size, size, 1);
  s.renderOrder = 10;   // 반투명 물체(잠긴 층 덮개 등)보다 나중에 그려서 가려지지 않게
  return s;
}

// 글자 스프라이트 (간판, +골드 표시 등)
export function makeTextSprite(text, { color = '#ffffff', bg = null, height = 0.5, bold = true, border = null } = {}) {
  const fontPx = 48;
  const pad = bg ? 18 : 6;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  // 한글 글꼴 → 기본 글꼴 → 이모지 글꼴 순서 (이모지 글꼴이 앞에 오면 띄어쓰기가 넓어짐)
  const font = `${bold ? 'bold ' : ''}${fontPx}px "Noto Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif,${EMOJI_FONT}`;
  ctx.font = font;
  // 한글 대체 글꼴은 실제로 더 넓게 그려질 수 있어서 여유를 15% 둔다 (글자 잘림 방지)
  const w = Math.ceil(ctx.measureText(text).width * 1.15) + pad * 2;
  const h = Math.ceil(fontPx * 1.3) + pad * 2;   // 한글 받침이 잘리지 않도록 세로 여유
  c.width = w;
  c.height = h;
  ctx.font = font;
  if (bg) {
    ctx.fillStyle = bg;
    roundRect(ctx, 2, 2, w - 4, h - 4, 14);
    ctx.fill();
    if (border) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = border;
      ctx.stroke();
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  if (!bg) ctx.strokeText(text, w / 2, h / 2 + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, w / 2, h / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(height * (w / h), height, 1);
  s.renderOrder = 10;
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* ---------------- 돌벽 텍스처 (캔버스로 그림) ---------------- */
export function makeBrickTexture(base = '#2a1c40', mortar = '#140c22', repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = mortar;
  ctx.fillRect(0, 0, 256, 256);
  const rows = 8, bw = 64, bh = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (bw / 2);
    for (let x = -bw; x < 256 + bw; x += bw) {
      // 벽돌마다 밝기를 조금씩 다르게
      const shade = Math.floor(Math.random() * 18) - 9;
      ctx.fillStyle = shadeColor(base, shade);
      ctx.fillRect(x + offset + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }
  // 이끼 점
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = `rgba(80,160,70,${Math.random() * 0.25})`;
    ctx.beginPath();
    ctx.arc(Math.random() * 256, Math.random() * 256, Math.random() * 6 + 2, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  return tex;
}

function shadeColor(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp255((n >> 16) + amt), g = clamp255(((n >> 8) & 255) + amt), b = clamp255((n & 255) + amt);
  return `rgb(${r},${g},${b})`;
}
const clamp255 = (v) => Math.max(0, Math.min(255, v));

/* =================================================================
   방 모델 5종
   방 한 칸의 원점 = 바닥 가운데. x: -2~2, z: -2(뒷벽)~2(앞쪽)
   앞쪽(z > 0.8)은 손님이 지나다니는 복도라서 비워 둔다.
   손님은 방 오른쪽 앞(x≈1.2, z≈0.4)에 서 있는다.
   ================================================================= */
export function buildRoomModel(typeKey) {
  const builders = { slime: buildSlimeRoom, sauna: buildSaunaRoom, suite: buildSuiteRoom, boulder: buildBoulderRoom, restaurant: buildRestaurant };
  const g = builders[typeKey]();
  g.userData.typeKey = typeKey;
  return g;
}

// 1. 슬라임 물침대방: 반투명 초록 침대가 출렁출렁
function buildSlimeRoom() {
  const g = new THREE.Group();
  const wood = mat(0x4a2e1e);
  // 침대 틀
  add(g, new THREE.BoxGeometry(2.2, 0.3, 1.5), wood, -0.6, 0.15, -0.9);
  add(g, new THREE.BoxGeometry(0.2, 1.0, 1.5), wood, -1.7, 0.5, -0.9);   // 머리판
  // 슬라임 매트리스 (반투명 초록, 은은하게 빛남)
  const slimeMat = new THREE.MeshStandardMaterial({
    color: 0x52ff7a, emissive: 0x1a9a3a, emissiveIntensity: 0.6,
    transparent: true, opacity: 0.72, roughness: 0.15,
  });
  const mattress = add(g, new THREE.BoxGeometry(2.0, 0.45, 1.3), slimeMat, -0.6, 0.52, -0.9);
  // 베개
  const pillow = add(g, new THREE.SphereGeometry(0.3, 12, 8), slimeMat, -1.35, 0.85, -0.9);
  pillow.scale.set(1, 0.5, 1.6);
  // 바닥에 굴러다니는 작은 슬라임들
  const blobs = [];
  for (let i = 0; i < 3; i++) {
    const b = add(g, new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), slimeMat, -1.2 + i * 0.5, 0, 0.3);
    blobs.push(b);
  }
  g.userData.update = (t) => {
    // 물침대 출렁임
    mattress.scale.y = 1 + Math.sin(t * 3) * 0.08;
    mattress.scale.x = 1 - Math.sin(t * 3) * 0.02;
    blobs.forEach((b, i) => { b.scale.y = 1 + Math.sin(t * 5 + i) * 0.25; });
  };
  return g;
}

// 2. 용암 사우나: 빛나는 주황색 바닥 + 김
function buildSaunaRoom() {
  const g = new THREE.Group();
  // 빛나는 용암 바닥
  const lavaMat = new THREE.MeshStandardMaterial({ color: 0xff6a1a, emissive: 0xff4500, emissiveIntensity: 1.2, roughness: 0.6 });
  const lava = add(g, new THREE.BoxGeometry(3.6, 0.05, 3.0), lavaMat, 0, 0.03, -0.4);
  // 검은 현무암 발판 (손님이 서는 곳)
  const basalt = mat(0x2a2028);
  add(g, new THREE.BoxGeometry(1.2, 0.12, 1.0), basalt, 1.2, 0.06, 0.4);
  add(g, new THREE.BoxGeometry(0.9, 0.12, 0.8), basalt, -0.4, 0.06, 0.6);
  // 나무 벤치
  const wood = mat(0x6b3d1f);
  add(g, new THREE.BoxGeometry(3.0, 0.15, 0.7), wood, 0, 0.55, -1.5);
  add(g, new THREE.BoxGeometry(0.15, 0.5, 0.6), wood, -1.3, 0.27, -1.5);
  add(g, new THREE.BoxGeometry(0.15, 0.5, 0.6), wood, 1.3, 0.27, -1.5);
  // 사우나 돌무더기
  const rockMat = mat(0x3b3436, { emissive: 0x401000 });
  for (let i = 0; i < 5; i++) {
    add(g, new THREE.DodecahedronGeometry(0.22 + Math.random() * 0.1), rockMat,
      -1.3 + (i % 3) * 0.3, 0.2 + Math.floor(i / 3) * 0.25, -0.3 + (i % 2) * 0.2);
  }
  // 피어오르는 김
  const steamMat = new THREE.MeshBasicMaterial({ color: 0xffe0d0, transparent: true, opacity: 0.25, depthWrite: false });
  const steam = [];
  for (let i = 0; i < 6; i++) {
    const s = add(g, new THREE.SphereGeometry(0.22, 8, 6), steamMat, -1.5 + Math.random() * 3, 0, -1 + Math.random() * 1.2);
    s.userData.offset = Math.random() * 3;
    steam.push(s);
  }
  g.userData.update = (t) => {
    lavaMat.emissiveIntensity = 1.0 + Math.sin(t * 2) * 0.3;
    steam.forEach((s) => {
      const p = (t * 0.5 + s.userData.offset) % 3 / 3;   // 0~1 반복
      s.position.y = 0.2 + p * 2.2;
      s.scale.setScalar(0.6 + p * 1.2);
    });
  };
  return g;
}

// 해골 하나 (스위트룸 장식용)
function makeSkull(scale = 1) {
  const g = new THREE.Group();
  const bone = mat(0xf2efe6, { roughness: 0.5 });
  const dark = mat(0x111111);
  add(g, new THREE.SphereGeometry(0.2, 14, 10), bone, 0, 0.2, 0);
  add(g, new THREE.BoxGeometry(0.22, 0.1, 0.18), bone, 0, 0.04, 0.04);    // 턱
  add(g, new THREE.SphereGeometry(0.055, 8, 6), dark, -0.075, 0.22, 0.16); // 눈
  add(g, new THREE.SphereGeometry(0.055, 8, 6), dark, 0.075, 0.22, 0.16);
  add(g, new THREE.ConeGeometry(0.03, 0.06, 4), dark, 0, 0.13, 0.19);       // 코
  g.scale.setScalar(scale);
  return g;
}

// 3. 해골 장식 스위트룸: 보라색 캐노피 침대 + 흰 해골 장식 + 촛불
function buildSuiteRoom() {
  const g = new THREE.Group();
  const darkWood = mat(0x2b1a2e);
  const velvet = mat(0x6a2a8a, { roughness: 0.6 });
  // 고급 카펫
  add(g, new THREE.BoxGeometry(3.4, 0.03, 3.0), mat(0x4a1030), 0, 0.02, -0.4);
  // 침대
  add(g, new THREE.BoxGeometry(2.2, 0.4, 1.6), darkWood, -0.6, 0.2, -1.0);
  add(g, new THREE.BoxGeometry(2.0, 0.25, 1.4), velvet, -0.6, 0.52, -1.0);
  add(g, new THREE.BoxGeometry(0.5, 0.18, 1.1), mat(0xe8dcf0), -1.4, 0.72, -1.0);
  // 캐노피 기둥 + 지붕
  for (const [x, z] of [[-1.65, -1.75], [0.45, -1.75], [-1.65, -0.25], [0.45, -0.25]]) {
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 2.0, 8), darkWood, x, 1.0, z);
    const skull = makeSkull(0.7);       // 기둥 위 해골
    skull.position.set(x, 2.0, z);
    g.add(skull);
  }
  add(g, new THREE.BoxGeometry(2.3, 0.08, 1.7), velvet, -0.6, 2.0, -1.0);
  // 벽에 걸린 큰 해골
  const bigSkull = makeSkull(1.6);
  bigSkull.position.set(1.0, 1.4, -1.8);
  g.add(bigSkull);
  // 촛불
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  const flames = [];
  for (const x of [0.6, 1.5]) {
    add(g, new THREE.CylinderGeometry(0.06, 0.06, 0.35, 8), mat(0xf5f0e0), x, 0.18, -1.6);
    flames.push(add(g, new THREE.ConeGeometry(0.05, 0.14, 8), flameMat, x, 0.42, -1.6));
  }
  g.userData.update = (t) => {
    flames.forEach((f, i) => { f.scale.y = 1 + Math.sin(t * 12 + i * 2) * 0.25; });
    bigSkull.rotation.y = Math.sin(t * 0.8) * 0.25;   // 해골이 슬쩍 두리번
  };
  return g;
}

// 4. 굴러오는 바위 어트랙션: 회색 구가 레일 위를 굴러다님
function buildBoulderRoom() {
  const g = new THREE.Group();
  const rail = mat(0x5a4a3a);
  // 레일
  add(g, new THREE.BoxGeometry(3.6, 0.1, 0.12), rail, 0, 0.05, -1.4);
  add(g, new THREE.BoxGeometry(3.6, 0.1, 0.12), rail, 0, 0.05, -0.6);
  // 양 끝 경사로
  const ramp = mat(0x4a3b30);
  const r1 = add(g, new THREE.BoxGeometry(0.6, 0.12, 1.1), ramp, -1.75, 0.25, -1.0);
  r1.rotation.z = -0.6;
  const r2 = add(g, new THREE.BoxGeometry(0.6, 0.12, 1.1), ramp, 1.75, 0.25, -1.0);
  r2.rotation.z = 0.6;
  // 바위 (울퉁불퉁한 회색 구) — 진짜 모드에서 색을 바꾸므로 재질을 따로 만든다
  const boulderMat = new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.8, flatShading: true, emissive: 0x000000 });
  const boulder = add(g, new THREE.DodecahedronGeometry(0.62, 1), boulderMat, 0, 0.62, -1.0);
  // 경고 표지판 (뒤쪽 구석)
  add(g, new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6), rail, 1.7, 0.5, -1.8);
  const sign = add(g, new THREE.BoxGeometry(0.5, 0.4, 0.05), mat(0xffcc00), 1.7, 1.05, -1.75);
  sign.rotation.z = Math.PI / 4;
  // 바닥 가시 장식 (진짜 모드에서 쑥 올라온다)
  const spikes = new THREE.Group();
  g.add(spikes);
  const spike = mat(0x6a6a72, { metalness: 0.4 });
  for (let i = 0; i < 4; i++) add(spikes, new THREE.ConeGeometry(0.08, 0.3, 6), spike, -1.6 + i * 0.35, 0.15, 0.4);
  let phase = 0;
  let realMode = false;
  g.userData.update = (t, dt) => {
    // 좌우로 굴러다님 (진짜 모드에서는 2배 빠르게)
    phase += dt * (realMode ? 2.8 : 1.4);
    const x = Math.sin(phase) * 1.2;
    boulder.position.x = x;
    boulder.position.y = 0.62 + Math.max(0, Math.abs(x) - 1.0) * 0.6;   // 끝에서는 경사로를 살짝 오름
    boulder.rotation.z = -x / 0.62;
    if (realMode) boulderMat.emissiveIntensity = 0.6 + Math.sin(t * 8) * 0.3;
  };
  // 진짜 모드(진짜 함정) 켜기/끄기: 바위가 붉게 달아오르고 가시가 커진다
  g.userData.setRealMode = (on) => {
    realMode = on;
    boulderMat.color.setHex(on ? 0x8a3a30 : 0x8a8580);
    boulderMat.emissive.setHex(on ? 0xff2a10 : 0x000000);
    spikes.scale.set(1, on ? 2.5 : 1, 1);
  };
  return g;
}

// 5. 고블린 식당: 둥근 테이블과 보글보글 냄비
function buildRestaurant() {
  const g = new THREE.Group();
  const wood = mat(0x7a4a24);
  // 테이블
  add(g, new THREE.CylinderGeometry(0.75, 0.75, 0.1, 20), wood, -0.4, 0.8, -0.6);
  add(g, new THREE.CylinderGeometry(0.1, 0.15, 0.8, 8), wood, -0.4, 0.4, -0.6);
  // 의자
  for (const [x, z] of [[-1.4, -0.6], [0.6, -0.6], [-0.4, -1.6]]) {
    add(g, new THREE.CylinderGeometry(0.25, 0.25, 0.45, 10), wood, x, 0.22, z);
  }
  // 테이블 위 음식 (고기 + 접시)
  add(g, new THREE.CylinderGeometry(0.22, 0.22, 0.03, 14), mat(0xdddddd), -0.6, 0.87, -0.5);
  add(g, new THREE.SphereGeometry(0.12, 10, 8), mat(0x8a3a1a), -0.6, 0.95, -0.5);
  // 큰 냄비 + 장작불
  const pot = new THREE.Group();
  pot.position.set(1.2, 0, -1.4);
  g.add(pot);
  add(pot, new THREE.CylinderGeometry(0.5, 0.42, 0.6, 16), mat(0x26222a, { metalness: 0.5 }), 0, 0.55, 0);
  const soupMat = new THREE.MeshStandardMaterial({ color: 0x6fdc3a, emissive: 0x2a8a1a, emissiveIntensity: 0.8 });
  add(pot, new THREE.CylinderGeometry(0.44, 0.44, 0.05, 16), soupMat, 0, 0.84, 0);
  const fireMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
  const fire = add(pot, new THREE.ConeGeometry(0.3, 0.35, 8), fireMat, 0, 0.12, 0);
  // 보글보글 거품
  const bubbleMat = new THREE.MeshStandardMaterial({ color: 0x9cff6a, emissive: 0x3a9a2a, transparent: true, opacity: 0.8 });
  const bubbles = [];
  for (let i = 0; i < 4; i++) {
    const b = add(pot, new THREE.SphereGeometry(0.07, 8, 6), bubbleMat, (Math.random() - 0.5) * 0.5, 0.86, (Math.random() - 0.5) * 0.5);
    b.userData.offset = Math.random() * 2;
    bubbles.push(b);
  }
  g.userData.update = (t) => {
    fire.scale.y = 1 + Math.sin(t * 15) * 0.2;
    bubbles.forEach((b) => {
      const p = (t + b.userData.offset) % 1.2 / 1.2;
      b.position.y = 0.86 + p * 0.3;
      b.scale.setScalar(1 - p);
    });
  };
  return g;
}

/* =================================================================
   고블린 (사장 / 나중에 직원으로도 사용)
   원점 = 발바닥. 정면 = +z 방향
   ================================================================= */
export function createGoblin({ scale = 1, outfit = 0x5b2d82, boss = false } = {}) {
  const g = new THREE.Group();
  const skin = mat(0x5fc04a, { roughness: 0.6 });
  const cloth = mat(outfit);
  // 다리
  const legL = add(g, new THREE.CylinderGeometry(0.09, 0.08, 0.35, 8), skin, -0.12, 0.17, 0);
  const legR = add(g, new THREE.CylinderGeometry(0.09, 0.08, 0.35, 8), skin, 0.12, 0.17, 0);
  // 몸통 (옷)
  add(g, new THREE.CylinderGeometry(0.26, 0.32, 0.5, 12), cloth, 0, 0.58, 0);
  // 볼록한 배
  const belly = add(g, new THREE.SphereGeometry(0.22, 12, 10), skin, 0, 0.55, 0.12);
  belly.scale.set(1, 1, 0.7);
  // 팔 (어깨를 축으로 흔들 수 있도록 그룹으로)
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.32, 0.78, 0);
    add(pivot, new THREE.CylinderGeometry(0.07, 0.06, 0.4, 8), skin, 0, -0.2, 0);
    g.add(pivot);
    return pivot;
  };
  const armL = makeArm(-1), armR = makeArm(1);
  armL.rotation.z = -0.25;
  armR.rotation.z = 0.25;
  // 머리
  const head = new THREE.Group();
  head.position.y = 1.08;
  g.add(head);
  add(head, new THREE.SphereGeometry(0.3, 16, 12), skin, 0, 0, 0);
  // 뾰족한 귀
  const earL = add(head, new THREE.ConeGeometry(0.08, 0.38, 8), skin, -0.36, 0.05, 0);
  earL.rotation.z = Math.PI / 2 + 0.35;
  const earR = add(head, new THREE.ConeGeometry(0.08, 0.38, 8), skin, 0.36, 0.05, 0);
  earR.rotation.z = -Math.PI / 2 - 0.35;
  // 노란 눈 + 검은 눈동자
  const eye = mat(0xffe14a, { emissive: 0x665500 });
  const pupil = mat(0x111111);
  add(head, new THREE.SphereGeometry(0.065, 10, 8), eye, -0.11, 0.05, 0.25);
  add(head, new THREE.SphereGeometry(0.065, 10, 8), eye, 0.11, 0.05, 0.25);
  add(head, new THREE.SphereGeometry(0.03, 8, 6), pupil, -0.11, 0.05, 0.31);
  add(head, new THREE.SphereGeometry(0.03, 8, 6), pupil, 0.11, 0.05, 0.31);
  // 길쭉한 코
  const nose = add(head, new THREE.ConeGeometry(0.06, 0.2, 8), skin, 0, -0.04, 0.32);
  nose.rotation.x = Math.PI / 2;
  // 씨익 웃는 입
  add(head, new THREE.BoxGeometry(0.16, 0.025, 0.02), pupil, 0, -0.14, 0.27);

  if (boss) {
    // 사장님 전용: 실크햇 + 빨간 나비넥타이 + 금목걸이
    const hatMat = mat(0x1a1420);
    add(head, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16), hatMat, 0, 0.24, 0);
    add(head, new THREE.CylinderGeometry(0.2, 0.22, 0.35, 16), hatMat, 0, 0.42, 0);
    add(head, new THREE.CylinderGeometry(0.225, 0.225, 0.06, 16), mat(0x9b2fd0), 0, 0.3, 0);
    const bow = mat(0xd02a3a);
    add(g, new THREE.ConeGeometry(0.07, 0.12, 4), bow, -0.06, 0.82, 0.24).rotation.z = Math.PI / 2;
    add(g, new THREE.ConeGeometry(0.07, 0.12, 4), bow, 0.06, 0.82, 0.24).rotation.z = -Math.PI / 2;
    const chain = add(g, new THREE.TorusGeometry(0.22, 0.025, 6, 20), mat(0xffd257, { metalness: 0.8, roughness: 0.3, emissive: 0x443300 }), 0, 0.76, 0.05);
    chain.rotation.x = Math.PI / 2 - 0.3;
    add(g, new THREE.CylinderGeometry(0.07, 0.07, 0.02, 12), mat(0xffd257, { metalness: 0.8, emissive: 0x443300 }), 0, 0.62, 0.3).rotation.x = Math.PI / 2;
  }

  g.scale.setScalar(scale);
  g.userData.parts = { legL, legR, armL, armR, head };
  return g;
}

/* =================================================================
   직원 고블린: 역할마다 옷 색과 도구가 다르다
   cleaner(청소): 파란 앞치마 + 대걸레 / cook(요리): 흰 요리사 모자 + 국자
   guard(경비): 철 투구 + 창
   ================================================================= */
export function createStaffGoblin(role, outfit) {
  const g = createGoblin({ outfit, scale: 0.95 });
  const { head, armR } = g.userData.parts;
  if (role === 'cleaner') {
    const mop = new THREE.Group();
    add(mop, new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), mat(0x8a6a3a), 0, -0.1, 0);
    add(mop, new THREE.CylinderGeometry(0.12, 0.08, 0.15, 8), mat(0xdcdcdc), 0, -0.62, 0);
    mop.position.set(0, -0.38, 0.12);
    armR.add(mop);
    add(head, new THREE.SphereGeometry(0.31, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.5), mat(0x2a6ad0), 0, 0.05, 0); // 두건
  } else if (role === 'cook') {
    add(head, new THREE.CylinderGeometry(0.2, 0.17, 0.3, 12), mat(0xffffff), 0, 0.38, 0);
    add(head, new THREE.SphereGeometry(0.24, 12, 8), mat(0xffffff), 0, 0.55, 0).scale.set(1, 0.6, 1);
    const ladle = new THREE.Group();
    add(ladle, new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), mat(0x9a9aa2, { metalness: 0.6 }), 0, 0, 0);
    add(ladle, new THREE.SphereGeometry(0.07, 8, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0x9a9aa2, { metalness: 0.6 }), 0, -0.25, 0);
    ladle.position.set(0, -0.4, 0.1);
    armR.add(ladle);
  } else if (role === 'guard') {
    const steel = mat(0x9a9aa8, { metalness: 0.7, roughness: 0.35 });
    add(head, new THREE.SphereGeometry(0.32, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 0.04, 0);
    add(head, new THREE.ConeGeometry(0.05, 0.18, 6), steel, 0, 0.38, 0);
    const spear = new THREE.Group();
    add(spear, new THREE.CylinderGeometry(0.025, 0.025, 1.5, 6), mat(0x6a4a2a), 0, 0.3, 0);
    add(spear, new THREE.ConeGeometry(0.06, 0.22, 6), steel, 0, 1.15, 0);
    spear.position.set(0, -0.38, 0.1);
    armR.add(spear);
  }
  return g;
}

/* =================================================================
   용사: 금색으로 빛나는 갑옷 전사 + 망토 + 후광
   ================================================================= */
export function createHero() {
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd257, emissive: 0xb07a00, emissiveIntensity: 0.9, metalness: 0.7, roughness: 0.3 });
  const g = createAdventurer('warrior', 0xffd257);
  g.traverse((o) => {
    // 몸통/팔 색 재질을 금빛 재질로 바꿔서 번쩍이게
    if (o.isMesh && o.material.color && o.material.color.getHex() === 0xffd257) o.material = gold;
  });
  // 빨간 망토
  const cape = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.75, 0.04), mat(0xb01a2a));
  cape.position.set(0, 0.75, -0.25);
  cape.rotation.x = 0.15;
  g.add(cape);
  // 후광 (뒤에서 빛나는 원)
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.42, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  halo.position.set(0, 1.62, 0);
  halo.rotation.x = Math.PI / 2;
  g.add(halo);
  g.scale.setScalar(1.25);
  g.userData.halo = halo;
  return g;
}

/* =================================================================
   모험가 손님: 전사(빨강) / 마법사(파랑) / 도적(회색)
   원점 = 발바닥. 정면 = +z 방향
   ================================================================= */
export function createAdventurer(typeKey, bodyColor) {
  const g = new THREE.Group();
  const skin = mat(0xf0c8a0, { roughness: 0.7 });
  const body = mat(bodyColor);
  const dark = mat(0x2a2030);
  const legL = add(g, new THREE.CylinderGeometry(0.08, 0.08, 0.45, 8), dark, -0.11, 0.22, 0);
  const legR = add(g, new THREE.CylinderGeometry(0.08, 0.08, 0.45, 8), dark, 0.11, 0.22, 0);
  add(g, new THREE.CylinderGeometry(0.22, 0.26, 0.6, 12), body, 0, 0.75, 0);
  add(g, new THREE.CylinderGeometry(0.27, 0.27, 0.06, 12), mat(0x4a3020), 0, 0.5, 0);   // 허리띠
  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.29, 1.0, 0);
    add(pivot, new THREE.CylinderGeometry(0.065, 0.06, 0.45, 8), body, 0, -0.22, 0);
    add(pivot, new THREE.SphereGeometry(0.065, 8, 6), skin, 0, -0.46, 0);
    g.add(pivot);
    return pivot;
  };
  const armL = makeArm(-1), armR = makeArm(1);
  const head = new THREE.Group();
  head.position.y = 1.28;
  g.add(head);
  add(head, new THREE.SphereGeometry(0.22, 14, 10), skin, 0, 0, 0);
  add(head, new THREE.SphereGeometry(0.03, 6, 4), dark, -0.07, 0.03, 0.2);
  add(head, new THREE.SphereGeometry(0.03, 6, 4), dark, 0.07, 0.03, 0.2);

  if (typeKey === 'warrior') {
    // 뿔 달린 투구 + 칼
    const metal = mat(0xb0b0b8, { metalness: 0.7, roughness: 0.35 });
    add(head, new THREE.SphereGeometry(0.24, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal, 0, 0.04, 0);
    const hornMat = mat(0xf0e6c8);
    add(head, new THREE.ConeGeometry(0.05, 0.25, 8), hornMat, -0.25, 0.15, 0).rotation.z = 0.7;
    add(head, new THREE.ConeGeometry(0.05, 0.25, 8), hornMat, 0.25, 0.15, 0).rotation.z = -0.7;
    const sword = new THREE.Group();
    add(sword, new THREE.BoxGeometry(0.06, 0.7, 0.02), metal, 0, 0.35, 0);
    add(sword, new THREE.BoxGeometry(0.22, 0.04, 0.05), mat(0x8a6a2a), 0, 0, 0);
    sword.position.set(0, -0.46, 0.05);
    armR.add(sword);
  } else if (typeKey === 'wizard') {
    // 뾰족 모자 + 빛나는 지팡이
    const hatMat = mat(0x2a3f9a);
    add(head, new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16), hatMat, 0, 0.12, 0);
    const hat = add(head, new THREE.ConeGeometry(0.22, 0.55, 14), hatMat, 0, 0.4, 0);
    hat.rotation.z = 0.15;
    add(head, new THREE.SphereGeometry(0.15, 10, 8), mat(0xdddddd), 0, -0.18, 0.12).scale.set(1, 1.3, 0.6); // 수염
    const staff = new THREE.Group();
    add(staff, new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6), mat(0x6a4a2a), 0, 0.2, 0);
    add(staff, new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0x8ad8ff }), 0, 0.88, 0);
    staff.position.set(0, -0.46, 0.08);
    armR.add(staff);
  } else {
    // 도적: 두건 + 단검 + 복면
    const hood = add(head, new THREE.SphereGeometry(0.26, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), mat(0x4a4a52), 0, 0.02, -0.02);
    hood.rotation.x = -0.2;
    add(head, new THREE.BoxGeometry(0.4, 0.1, 0.1), mat(0x303038), 0, -0.08, 0.17);
    const dagger = add(armR, new THREE.BoxGeometry(0.05, 0.3, 0.02), mat(0xc8c8d0, { metalness: 0.7 }), 0, -0.6, 0.05);
    dagger.rotation.x = 0.3;
  }

  g.userData.parts = { legL, legR, armL, armR, head };
  return g;
}

// 걷기/서 있기 애니메이션 (고블린, 모험가 공통)
export function animateCharacter(group, t, walking) {
  const p = group.userData.parts;
  if (!p) return;
  if (walking) {
    const s = Math.sin(t * 11);
    p.legL.rotation.x = s * 0.6;
    p.legR.rotation.x = -s * 0.6;
    p.armL.rotation.x = -s * 0.5;
    p.armR.rotation.x = s * 0.5;
  } else {
    p.legL.rotation.x = p.legR.rotation.x = 0;
    p.armL.rotation.x = Math.sin(t * 2) * 0.08;
    p.armR.rotation.x = -Math.sin(t * 2) * 0.08;
  }
}
