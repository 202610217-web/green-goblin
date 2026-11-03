/* =================================================================
   game.js — 게임 규칙과 메인 루프 (시작 파일)
   - 방 설치/철거
   - 손님 방문, 이동, 숙박, 체크아웃
   - 만족도, 별점, 날짜
   화면 그리기는 scene.js(3D) / ui.js(HTML)에 맡긴다.
   모든 진행 데이터는 gameState 하나에만 저장한다.
   ================================================================= */
import { CONFIG, ROOM_TYPES, GUEST_TYPES, GUEST_SPAWN_WEIGHTS, GUEST_NAMES } from './config.js';
import { gameState } from './state.js';
import * as S from './scene.js';
import * as UI from './ui.js';

/* ---------------- 화면 조작용 임시 상태 (저장하지 않음) ---------------- */
const view = {
  selectedRoom: 'slime',   // 건설 메뉴에서 고른 방
  paused: false,
  speed: 1,                // 게임 배속 1~3
  hover: null,             // 마우스가 올라간 칸
  mouseX: 0, mouseY: 0,
};

/* ---------------- 작은 도우미 ---------------- */
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function weightedPick(weights) {
  const entries = Object.entries(weights);
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [k, w] of entries) {
    if ((r -= w) < 0) return k;
  }
  return entries[0][0];
}

function log(msg) {
  UI.addLog(gameState.day, msg);
}

// 열린 층의 모든 칸을 돌면서 fn(층, 칸, 방) 호출
function forEachCell(fn) {
  for (let f = 0; f < gameState.unlockedFloors; f++) {
    for (let c = 0; c < CONFIG.COLS; c++) fn(f, c, gameState.rooms[f][c]);
  }
}

function countRooms(typeKey) {
  let n = 0;
  forEachCell((f, c, room) => { if (room && room.type === typeKey) n++; });
  return n;
}

function hasAnyLodging() {
  let found = false;
  forEachCell((f, c, room) => { if (room && ROOM_TYPES[room.type].lodging) found = true; });
  return found;
}

// 그 방에 손님이 묵고 있거나 들어오는 중인가?
function isRoomTaken(f, c) {
  return gameState.guests.some((g) => g.floor === f && g.col === c && (g.state === 'walking' || g.state === 'staying'));
}

/* =================================================================
   1-2. 방 설치 / 철거
   ================================================================= */
function onCellClick(cell) {
  if (!cell) return;
  const { floor, col } = cell;
  if (floor >= gameState.unlockedFloors) {
    UI.showToast(`🔒 ${UI.floorName(floor)}은(는) 아직 잠겨 있어요.`);
    return;
  }
  if (col < 0) {
    UI.bossSay(floor === 0 ? '여기가 호텔 입구야! 손님들은 사다리로 내려온다구.' : '사다리 통로야. 방은 오른쪽 칸에 지어!');
    return;
  }
  if (gameState.rooms[floor][col]) tryDemolish(floor, col);
  else tryBuild(floor, col);
}

function tryBuild(f, c) {
  const rt = ROOM_TYPES[view.selectedRoom];
  if (gameState.gold < rt.cost) {
    UI.showToast(`💸 골드가 부족해서 설치할 수 없어요! (${(rt.cost - gameState.gold).toLocaleString()}골드 더 필요)`);
    UI.bossSay('돈이 모자라… 손님을 더 받아야 해!');
    return;
  }
  gameState.gold -= rt.cost;
  gameState.rooms[f][c] = { type: view.selectedRoom };
  S.setRoomModel(f, c, view.selectedRoom, rt);
  S.floatText(S.roomStandPoint(f, c), `-${rt.cost}`, '#ff8a8a');
  log(`${rt.emoji} ${rt.name} 설치 (-${rt.cost})`);
  refreshHover();
  UI.updateTopBar(gameState);
}

function tryDemolish(f, c) {
  const rt = ROOM_TYPES[gameState.rooms[f][c].type];
  if (isRoomTaken(f, c)) {
    UI.showToast('🧳 손님이 묵고 있어서 철거할 수 없어요.');
    return;
  }
  const refund = Math.floor(rt.cost * CONFIG.DEMOLISH_REFUND);
  UI.confirmModal(`${rt.emoji} ${rt.name}을(를) 철거할까요?\n${refund}골드를 돌려받아요.`, () => {
    // 확인 창이 떠 있는 동안 손님이 들어왔을 수도 있으니 다시 검사
    if (!gameState.rooms[f][c]) return;
    if (isRoomTaken(f, c)) {
      UI.showToast('🧳 그 사이 손님이 들어와서 철거할 수 없어요.');
      return;
    }
    gameState.rooms[f][c] = null;
    gameState.gold += refund;
    S.setRoomModel(f, c, null);
    S.spawnCoins(S.roomStandPoint(f, c), 4);
    S.floatText(S.roomStandPoint(f, c), `+${refund}`);
    log(`🔨 ${rt.name} 철거 (+${refund})`);
    refreshHover();
    UI.updateTopBar(gameState);
  }, '철거');
}

/* ---------------- 마우스 올린 칸 강조 + 안내 ---------------- */
function onCellHover(cell) {
  view.hover = cell;
  if (!cell) {
    S.setHover(null);
    UI.hideTooltip();
    return;
  }
  const { floor, col } = cell;
  let mode, html;
  if (floor >= gameState.unlockedFloors) {
    mode = 'info';
    html = `🔒 <b>${UI.floorName(floor)}</b><br><span class="no">아직 잠겨 있어요</span>`;
  } else if (col < 0) {
    mode = 'info';
    html = floor === 0 ? '🚪 <b>호텔 입구</b><br>손님이 사다리로 내려와요' : `🪜 <b>${UI.floorName(floor)} 통로</b>`;
  } else {
    const room = gameState.rooms[floor][col];
    if (room) {
      const rt = ROOM_TYPES[room.type];
      const refund = Math.floor(rt.cost * CONFIG.DEMOLISH_REFUND);
      const taken = isRoomTaken(floor, col);
      mode = taken ? 'deny' : 'demolish';
      html = `${rt.emoji} <b>${rt.name}</b><br>${UI.roomDesc(rt)}<br>` +
        (taken ? '<span class="no">손님 투숙 중 · 철거 불가</span>' : `<span class="warn">클릭하면 철거 (+${refund}G 환불)</span>`);
    } else {
      const rt = ROOM_TYPES[view.selectedRoom];
      const ok = gameState.gold >= rt.cost;
      mode = ok ? 'build' : 'deny';
      html = `빈 칸 · ${UI.floorName(floor)}<br>${rt.emoji} <b>${rt.name}</b> 설치<br>` +
        (ok ? `<span class="ok">💰 ${rt.cost}골드</span>` : `<span class="no">골드 부족 (${rt.cost}골드 필요)</span>`);
    }
  }
  S.setHover(cell, mode);
  UI.showTooltip(view.mouseX, view.mouseY, html);
}
function refreshHover() {
  onCellHover(view.hover);
}

/* =================================================================
   1-3. 손님 시스템
   ================================================================= */

// 손님 종류와 방 종류로 '목표 만족도' 계산 (취향에 맞을수록 높음)
function targetSatisfaction(guestType, roomType) {
  const g = GUEST_TYPES[guestType];
  const r = ROOM_TYPES[roomType];
  let sat = CONFIG.BASE_SATISFACTION + r.comfort * g.comfortWeight + r.thrill * g.thrillWeight;
  if (countRooms('restaurant') > 0) sat += CONFIG.RESTAURANT_SAT_BONUS;
  return clamp(sat, 0, 100);
}

// 빈 숙박용 방 중에서 그 손님에게 가장 잘 맞는 방
function findBestFreeRoom(guestType) {
  let best = null;
  forEachCell((f, c, room) => {
    if (!room || !ROOM_TYPES[room.type].lodging || isRoomTaken(f, c)) return;
    const score = targetSatisfaction(guestType, room.type) + Math.random();   // 동점이면 랜덤
    if (!best || score > best.score) best = { floor: f, col: c, score };
  });
  return best;
}

function spawnGuest() {
  const type = weightedPick(GUEST_SPAWN_WEIGHTS);
  const gt = GUEST_TYPES[type];
  const guest = {
    id: gameState.nextGuestId++,
    type,
    name: pick(GUEST_NAMES),
    satisfaction: CONFIG.BASE_SATISFACTION,
    floor: null, col: null,
    state: 'walking',          // walking(방으로) → staying(숙박) → leaving(퇴장) / angry(화나서 퇴장)
    timer: 0,
    pos: S.spawnPoint(),
    path: [],
    facing: 0,
  };
  gameState.stats.totalGuests++;

  const room = findBestFreeRoom(type);
  if (room) {
    guest.floor = room.floor;
    guest.col = room.col;
    guest.path = S.pathToRoom(room.floor, room.col);
    log(`${gt.emoji} ${gt.name} ${guest.name} 체크인`);
  } else {
    // 빈 방이 없다 → 화난 채로 돌아간다
    guest.state = 'angry';
    guest.satisfaction = CONFIG.ANGRY_LEAVE_SATISFACTION;
    guest.path = S.pathAngryVisit();
    gameState.stats.angryGuests++;
    recordRating(guest.satisfaction);
    log(`😠 ${gt.name} ${guest.name}: 빈 방이 없어서 돌아감`);
    UI.bossSay('빈 방이 없다니! 방을 더 지어야겠어…');
  }
  gameState.guests.push(guest);
  S.addGuestMesh(guest);
}

// 경로를 따라 이동. 경로 끝에 도착하면 true
function moveAlongPath(guest, dt) {
  let remaining = CONFIG.GUEST_WALK_SPEED * dt;
  while (remaining > 0 && guest.path.length) {
    const t = guest.path[0];
    const dx = t.x - guest.pos.x, dy = t.y - guest.pos.y, dz = t.z - guest.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    // 수평으로 움직일 때만 몸 방향을 바꾼다 (사다리에서는 그대로)
    if (Math.hypot(dx, dz) > 0.01) guest.facing = Math.atan2(dx, dz);
    if (dist <= remaining) {
      guest.pos = { x: t.x, y: t.y, z: t.z };
      guest.path.shift();
      remaining -= dist;
    } else {
      guest.pos = {
        x: guest.pos.x + (dx / dist) * remaining,
        y: guest.pos.y + (dy / dist) * remaining,
        z: guest.pos.z + (dz / dist) * remaining,
      };
      remaining = 0;
    }
  }
  return guest.path.length === 0;
}

function updateGuest(guest, dt) {
  if (guest.state === 'walking') {
    if (moveAlongPath(guest, dt)) {
      guest.state = 'staying';            // 방 도착 → 숙박 시작
      guest.timer = CONFIG.STAY_SECONDS;
      guest.facing = 0;                    // 화면 쪽을 바라봄
    }
  } else if (guest.state === 'staying') {
    const room = gameState.rooms[guest.floor][guest.col];
    if (room) {
      // 만족도가 목표치를 향해 서서히 움직인다
      const target = targetSatisfaction(guest.type, room.type);
      const diff = target - guest.satisfaction;
      const step = CONFIG.SATISFACTION_SPEED * dt;
      guest.satisfaction += Math.abs(diff) < step ? diff : Math.sign(diff) * step;
    }
    guest.timer -= dt;
    if (guest.timer <= 0) {
      checkout(guest);
      guest.state = 'leaving';
      guest.path = S.pathFromRoom(guest.floor, guest.col);
    }
  } else {
    // leaving / angry: 경로 끝(지상 바깥)에 도착하면 사라짐
    if (moveAlongPath(guest, dt)) guest.remove = true;
  }
  const walking = guest.state !== 'staying';
  S.updateGuestMesh(guest, UI.moodEmoji(guest.satisfaction), walking);
}

// 체크아웃: 숙박비 + 식당 + 팁 지불, 동전 효과
function checkout(guest) {
  const room = gameState.rooms[guest.floor][guest.col];
  const sat = guest.satisfaction;
  let fee = 0, tip = 0;
  if (room) {
    const rt = ROOM_TYPES[room.type];
    fee = rt.income;
    if (sat < CONFIG.MOOD_NEUTRAL) fee = Math.floor(fee * CONFIG.UNHAPPY_PAY_RATIO);
    if (sat >= CONFIG.TIP_START) {
      tip = Math.round(rt.income * CONFIG.TIP_MAX_RATIO * (sat - CONFIG.TIP_START) / (100 - CONFIG.TIP_START));
    }
  }
  const food = countRooms('restaurant') * ROOM_TYPES.restaurant.perGuest;
  const total = fee + food + tip;
  gameState.gold += total;
  gameState.stats.totalEarned += total;
  recordRating(sat);

  const gt = GUEST_TYPES[guest.type];
  let detail = `숙박 ${fee}`;
  if (food) detail += ` + 식사 ${food}`;
  if (tip) detail += ` + 팁 ${tip}`;
  log(`${UI.moodEmoji(sat)} ${gt.name} ${guest.name} 체크아웃: ${detail} = ${total}골드`);
  S.spawnCoins(guest.pos, clamp(Math.ceil(total / 10), 3, 12));
  S.floatText(guest.pos, `+${total}G${tip ? ' 💝' : ''}`);
  if (tip >= 25) UI.bossSay('크헤헤, 팁을 두둑하게 받았다!');
  UI.updateTopBar(gameState);
}

/* ---------------- 별점 ---------------- */
function averageRating() {
  const r = gameState.ratings;
  // 평가가 아직 적으면 기본 별점(3성=60점) 평가를 섞어서 별점이 확 튀지 않게 한다
  const priorCount = Math.max(0, CONFIG.RATING_SAMPLE - r.length) * CONFIG.RATING_PRIOR_RATIO;
  const priorValue = CONFIG.START_STARS * 20;
  const total = r.reduce((s, v) => s + v, 0) + priorValue * priorCount;
  return total / (r.length + priorCount);
}

function recordRating(sat) {
  gameState.ratings.push(Math.round(sat));
  if (gameState.ratings.length > CONFIG.RATING_SAMPLE) gameState.ratings.shift();
  const avg = averageRating();
  UI.setStarTooltip(avg);
  // 평균 만족도 0~100 → 별 1~5 (예: 70이면 4성)
  const stars = clamp(Math.round(avg / 20), 1, 5);
  if (stars !== gameState.stars) {
    const up = stars > gameState.stars;
    gameState.stars = stars;
    log(up ? `⭐ 별점 상승! ${UI.starString(stars)}` : `💔 별점 하락… ${UI.starString(stars)}`);
    UI.showToast(up ? `⭐ 별점이 ${stars}성으로 올랐어요! 손님이 더 자주 와요.` : `💔 별점이 ${stars}성으로 떨어졌어요…`, up ? 'info' : 'warn');
    UI.bossSay(up ? '소문이 좋게 났나 봐! 크크크.' : '으윽… 손님 취향을 잘 맞춰줘야 해!');
  }
}

/* =================================================================
   매 프레임 게임 진행 (dt = 게임 시간, 배속 반영)
   ================================================================= */
function update(dt) {
  // 하루 진행
  gameState.dayTimer += dt;
  if (gameState.dayTimer >= CONFIG.DAY_SECONDS) {
    gameState.dayTimer -= CONFIG.DAY_SECONDS;
    gameState.day++;
    log(`🌙 ${gameState.day}일차가 밝았어요.`);
    UI.showToast(`📅 ${gameState.day}일차 시작!`, 'info');
  }

  // 손님 방문: 숙박용 방이 하나라도 있어야 손님이 찾아온다
  if (hasAnyLodging()) {
    gameState.spawnTimer -= dt;
    if (gameState.spawnTimer <= 0) {
      const base = CONFIG.SPAWN_INTERVAL_BY_STAR[gameState.stars];
      gameState.spawnTimer = base * (1 + (Math.random() * 2 - 1) * CONFIG.SPAWN_RANDOMNESS);
      spawnGuest();
    }
  }

  // 손님 움직임
  for (const g of gameState.guests) updateGuest(g, dt);
  // 떠난 손님 정리
  gameState.guests = gameState.guests.filter((g) => {
    if (g.remove) S.removeGuestMesh(g.id);
    return !g.remove;
  });
}

/* =================================================================
   입력 (마우스 / 키보드)
   ================================================================= */
function setupInput(canvas) {
  let downX = 0, downY = 0, downTime = 0;
  canvas.addEventListener('pointermove', (e) => {
    view.mouseX = e.clientX;
    view.mouseY = e.clientY;
    if (e.buttons) {                       // 드래그 중에는 강조 끔
      S.setHover(null);
      UI.hideTooltip();
      return;
    }
    onCellHover(S.pickCell(e.clientX, e.clientY));
  });
  canvas.addEventListener('pointerleave', () => onCellHover(null));
  canvas.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    downY = e.clientY;
    downTime = performance.now();
  });
  canvas.addEventListener('pointerup', (e) => {
    // 드래그(시점 회전)와 클릭을 구분: 거의 안 움직였을 때만 클릭
    const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
    if (e.button !== 0 || moved > 6 || performance.now() - downTime > 600) return;
    view.mouseX = e.clientX;
    view.mouseY = e.clientY;
    const cell = S.pickCell(e.clientX, e.clientY);
    onCellClick(cell);
    onCellHover(cell);
  });

  // 키보드: 1~5 방 선택, 스페이스 일시정지
  window.addEventListener('keydown', (e) => {
    if (UI.isModalOpen()) return;
    const keys = Object.keys(ROOM_TYPES);
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= keys.length) selectRoom(keys[n - 1]);
    if (e.code === 'Space') {
      e.preventDefault();
      togglePause();
    }
  });
}

function selectRoom(key) {
  view.selectedRoom = key;
  UI.renderBuildMenu(key, gameState.gold);
  refreshHover();
}
function togglePause() {
  view.paused = !view.paused;
  UI.setPauseLabel(view.paused);
  UI.showToast(view.paused ? '⏸ 일시정지' : '▶ 계속하기', 'info');
}
function changeSpeed() {
  view.speed = view.speed >= 3 ? 1 : view.speed + 1;
  UI.setSpeedLabel(view.speed);
}

/* =================================================================
   메인 루프
   ================================================================= */
let lastTime = performance.now();
let uiTimer = 0;
function loop(now) {
  const realDt = Math.min((now - lastTime) / 1000, 0.1);   // 탭 전환 등으로 시간이 튀는 것 방지
  lastTime = now;
  const dt = view.paused ? 0 : realDt * view.speed;
  if (dt > 0) update(dt);
  S.renderFrame(dt);
  UI.placeBossBubble(S.bossScreenPosition());
  // HTML UI는 0.2초마다만 갱신 (성능)
  uiTimer += realDt;
  if (uiTimer >= 0.2) {
    uiTimer = 0;
    UI.updateTopBar(gameState);
    UI.renderGuestList(gameState);
  }
  requestAnimationFrame(loop);
}

/* =================================================================
   시작
   ================================================================= */
function start() {
  const canvas = S.initScene(document.getElementById('game-container'));
  UI.initUI({ onSelectRoom: selectRoom, onTogglePause: togglePause, onChangeSpeed: changeSpeed });
  setupInput(canvas);

  // gameState 내용대로 3D 화면을 맞춘다 (나중에 불러오기 할 때도 같은 방식)
  for (let f = 0; f < CONFIG.FLOORS; f++) {
    S.setFloorLocked(f, f >= gameState.unlockedFloors);
    for (let c = 0; c < CONFIG.COLS; c++) {
      const room = gameState.rooms[f][c];
      if (room) S.setRoomModel(f, c, room.type, ROOM_TYPES[room.type]);
    }
  }
  gameState.guests.forEach((g) => S.addGuestMesh(g));

  UI.renderBuildMenu(view.selectedRoom, gameState.gold);
  UI.updateTopBar(gameState);
  UI.renderGuestList(gameState);
  UI.setStarTooltip(averageRating());
  log('🧌 고블린 던전 호텔 개업! 방을 지어 손님을 받아보자.');
  UI.hideLoading();
  setTimeout(() => UI.bossSay('어서 방을 지어! 모험가 손님들이 몰려온다!', 4000), 600);
  requestAnimationFrame(loop);
}

start();

// 디버그/테스트용: 브라우저 콘솔에서 game.gameState 로 상태 확인
window.game = { gameState, update, view, debug: S.debugInfo, cellScreen: S.cellScreenPosition };
