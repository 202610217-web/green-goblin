/* =================================================================
   ui.js — 3D 화면 위에 겹쳐 보이는 HTML UI 담당
   (상태바, 건설 메뉴, 손님 목록, 알림, 확인 창, 말풍선, 안내 툴팁)
   게임 규칙은 모르고, game.js가 시키는 대로 그리기만 한다.
   ================================================================= */
import { CONFIG, ROOM_TYPES, GUEST_TYPES, GUEST_TIERS, STAFF_TYPES } from './config.js';

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
   handlers = { onSelectRoom(key), onTogglePause(), onChangeSpeed(),
                onHire(role), onFire(role), onAllTrapsReal() }
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
  // 아래 메뉴 탭 전환 (건설 / 직원 고용)
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      $('tab-build').hidden = btn.dataset.tab !== 'build';
      $('tab-hire').hidden = btn.dataset.tab !== 'hire';
    });
  });
  // 고용/해고 버튼 (카드가 다시 그려져도 동작하도록 부모에서 한 번에 처리)
  $('hire-cards').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-role]');
    if (!btn || btn.disabled) return;
    if (btn.dataset.action === 'hire') handlers.onHire(btn.dataset.role);
    else handlers.onFire(btn.dataset.role);
  });
  $('raid-banner').addEventListener('click', (e) => {
    if (e.target.closest('#all-traps-btn')) handlers.onAllTrapsReal();
  });
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
    const tier = GUEST_TIERS[g.tier || 0];
    const tierLabel = tier.badge ? `${tier.badge}${tier.name} ` : '';
    return `<div class="g-row" style="border-left-color:${color}">
        <div class="g-top">
          <span class="g-name">${gt.emoji} ${tierLabel}${gt.name} ${g.name}</span>
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
/* 버튼 여러 개짜리 창
   buttons = [{ label, style: 'danger'|'ok'|'warn'|'normal', onClick, disabled }]
   어떤 버튼이든 누르면 창이 닫히고 onClick이 실행된다 */
export function showModal(text, buttons) {
  $('modal-text').textContent = text;
  const row = $('modal-buttons');
  row.innerHTML = '';
  for (const b of buttons) {
    const el = document.createElement('button');
    el.textContent = b.label;
    el.className = b.style || 'normal';
    el.disabled = !!b.disabled;
    el.addEventListener('click', () => {
      closeModal();
      if (b.onClick) b.onClick();
    });
    row.appendChild(el);
  }
  $('modal-bg').classList.add('show');
}
// 예/아니오 확인 창
export function confirmModal(text, onOk, okLabel = '확인', okStyle = 'danger') {
  showModal(text, [
    { label: '취소', style: 'normal' },
    { label: okLabel, style: okStyle, onClick: onOk },
  ]);
}
export function closeModal() {
  $('modal-bg').classList.remove('show');
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
  // 말풍선이 화면 밖으로 나가지 않게 좌우 위치를 제한
  const half = b.offsetWidth / 2;
  b.style.left = Math.max(half + 8, Math.min(window.innerWidth - half - 8, pos.x)) + 'px';
  b.style.top = pos.y + 'px';
}

/* =================================================================
   2-2. 직원 고용 메뉴
   ================================================================= */
export function renderHirePanel(state) {
  const counts = {};
  for (const m of state.staff) if (!m.leaving) counts[m.role] = (counts[m.role] || 0) + 1;
  let totalSalary = 0;
  const html = Object.entries(STAFF_TYPES).map(([role, st]) => {
    const n = counts[role] || 0;
    totalSalary += n * st.salary;
    const full = n >= CONFIG.STAFF_MAX_PER_TYPE;
    const poor = state.gold < st.hireCost;
    return `<div class="hire-card">
        <div class="hire-top">
          <span class="h-emoji">${st.emoji}</span>
          <span class="h-name">${st.name}</span>
          <span class="h-count">${n}/${CONFIG.STAFF_MAX_PER_TYPE}명</span>
        </div>
        <div class="h-desc">${st.desc}</div>
        <div class="h-pay">고용비 ${st.hireCost}G · 월급 ${st.salary}G/일</div>
        <div class="hire-actions">
          <button class="hire" data-role="${role}" data-action="hire" ${full || poor ? 'disabled' : ''}
            title="${full ? '최대 인원이에요' : poor ? '골드가 부족해요' : '고용하기'}">＋ 고용</button>
          <button class="fire" data-role="${role}" data-action="fire" ${n === 0 ? 'disabled' : ''} title="한 명 내보내기">해고</button>
        </div>
      </div>`;
  }).join('');
  // 내용이 바뀌었을 때만 다시 그린다 (누르는 도중에 버튼이 바뀌어 클릭이 씹히지 않게)
  const cards = $('hire-cards');
  if (cards.dataset.html !== html) {
    cards.innerHTML = html;
    cards.dataset.html = html;
  }
  $('hire-summary').textContent = `하루 월급 합계: ${totalSalary}골드 (하루가 지날 때 지급 · 못 받은 직원은 떠나요)`;
}

/* =================================================================
   2-3. 용사 습격 경고
   ================================================================= */
// info = null(숨김) 또는 { phase, timeLeft, chance, traps, realTraps, guards }
export function updateRaidBanner(info) {
  const banner = $('raid-banner');
  const flash = $('raid-flash');
  document.body.classList.toggle('raid-active', !!info);   // 알림이 경고 띠와 겹치지 않게
  if (!info) {
    banner.classList.remove('show');
    flash.classList.remove('on');
    return;
  }
  banner.classList.add('show');
  flash.classList.toggle('on', info.phase === 'warning');
  const pct = Math.round(info.chance * 100);
  const chance = `<span class="r-chance">방어 성공 확률 ${pct}%</span>`;
  const help = `함정(진짜 모드) ${info.realTraps}/${info.traps}개 · 경비 ${info.guards}명`;
  let html;
  if (info.phase === 'warning') {
    html = `<span class="r-icon">⚔️</span>
      <span class="r-text"><b>용사 습격 경고! ${Math.ceil(info.timeLeft)}초 후 도착!</b><br>${chance} · ${help}</span>`;
    if (info.traps > info.realTraps) html += '<button id="all-traps-btn">🪨 함정 전부 진짜 모드</button>';
  } else if (info.phase === 'attack' || info.phase === 'fight') {
    html = `<span class="r-icon">🗡️</span>
      <span class="r-text"><b>용사가 쳐들어왔다!</b><br>${chance} · ${help}</span>`;
  } else {
    html = `<span class="r-icon">${info.success ? '🎉' : '💸'}</span>
      <span class="r-text"><b>${info.success ? '방어 성공! 용사가 도망간다!' : '방어 실패… 용사가 보물을 들고 간다!'}</b><br>
      함정 모드를 끄는 것도 잊지 마세요 (손님이 싫어해요)</span>`;
  }
  // 같은 내용이면 다시 그리지 않음 (버튼이 깜빡이지 않게)
  if (banner.dataset.html !== html) {
    banner.innerHTML = html;
    banner.dataset.html = html;
  }
}
