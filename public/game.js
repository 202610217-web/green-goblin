/* =================================================================
   game.js — 게임 규칙과 메인 루프 (시작 파일)
   [큰 단계 1]
   - 방 설치/철거, 손님 방문·이동·숙박·체크아웃, 만족도·별점·날짜
   [큰 단계 2]
   - 2-1 층 확장 (해금, 층별 고급 손님)
   - 2-2 직원 고용 (청소/요리/경비 고블린, 청결도, 월급)
   - 2-3 용사 습격 (경고, 함정 진짜 모드, 방어 성공/실패)
   화면 그리기는 scene.js(3D) / ui.js(HTML)에 맡긴다.
   모든 진행 데이터는 gameState 하나에만 저장한다.
   ================================================================= */
import {
  CONFIG, ROOM_TYPES, GUEST_TYPES, GUEST_SPAWN_WEIGHTS, GUEST_NAMES, GUEST_TIERS, STAFF_TYPES,
} from './config.js';
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
const rand = (min, max) => min + Math.random() * (max - min);

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

// 망가지지 않은 방만 센다
function countRooms(typeKey) {
  let n = 0;
  forEachCell((f, c, room) => { if (room && room.type === typeKey && !room.broken) n++; });
  return n;
}

function hasAnyLodging() {
  let found = false;
  forEachCell((f, c, room) => { if (room && !room.broken && ROOM_TYPES[room.type].lodging) found = true; });
  return found;
}

// 그 방에 손님이 묵고 있거나 들어오는 중인가?
function isRoomTaken(f, c) {
  return gameState.guests.some((g) => g.floor === f && g.col === c && (g.state === 'walking' || g.state === 'staying'));
}

// 고용 중인(떠나는 중이 아닌) 직원 수
function staffCount(role) {
  return gameState.staff.filter((m) => m.role === role && !m.leaving).length;
}

// 방 데이터 기본값 채우기 (예전 데이터 호환)
function normalizeRoom(room) {
  if (!room) return room;
  room.dirt = room.dirt || 0;
  room.realMode = !!room.realMode;
  room.broken = !!room.broken;
  return room;
}

/* =================================================================
   1-2. 방 설치 / 관리
   ================================================================= */
function onCellClick(cell) {
  if (!cell) return;
  const { floor, col } = cell;
  if (floor >= gameState.unlockedFloors) {
    tryUnlockFloor(floor);
    return;
  }
  if (col < 0) {
    UI.bossSay(floor === 0 ? '여기가 호텔 입구야! 손님들은 사다리로 내려온다구.' : '사다리 통로야. 방은 오른쪽 칸에 지어!');
    return;
  }
  if (gameState.rooms[floor][col]) openRoomMenu(floor, col);
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
  gameState.rooms[f][c] = normalizeRoom({ type: view.selectedRoom });
  S.setRoomModel(f, c, view.selectedRoom, rt);
  S.setRoomState(f, c, gameState.rooms[f][c]);
  S.floatText(S.roomStandPoint(f, c), `-${rt.cost}`, '#ff8a8a');
  log(`${rt.emoji} ${rt.name} 설치 (-${rt.cost})`);
  refreshHover();
  UI.updateTopBar(gameState);
}

// 설치된 방 클릭 → 관리 창 (철거 / 함정 진짜 모드 / 수리)
function openRoomMenu(f, c) {
  const room = gameState.rooms[f][c];
  const rt = ROOM_TYPES[room.type];
  const refund = Math.floor(rt.cost * CONFIG.DEMOLISH_REFUND);
  const taken = isRoomTaken(f, c);
  const lines = [`${rt.emoji} ${rt.name} (${UI.floorName(f)})`, UI.roomDesc(rt)];
  if (rt.lodging) lines.push(`청결도 ${Math.round(100 - room.dirt)}%`);
  if (room.broken) lines.push('💥 용사 습격으로 망가졌어요! 손님을 받을 수 없어요.');
  if (room.realMode) lines.push('⚠️ 진짜 함정 모드: 용사 방어 +, 묵는 손님은 크게 불만');
  if (taken) lines.push('🧳 손님이 묵고 있어서 철거할 수 없어요.');

  const buttons = [];
  if (room.broken) {
    const cost = Math.floor(rt.cost * CONFIG.REPAIR_COST_RATIO);
    buttons.push({ label: `🔧 수리 (${cost}G)`, style: 'ok', disabled: gameState.gold < cost, onClick: () => repairRoom(f, c) });
  } else if (rt.trap) {
    buttons.push({
      label: room.realMode ? '😇 손님 모드로' : '⚠️ 진짜 모드로',
      style: 'warn',
      onClick: () => setRealMode(f, c, !room.realMode),
    });
  }
  buttons.push({ label: `🔨 철거 (+${refund}G)`, style: 'danger', disabled: taken, onClick: () => demolish(f, c) });
  buttons.push({ label: '닫기', style: 'normal' });
  UI.showModal(lines.join('\n'), buttons);
}

function demolish(f, c) {
  const room = gameState.rooms[f][c];
  if (!room) return;
  // 창이 떠 있는 동안 손님이 들어왔을 수도 있으니 다시 검사
  if (isRoomTaken(f, c)) {
    UI.showToast('🧳 그 사이 손님이 들어와서 철거할 수 없어요.');
    return;
  }
  const rt = ROOM_TYPES[room.type];
  const refund = Math.floor(rt.cost * CONFIG.DEMOLISH_REFUND);
  gameState.rooms[f][c] = null;
  gameState.gold += refund;
  S.setRoomModel(f, c, null);
  S.setRoomState(f, c, null);
  S.spawnCoins(S.roomStandPoint(f, c), 4);
  S.floatText(S.roomStandPoint(f, c), `+${refund}`);
  log(`🔨 ${rt.name} 철거 (+${refund})`);
  refreshHover();
  UI.updateTopBar(gameState);
}

function setRealMode(f, c, on) {
  const room = gameState.rooms[f][c];
  if (!room || room.broken) return;
  room.realMode = on;
  S.setRoomState(f, c, room);
  log(on ? `⚠️ ${UI.floorName(f)} 바위 함정을 진짜 모드로!` : `😇 ${UI.floorName(f)} 바위 함정을 손님 모드로`);
  if (on) UI.bossSay('크크크… 이번엔 진짜로 굴러간다!');
  refreshHover();
}

function repairRoom(f, c) {
  const room = gameState.rooms[f][c];
  if (!room || !room.broken) return;
  const rt = ROOM_TYPES[room.type];
  const cost = Math.floor(rt.cost * CONFIG.REPAIR_COST_RATIO);
  if (gameState.gold < cost) {
    UI.showToast(`💸 수리비가 부족해요! (${cost}골드 필요)`);
    return;
  }
  gameState.gold -= cost;
  room.broken = false;
  room.dirt = 0;
  S.setRoomState(f, c, room);
  S.floatText(S.roomStandPoint(f, c), `🔧 -${cost}`, '#ff8a8a');
  log(`🔧 ${rt.name} 수리 완료 (-${cost})`);
  refreshHover();
  UI.updateTopBar(gameState);
}

/* =================================================================
   2-1. 층 확장
   ================================================================= */
function tryUnlockFloor(f) {
  const next = gameState.unlockedFloors;           // 다음에 열 수 있는 층
  if (f > next) {
    UI.showToast(`🔒 ${UI.floorName(next)}을(를) 먼저 열어야 해요! (${CONFIG.FLOOR_UNLOCK_COST[next].toLocaleString()}골드)`);
    return;
  }
  const cost = CONFIG.FLOOR_UNLOCK_COST[f];
  const tier = GUEST_TIERS[Math.min(f, GUEST_TIERS.length - 1)];
  if (gameState.gold < cost) {
    UI.showToast(`🔒 ${UI.floorName(f)} 해금 비용은 ${cost.toLocaleString()}골드예요. (${(cost - gameState.gold).toLocaleString()}골드 더 필요)`);
    UI.bossSay(`${UI.floorName(f)}에는 ${tier.badge}${tier.name} 손님이 온다던데… 돈을 모으자!`);
    return;
  }
  UI.confirmModal(
    `🔓 ${UI.floorName(f)}을(를) ${cost.toLocaleString()}골드에 열까요?\n` +
    `이 층에는 ${tier.badge}${tier.name} 손님이 와요.\n(숙박비 ×${tier.incomeMul} · 팁 ×${tier.tipMul}, 대신 만족시키기 어려워요)`,
    () => unlockFloor(f), '열기', 'ok',
  );
}

function unlockFloor(f) {
  const cost = CONFIG.FLOOR_UNLOCK_COST[f];
  if (f !== gameState.unlockedFloors || gameState.gold < cost) return;
  gameState.gold -= cost;
  gameState.unlockedFloors = f + 1;
  S.playFloorUnlock(f);            // 어둠이 걷히고 횃불이 켜지는 연출
  S.shakeCamera(0.4);
  log(`🔓 ${UI.floorName(f)} 개방! (-${cost.toLocaleString()})`);
  UI.showToast(`🔥 ${UI.floorName(f)}에 불이 켜졌어요!`, 'info');
  UI.bossSay('새 층이다! 고급 손님을 받을 방을 지어보자!');
  refreshHover();
  UI.updateTopBar(gameState);
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
    const next = gameState.unlockedFloors;
    const cost = CONFIG.FLOOR_UNLOCK_COST[floor];
    const tier = GUEST_TIERS[Math.min(floor, GUEST_TIERS.length - 1)];
    html = `🔒 <b>${UI.floorName(floor)}</b> · ${tier.badge}${tier.name} 손님 층<br>`;
    if (floor > next) html += `<span class="no">${UI.floorName(next)}을(를) 먼저 열어야 해요</span>`;
    else html += gameState.gold >= cost
      ? `<span class="ok">클릭해서 열기 (💰 ${cost.toLocaleString()}골드)</span>`
      : `<span class="no">해금 비용 ${cost.toLocaleString()}골드 (부족)</span>`;
  } else if (col < 0) {
    mode = 'info';
    html = floor === 0 ? '🚪 <b>호텔 입구</b><br>손님이 사다리로 내려와요' : `🪜 <b>${UI.floorName(floor)} 통로</b>`;
  } else {
    const room = gameState.rooms[floor][col];
    if (room) {
      const rt = ROOM_TYPES[room.type];
      const taken = isRoomTaken(floor, col);
      mode = room.broken ? 'deny' : taken ? 'info' : 'demolish';
      html = `${rt.emoji} <b>${rt.name}</b><br>${UI.roomDesc(rt)}`;
      if (rt.lodging) html += `<br>청결도 ${Math.round(100 - room.dirt)}%`;
      if (room.broken) html += '<br><span class="no">💥 망가짐 · 클릭해서 수리</span>';
      else if (room.realMode) html += '<br><span class="no">⚠️ 진짜 함정 모드</span>';
      html += taken ? '<br><span class="warn">손님 투숙 중</span>' : '<br><span class="warn">클릭해서 관리 (철거 등)</span>';
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
   1-3. 손님 시스템 (+ 2-1 층별 등급, 2-2 청결도, 2-3 진짜 모드)
   ================================================================= */

// '목표 만족도' 계산: 취향 + 식당 - 등급 까다로움 - 더러움 - 진짜 함정
function targetSatisfaction(guestType, tier, room) {
  const g = GUEST_TYPES[guestType];
  const r = ROOM_TYPES[room.type];
  let sat = CONFIG.BASE_SATISFACTION + r.comfort * g.comfortWeight + r.thrill * g.thrillWeight;
  if (countRooms('restaurant') > 0) sat += CONFIG.RESTAURANT_SAT_BONUS;
  sat -= GUEST_TIERS[tier].satPenalty;
  sat -= (room.dirt || 0) * CONFIG.DIRT_SAT_PENALTY;
  if (room.realMode) sat -= CONFIG.REAL_MODE_SAT_PENALTY;
  return clamp(sat, 0, 100);
}

// 빈 숙박용 방 중에서 그 손님에게 가장 잘 맞는 방 (깨끗하고 취향에 맞는 방)
function findBestFreeRoom(guestType) {
  let best = null;
  forEachCell((f, c, room) => {
    if (!room || room.broken || !ROOM_TYPES[room.type].lodging || isRoomTaken(f, c)) return;
    const score = targetSatisfaction(guestType, 0, room) + Math.random() * 3;   // 비슷하면 랜덤
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
    tier: 0,                   // 0 일반 / 1 고급 / 2 귀족 (묵는 층으로 정해짐)
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
    // 2-1. 아래층일수록 고급 손님
    guest.tier = Math.min(room.floor, GUEST_TIERS.length - 1);
    const tier = GUEST_TIERS[guest.tier];
    guest.badge = tier.badge;
    guest.scale = tier.scale;
    guest.path = S.pathToRoom(room.floor, room.col);
    log(`${gt.emoji} ${tier.badge}${tier.badge ? tier.name + ' ' : ''}${gt.name} ${guest.name} 체크인`);
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

// 경로를 따라 이동 (손님/직원/용사 공통). 경로 끝에 도착하면 true
function moveAlongPath(who, dt, speed = CONFIG.GUEST_WALK_SPEED) {
  let remaining = speed * dt;
  while (remaining > 0 && who.path.length) {
    const t = who.path[0];
    const dx = t.x - who.pos.x, dy = t.y - who.pos.y, dz = t.z - who.pos.z;
    const dist = Math.hypot(dx, dy, dz);
    // 수평으로 움직일 때만 몸 방향을 바꾼다 (사다리에서는 그대로)
    if (Math.hypot(dx, dz) > 0.01) who.facing = Math.atan2(dx, dz);
    if (dist <= remaining) {
      who.pos = { x: t.x, y: t.y, z: t.z };
      who.path.shift();
      remaining -= dist;
    } else {
      who.pos = {
        x: who.pos.x + (dx / dist) * remaining,
        y: who.pos.y + (dy / dist) * remaining,
        z: who.pos.z + (dz / dist) * remaining,
      };
      remaining = 0;
    }
  }
  return who.path.length === 0;
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
      const target = targetSatisfaction(guest.type, guest.tier || 0, room);
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

// 식당 손님 1명당 수익 합계 (식당 수 × 기본 + 요리사 보너스)
function foodIncomePerGuest() {
  const restaurants = countRooms('restaurant');
  if (restaurants === 0) return 0;
  const cooks = Math.min(staffCount('cook'), restaurants * CONFIG.COOKS_PER_RESTAURANT);
  return restaurants * ROOM_TYPES.restaurant.perGuest + cooks * CONFIG.COOK_BONUS_PER_GUEST;
}

// 체크아웃: 숙박비 + 식당 + 팁 지불, 동전 효과
function checkout(guest) {
  const room = gameState.rooms[guest.floor][guest.col];
  const tier = GUEST_TIERS[guest.tier || 0];
  const sat = guest.satisfaction;
  let fee = 0, tip = 0;
  if (room) {
    const rt = ROOM_TYPES[room.type];
    fee = Math.round(rt.income * tier.incomeMul);
    if (sat < CONFIG.MOOD_NEUTRAL) fee = Math.floor(fee * CONFIG.UNHAPPY_PAY_RATIO);
    if (sat >= CONFIG.TIP_START) {
      tip = Math.round(rt.income * tier.tipMul * CONFIG.TIP_MAX_RATIO * (sat - CONFIG.TIP_START) / (100 - CONFIG.TIP_START));
    }
  }
  const food = foodIncomePerGuest();
  const total = fee + food + tip;
  gameState.gold += total;
  gameState.stats.totalEarned += total;
  recordRating(sat);

  const gt = GUEST_TYPES[guest.type];
  let detail = `숙박 ${fee}`;
  if (food) detail += ` + 식사 ${food}`;
  if (tip) detail += ` + 팁 ${tip}`;
  log(`${UI.moodEmoji(sat)} ${tier.badge}${gt.name} ${guest.name} 체크아웃: ${detail} = ${total}골드`);
  S.spawnCoins(guest.pos, clamp(Math.ceil(total / 10), 3, 14));
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
   2-2. 청결도
   ================================================================= */
function updateDirt(dt) {
  forEachCell((f, c, room) => {
    if (!room || room.broken || !ROOM_TYPES[room.type].lodging) return;
    const staying = gameState.guests.some((g) => g.floor === f && g.col === c && g.state === 'staying');
    room.dirt = clamp(room.dirt + (staying ? CONFIG.DIRT_PER_SECOND_STAY : CONFIG.DIRT_PER_SECOND_IDLE) * dt, 0, 100);
  });
}

/* =================================================================
   2-2. 직원 (고용 / 해고 / 월급 / 일하는 모습)
   ================================================================= */
function hireStaff(role) {
  const st = STAFF_TYPES[role];
  if (staffCount(role) >= CONFIG.STAFF_MAX_PER_TYPE) {
    UI.showToast(`${st.emoji} ${st.name}은(는) 최대 ${CONFIG.STAFF_MAX_PER_TYPE}명까지 고용할 수 있어요.`);
    return;
  }
  if (gameState.gold < st.hireCost) {
    UI.showToast(`💸 고용비가 부족해요! (${st.hireCost}골드 필요)`);
    return;
  }
  gameState.gold -= st.hireCost;
  const member = {
    id: gameState.nextStaffId++,
    role,
    pos: S.spawnPoint(),
    path: [],
    facing: 0,
    task: null,
    timer: 0,
    leaving: false,
  };
  // 지상에서 사다리를 타고 출근
  member.path = S.walkPath(member.pos, 0, randomCorridorX());
  gameState.staff.push(member);
  S.addStaffMesh(member, st.outfit);
  log(`${st.emoji} ${st.name} 고용 (-${st.hireCost})`);
  UI.bossSay(pick(['잘 부탁한다, 신입!', '열심히 일하면 월급 준다! 크크.', '어서 일해라!']));
  UI.updateTopBar(gameState);
  UI.renderHirePanel(gameState);
}

function fireStaff(role) {
  // 가장 나중에 들어온 직원부터 내보낸다
  const member = [...gameState.staff].reverse().find((m) => m.role === role && !m.leaving);
  if (!member) return;
  sendStaffHome(member);
  log(`👋 ${STAFF_TYPES[role].name} 해고`);
  UI.renderHirePanel(gameState);
}

// 직원이 지상으로 걸어 나가서 사라지게 한다
function sendStaffHome(member) {
  member.leaving = true;
  member.task = null;
  member.path = S.walkPath(member.pos, -1, 0);
}

// 하루가 지날 때 월급 지급. 골드가 모자라면 그 직원은 떠난다
function paySalaries() {
  let paid = 0;
  const quit = [];
  for (const m of gameState.staff) {
    if (m.leaving) continue;
    const st = STAFF_TYPES[m.role];
    if (gameState.gold >= st.salary) {
      gameState.gold -= st.salary;
      paid += st.salary;
    } else {
      quit.push(m);
      sendStaffHome(m);
    }
  }
  if (paid > 0) log(`💼 직원 월급 지급 (-${paid})`);
  if (quit.length) {
    const names = quit.map((m) => STAFF_TYPES[m.role].name).join(', ');
    log(`😢 월급을 못 받은 직원이 떠났어요: ${names}`);
    UI.showToast(`😢 골드가 부족해서 월급을 못 준 직원 ${quit.length}명이 떠났어요!`);
    UI.bossSay('돈이 없어서 직원이 떠났다… 흑흑.');
  }
  UI.renderHirePanel(gameState);
}

function randomCorridorX() {
  return rand(S.roomCenterX(0) - 1.5, S.roomCenterX(CONFIG.COLS - 1) + 1.5);
}

// 직원 한 명의 다음 할 일 정하기
function chooseStaffTask(m) {
  const raid = gameState.raid;
  // 경비: 습격 중이면 용사가 노리는 방 앞으로 달려간다
  if (m.role === 'guard' && raid && raid.target && ['warning', 'attack', 'fight'].includes(raid.phase)) {
    const guards = gameState.staff.filter((s) => s.role === 'guard' && !s.leaving);
    const i = guards.indexOf(m);
    const { floor, col } = raid.target;
    m.task = { kind: 'defend' };
    m.path = S.walkPath(m.pos, floor, S.roomCenterX(col) - 1.4 + i * 0.5, S.CORRIDOR_Z + 0.25);
    return;
  }
  // 청소: 가장 더러운 방 (다른 청소부가 맡지 않은 방)
  if (m.role === 'cleaner') {
    let best = null;
    forEachCell((f, c, room) => {
      if (!room || room.broken || room.dirt < CONFIG.CLEAN_START_DIRT) return;
      const claimed = gameState.staff.some((o) => o !== m && o.task && o.task.kind === 'clean' && o.task.f === f && o.task.c === c);
      if (claimed) return;
      if (!best || room.dirt > best.dirt) best = { f, c, dirt: room.dirt };
    });
    if (best) {
      m.task = { kind: 'clean', f: best.f, c: best.c };
      m.path = S.walkPath(m.pos, best.f, S.roomCenterX(best.c) - 0.9, 0.5);
      return;
    }
  }
  // 요리: 식당의 냄비 앞 (요리사가 적은 식당 우선)
  if (m.role === 'cook') {
    const list = [];
    forEachCell((f, c, room) => { if (room && !room.broken && room.type === 'restaurant') list.push({ f, c }); });
    if (list.length) {
      const load = (r) => gameState.staff.filter((o) => o !== m && o.task && o.task.kind === 'cook' && o.task.f === r.f && o.task.c === r.c).length;
      list.sort((a, b) => load(a) - load(b));
      const r = list[0];
      m.task = { kind: 'cook', f: r.f, c: r.c, t: rand(6, 10) };
      m.path = S.walkPath(m.pos, r.f, S.roomCenterX(r.c) + 0.45 + Math.random() * 0.3, -0.45);
      return;
    }
  }
  // 할 일이 없으면 복도를 순찰/산책
  m.task = { kind: 'wait', t: rand(1.5, 4) };
  m.path = S.walkPath(m.pos, Math.floor(Math.random() * gameState.unlockedFloors), randomCorridorX());
}

function updateStaffMember(m, dt) {
  let walking = false, working = false;
  if (m.path.length) {
    walking = true;
    moveAlongPath(m, dt, CONFIG.STAFF_WALK_SPEED);
  } else if (m.leaving) {
    m.remove = true;
  } else if (!m.task) {
    m.timer -= dt;
    if (m.timer <= 0) chooseStaffTask(m);
  } else {
    // 도착해서 일하는 중
    const t = m.task;
    if (t.kind === 'clean') {
      const room = gameState.rooms[t.f][t.c];
      working = true;
      m.facing = -Math.PI / 2 + Math.sin(performance.now() / 300) * 0.6;   // 걸레질하며 두리번
      if (!room || room.broken) {
        m.task = null;
      } else {
        room.dirt = Math.max(0, room.dirt - CONFIG.CLEAN_SPEED * dt);
        if (room.dirt <= 0) {
          m.task = null;
          m.timer = 0.5;
        }
      }
    } else if (t.kind === 'cook') {
      working = true;
      m.facing = Math.PI * 0.75;          // 냄비 쪽을 바라봄
      t.t -= dt;
      if (t.t <= 0 || !gameState.rooms[t.f][t.c]) m.task = null;
    } else if (t.kind === 'defend') {
      working = true;
      m.facing = 0;
      if (!gameState.raid || !['warning', 'attack', 'fight'].includes(gameState.raid.phase)) m.task = null;
    } else {
      t.t -= dt;
      m.facing = 0;
      if (t.t <= 0) m.task = null;
    }
  }
  S.updateStaffMesh(m, walking, working);
}

function updateStaff(dt) {
  for (const m of gameState.staff) updateStaffMember(m, dt);
  gameState.staff = gameState.staff.filter((m) => {
    if (m.remove) {
      S.removeStaffMesh(m.id);
      UI.renderHirePanel(gameState);
    }
    return !m.remove;
  });
}

/* =================================================================
   2-3. 용사 습격
   raid.phase: scheduled(예정) → warning(경고) → attack(침입) → fight(전투) → retreat(퇴각) → 끝
   ================================================================= */

// 진짜 모드 함정 수 / 전체 함정 수
function trapCounts() {
  let traps = 0, real = 0;
  forEachCell((f, c, room) => {
    if (!room || room.broken || !ROOM_TYPES[room.type].trap) return;
    traps++;
    if (room.realMode) real++;
  });
  return { traps, real };
}

function defenseChance() {
  const { real } = trapCounts();
  const chance = CONFIG.RAID_BASE_DEFENSE + real * CONFIG.RAID_TRAP_BONUS + staffCount('guard') * CONFIG.RAID_GUARD_BONUS;
  return Math.min(CONFIG.RAID_MAX_DEFENSE, chance);
}

// 하루가 시작될 때 습격 여부 결정
function maybeScheduleRaid() {
  if (gameState.raid || gameState.day < CONFIG.RAID_START_DAY) return;
  let anyRoom = false;
  forEachCell((f, c, room) => { if (room && !room.broken) anyRoom = true; });
  if (!anyRoom || Math.random() >= CONFIG.RAID_CHANCE_PER_DAY) return;
  gameState.raid = { phase: 'scheduled', timer: rand(4, CONFIG.DAY_SECONDS * 0.5) };
}

function startRaidWarning() {
  // 용사가 노릴 방: 비싼 방일수록 잘 노린다
  const candidates = [];
  forEachCell((f, c, room) => { if (room && !room.broken) candidates.push({ floor: f, col: c, w: ROOM_TYPES[room.type].cost }); });
  if (!candidates.length) {
    gameState.raid = null;
    return;
  }
  let r = Math.random() * candidates.reduce((s, x) => s + x.w, 0);
  let target = candidates[0];
  for (const cand of candidates) {
    if ((r -= cand.w) < 0) { target = cand; break; }
  }
  gameState.raid = {
    phase: 'warning',
    timer: CONFIG.RAID_WARNING_SECONDS,
    target: { floor: target.floor, col: target.col },
    hero: null,
    hitTraps: [],
    success: null,
  };
  const rt = ROOM_TYPES[gameState.rooms[target.floor][target.col].type];
  log(`⚔️ 경고! 용사가 ${UI.floorName(target.floor)} ${rt.name}을(를) 노리고 있어요!`);
  UI.showToast('⚔️ 용사 습격 경고! 함정을 진짜 모드로 바꾸세요!');
  UI.bossSay('큰일이다! 진짜 던전인 줄 아는 용사가 온다!', 4000);
  // 경비 고블린 출동
  gameState.staff.forEach((m) => { if (m.role === 'guard' && !m.leaving) { m.task = null; m.timer = 0; } });
}

function updateRaid(dt) {
  const raid = gameState.raid;
  if (!raid) return;
  raid.timer -= dt;

  if (raid.phase === 'scheduled') {
    if (raid.timer <= 0) startRaidWarning();
    return;
  }
  // 노리던 방이 철거되면 다른 방으로 (방이 하나도 없으면 용사가 그냥 돌아감)
  if (raid.target && !gameState.rooms[raid.target.floor][raid.target.col] && raid.phase !== 'retreat') {
    retargetOrLeave(raid);
    if (!gameState.raid) return;
  }

  if (raid.phase === 'warning') {
    if (raid.timer <= 0) {
      // 용사 등장: 지상에서 사다리를 타고 노리는 방 앞까지
      raid.phase = 'attack';
      const start = S.spawnPoint();
      raid.hero = { pos: start, path: [], facing: 0, emoji: '😤', fighting: false };
      raid.hero.path = S.walkPath(start, raid.target.floor, S.roomCenterX(raid.target.col) + 0.6);
      log('🗡️ 용사가 쳐들어왔다!');
      UI.bossSay('막아라!!');
    }
  } else if (raid.phase === 'attack') {
    const arrived = moveAlongPath(raid.hero, dt, CONFIG.HERO_WALK_SPEED);
    checkTrapHits(raid);
    if (arrived) {
      raid.phase = 'fight';
      raid.timer = 2.2;
      raid.hero.fighting = true;
      raid.hero.facing = 0;
      raid.hero.emoji = '⚔️';
    }
  } else if (raid.phase === 'fight') {
    if (raid.timer <= 0) resolveRaid(raid);
  } else if (raid.phase === 'retreat') {
    const speed = raid.success ? CONFIG.HERO_WALK_SPEED * 1.8 : CONFIG.HERO_WALK_SPEED;   // 지면 허겁지겁 도망
    if (moveAlongPath(raid.hero, dt, speed)) {
      gameState.raid = null;
      S.hideHero();
      return;
    }
  }
  if (raid.hero) S.showHero(raid.hero);
}

function retargetOrLeave(raid) {
  let next = null;
  forEachCell((f, c, room) => { if (!next && room && !room.broken) next = { floor: f, col: c }; });
  if (!next) {
    if (raid.hero) {
      raid.phase = 'retreat';
      raid.success = true;
      raid.hero.fighting = false;
      raid.hero.emoji = '🤔';
      raid.hero.path = S.walkPath(raid.hero.pos, -1, 0);
    } else {
      gameState.raid = null;
    }
    return;
  }
  raid.target = next;
  if (raid.hero && raid.phase === 'attack') raid.hero.path = S.walkPath(raid.hero.pos, next.floor, S.roomCenterX(next.col) + 0.6);
}

// 용사가 진짜 모드 함정 앞을 지나가면 바위가 쿵!
function checkTrapHits(raid) {
  const hero = raid.hero;
  const f = S.floorOfY(hero.pos.y);
  if (f < 0) return;
  for (let c = 0; c < CONFIG.COLS; c++) {
    const room = gameState.rooms[f][c];
    const k = `${f},${c}`;
    if (!room || !room.realMode || room.broken || raid.hitTraps.includes(k)) continue;
    if (Math.abs(hero.pos.x - S.roomCenterX(c)) < 1.0 && Math.abs(hero.pos.y - S.floorY(f)) < 0.1) {
      raid.hitTraps.push(k);
      hero.emoji = '😵';
      S.floatText(hero.pos, '💥 쿵! 바위 함정!', '#ff9a6a');
      S.shakeCamera(0.35);
    }
  }
}

function resolveRaid(raid) {
  const chance = defenseChance();
  const success = Math.random() < chance;
  raid.success = success;
  raid.phase = 'retreat';
  raid.timer = 0;
  const hero = raid.hero;
  hero.fighting = false;
  const pos = { ...hero.pos };
  if (success) {
    const reward = CONFIG.RAID_REWARD_BASE + gameState.day * CONFIG.RAID_REWARD_PER_DAY;
    gameState.gold += reward;
    gameState.stats.raidsWon++;
    hero.emoji = '😭';
    S.spawnCoins(pos, 14);
    S.floatText(pos, `🎉 방어 성공! +${reward}G`);
    log(`🎉 용사를 물리쳤어요! 보상 +${reward}골드 (방어 확률 ${Math.round(chance * 100)}%)`);
    UI.showToast(`🎉 방어 성공! 용사가 떨어뜨린 ${reward}골드를 주웠어요!`, 'info');
    UI.bossSay('크하하! 우리 던전 호텔을 얕보지 마라!');
  } else {
    const steal = Math.min(gameState.gold, Math.max(CONFIG.RAID_STEAL_MIN, Math.floor(gameState.gold * CONFIG.RAID_STEAL_RATIO)));
    gameState.gold -= steal;
    gameState.stats.raidsLost++;
    hero.emoji = '😈';
    breakRoom(raid.target.floor, raid.target.col);
    S.floatText(pos, `💸 -${steal}G · 방이 망가졌다!`, '#ff8a8a');
    S.shakeCamera(0.7);
    log(`💸 방어 실패… ${steal}골드를 빼앗기고 방이 망가졌어요. (방어 확률 ${Math.round(chance * 100)}%)`);
    UI.showToast(`💸 방어 실패! ${steal}골드를 빼앗겼어요…`);
    UI.bossSay('으아아… 내 금고! 다음엔 함정과 경비를 준비하자!');
  }
  hero.path = S.walkPath(hero.pos, -1, 0);
  UI.updateTopBar(gameState);
}

// 방이 망가짐: 묵던 손님은 화나서 나가고, 방은 수리 전까지 못 씀
function breakRoom(f, c) {
  const room = gameState.rooms[f][c];
  if (!room) return;
  room.broken = true;
  room.realMode = false;
  for (const g of gameState.guests) {
    if (g.floor === f && g.col === c && (g.state === 'walking' || g.state === 'staying')) {
      const wasStaying = g.state === 'staying';
      g.satisfaction = 10;
      recordRating(g.satisfaction);
      g.state = 'leaving';
      g.path = wasStaying ? S.pathFromRoom(f, c) : S.walkPath(g.pos, -1, 0);
    }
  }
  S.setRoomState(f, c, room);
}

// 경고 띠의 '함정 전부 진짜 모드' 버튼
function setAllTrapsReal() {
  let n = 0;
  forEachCell((f, c, room) => {
    if (room && !room.broken && ROOM_TYPES[room.type].trap && !room.realMode) {
      room.realMode = true;
      S.setRoomState(f, c, room);
      n++;
    }
  });
  if (n) {
    log(`⚠️ 바위 함정 ${n}개를 진짜 모드로!`);
    UI.bossSay('크크크… 다 진짜로 굴러간다!');
  }
}

function raidBannerInfo() {
  const raid = gameState.raid;
  if (!raid || raid.phase === 'scheduled') return null;
  const { traps, real } = trapCounts();
  return {
    phase: raid.phase,
    timeLeft: Math.max(0, raid.timer),
    chance: defenseChance(),
    traps, realTraps: real,
    guards: staffCount('guard'),
    success: raid.success,
  };
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
    paySalaries();
    maybeScheduleRaid();
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

  updateDirt(dt);
  updateStaff(dt);
  updateRaid(dt);
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
  // HTML UI와 방 상태 표시는 0.2초마다만 갱신 (성능)
  uiTimer += realDt;
  if (uiTimer >= 0.2) {
    uiTimer = 0;
    UI.updateTopBar(gameState);
    UI.renderGuestList(gameState);
    UI.renderHirePanel(gameState);
    UI.updateRaidBanner(raidBannerInfo());
    forEachCell((f, c, room) => S.setRoomState(f, c, room));
  }
  requestAnimationFrame(loop);
}

/* =================================================================
   시작
   ================================================================= */
function start() {
  const canvas = S.initScene(document.getElementById('game-container'));
  UI.initUI({
    onSelectRoom: selectRoom,
    onTogglePause: togglePause,
    onChangeSpeed: changeSpeed,
    onHire: hireStaff,
    onFire: fireStaff,
    onAllTrapsReal: setAllTrapsReal,
  });
  setupInput(canvas);

  // gameState 내용대로 3D 화면을 맞춘다 (나중에 불러오기 할 때도 같은 방식)
  for (let f = 0; f < CONFIG.FLOORS; f++) {
    S.setFloorLocked(f, f >= gameState.unlockedFloors);
    for (let c = 0; c < CONFIG.COLS; c++) {
      const room = normalizeRoom(gameState.rooms[f][c]);
      if (room) {
        S.setRoomModel(f, c, room.type, ROOM_TYPES[room.type]);
        S.setRoomState(f, c, room);
      }
    }
  }
  gameState.guests.forEach((g) => S.addGuestMesh(g));
  gameState.staff.forEach((m) => S.addStaffMesh(m, STAFF_TYPES[m.role].outfit));

  UI.renderBuildMenu(view.selectedRoom, gameState.gold);
  UI.renderHirePanel(gameState);
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
window.game = {
  gameState, update, view,
  debug: S.debugInfo,
  cellScreen: S.cellScreenPosition,
  // 테스트용: 바로 습격 경고 시작
  startRaidNow: () => { gameState.raid = null; startRaidWarning(); },
  defenseChance,
};
