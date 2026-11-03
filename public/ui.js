/* =================================================================
   ui.js — 3D 화면 위에 겹쳐 보이는 HTML UI 담당
   (상태바, 건설 메뉴, 손님 목록, 알림, 확인 창, 말풍선, 안내 툴팁)
   게임 규칙은 모르고, game.js가 시키는 대로 그리기만 한다.
   ================================================================= */
import { CONFIG, ROOM_TYPES, GUEST_TYPES } from './config.js';

const $ = (id) => document.getElementById(id);
let handlers = {};

/* ---------------- 공통 도우미 ---------------- */
export function moodEmoji(sat) {
  if (sat >= CONFIG.MOOD_HAPPY) return '😊';
  if (sat >= CONFIG.MOOD_NEUTRAL) return '😐';
  return '😠';
}
function moodColor(sat) {
  if (sat >= CONFIG.MOOD_HAPPY) return 'var(--green)';
  if (sat >= CONFIG.MOOD_NEUTRAL) return 'var(--gold)';
  return 'var(--danger)';
}
export function starString(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
export function floorName(f) {
  return `지하 ${f + 1}층`;
}
// 방 효과 설명 (예: "1박 20G · 편안+2")
export function roomDesc(rt) {
  if (!rt.lodging) return `손님당 +${rt.perGuest}G`;
  let s = `1박 ${rt.income}G`;
  if (rt.comfort) s += ` · 편안+${rt.comfort}`;
  if (rt.thrill) s += ` · 스릴+${rt.thrill}`;
  return s;
}

/* =================================================================
   초기화: 버튼에 이벤트 연결
   handlers = { onSelectRoom(key), onTogglePause(), onChangeSpeed() }
   ================================================================= */
export function initUI(h) {
  handlers = h;
  $('pause-btn').addEventListener('click', () => handlers.onTogglePause());
  $('speed-btn').addEventListener('click', () => handlers.onChangeSpeed());
  $('panel-toggle').addEventListener('click', () => {
    const p = $('guest-panel');
    p.classList.toggle('collapsed');
    $('panel-toggle').textContent = p.classList.contains('collapsed') ? '+' : '−';
  });
  // 좁은 화면에서는 손님 목록을 접어서 시작 (던전이 잘 보이도록)
  if (window.innerWidth < 760) {
    $('guest-panel').classList.add('collapsed');
    $('panel-toggle').textContent = '+';
  }
  $('modal-ok').addEventListener('click', () => {
    const cb = modalCallback;
    closeModal();
    if (cb) cb();
  });
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-bg').addEventListener('click', (e) => { if (e.target.id === 'modal-bg') closeModal(); });
}

export function hideLoading() {
  $('loading').classList.add('hide');
}

/* ---------------- 위쪽 상태바 ---------------- */
let lastGold = null;
export function updateTopBar(state) {
  const goldEl = $('gold-text');
  goldEl.textContent = state.gold.toLocaleString();
  if (lastGold !== null && state.gold > lastGold) {
    // 돈이 늘면 반짝
    goldEl.classList.remove('gold-flash');
    void goldEl.offsetWidth;
    goldEl.classList.add('gold-flash');
  }
  if (lastGold !== state.gold) {
    lastGold = state.gold;
    updateBuildAffordability(state.gold);
  }
  $('star-text').textContent = starString(state.stars);
  $('day-text').textContent = state.day;
  $('day-bar-fill').style.width = `${(state.dayTimer / CONFIG.DAY_SECONDS) * 100}%`;
}

export function setStarTooltip(avg) {
  $('star-stat').title = `호텔 별점 (최근 손님 평균 만족도 ${Math.round(avg)})`;
}

export function setPauseLabel(paused) {
  $('pause-btn').textContent = paused ? '▶' : '⏸';
  $('pause-btn').title = paused ? '계속하기 (스페이스바)' : '일시정지 (스페이스바)';
}
export function setSpeedLabel(speed) {
  $('speed-btn').textContent = `x${speed}`;
}

/* ---------------- 건설 메뉴 ---------------- */
export function renderBuildMenu(selectedKey, gold) {
  const wrap = $('build-buttons');
  wrap.innerHTML = '';
  Object.entries(ROOM_TYPES).forEach(([key, rt], i) => {
    const btn = document.createElement('button');
    btn.className = 'build-btn' + (selectedKey === key ? ' selected' : '');
    btn.dataset.key = key;
    btn.title = `${rt.name} — ${rt.cost}골드 (${roomDesc(rt)}) [단축키 ${i + 1}]`;
    btn.innerHTML = `
      <span class="hotkey">${i + 1}</span>
      <div class="b-emoji">${rt.emoji}</div>
      <div class="b-name">${rt.name}</div>
      <div class="b-cost">💰 ${rt.cost}</div>
      <div class="b-desc">${roomDesc(rt)}</div>`;
    btn.addEventListener('click', () => handlers.onSelectRoom(key));
    wrap.appendChild(btn);
  });
  updateBuildAffordability(gold);
}

// 골드가 모자란 방 버튼은 흐리게
function updateBuildAffordability(gold) {
  document.querySelectorAll('.build-btn').forEach((btn) => {
    btn.classList.toggle('too-expensive', gold < ROOM_TYPES[btn.dataset.key].cost);
  });
}

/* ---------------- 오른쪽 손님 목록 ---------------- */
export function renderGuestList(state) {
  const list = $('guest-list');
  // 화나서 돌아가는 손님, 체크아웃한 손님은 목록에서 뺀다
  const inHotel = state.guests.filter((g) => g.state === 'walking' || g.state === 'staying');
  $('guest-count').textContent = `(${inHotel.length}명)`;
  if (inHotel.length === 0) {
    list.innerHTML = '<div class="empty-msg">아직 손님이 없어요…<br>방을 지으면 모험가가 찾아와요!</div>';
    return;
  }
  list.innerHTML = inHotel.map((g) => {
    const gt = GUEST_TYPES[g.type];
    const room = state.rooms[g.floor][g.col];
    const roomName = room ? ROOM_TYPES[room.type].name : '?';
    const sat = Math.round(g.satisfaction);
    const where = g.state === 'walking' ? '🚶 방으로 가는 중' : `🛏️ ${floorName(g.floor)} ${roomName}`;
    const color = '#' + gt.color.toString(16).padStart(6, '0');
    return `<div class="g-row" style="border-left-color:${color}">
        <div class="g-top">
          <span class="g-name">${gt.emoji} ${gt.name} ${g.name}</span>
          <span>${moodEmoji(sat)} ${sat}</span>
        </div>
        <div class="g-room">${where} · 취향: ${gt.likes}</div>
        <div class="sat-bar"><div class="sat-fill" style="width:${sat}%;background:${moodColor(sat)}"></div></div>
      </div>`;
  }).join('');
}

/* ---------------- 호텔 소식(로그) ---------------- */
export function addLog(day, msg) {
  const log = $('log');
  const div = document.createElement('div');
  div.className = 'new';
  div.textContent = `[${day}일] ${msg}`;
  log.prepend(div);
  [...log.children].slice(1, 3).forEach((c) => c.classList.remove('new'));
  while (log.children.length > 25) log.lastChild.remove();
}

/* ---------------- 알림 ---------------- */
let toastTimer = null;
export function showToast(msg, type = 'warn') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show' + (type === 'info' ? ' info' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ---------------- 확인 창 ---------------- */
let modalCallback = null;
export function confirmModal(text, onOk, okLabel = '확인') {
  $('modal-text').textContent = text;
  $('modal-ok').textContent = okLabel;
  $('modal-bg').classList.add('show');
  modalCallback = onOk;
}
function closeModal() {
  $('modal-bg').classList.remove('show');
  modalCallback = null;
}
export function isModalOpen() {
  return $('modal-bg').classList.contains('show');
}

/* ---------------- 마우스 안내 툴팁 ---------------- */
export function showTooltip(x, y, html) {
  const t = $('tooltip');
  t.innerHTML = html;
  t.style.display = 'block';
  // 화면 밖으로 나가지 않도록
  const w = t.offsetWidth, h = t.offsetHeight;
  t.style.left = Math.min(x + 16, window.innerWidth - w - 8) + 'px';
  t.style.top = Math.min(y + 16, window.innerHeight - h - 8) + 'px';
}
export function hideTooltip() {
  $('tooltip').style.display = 'none';
}

/* ---------------- 고블린 사장 말풍선 ---------------- */
let bubbleTimer = null;
export function bossSay(msg, ms = 2800) {
  const b = $('boss-bubble');
  b.textContent = msg;
  b.classList.add('show');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => b.classList.remove('show'), ms);
}
// 매 프레임 사장 머리 위로 말풍선 위치 맞추기
export function placeBossBubble(pos) {
  const b = $('boss-bubble');
  if (!pos || !pos.visible) {
    b.style.display = 'none';
    return;
  }
  b.style.display = 'block';
  b.style.left = pos.x + 'px';
  b.style.top = pos.y + 'px';
}
