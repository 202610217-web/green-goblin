/* =================================================================
   config.js — 게임 설정값 모음
   가격, 수익, 시간, 크기 같은 숫자는 전부 여기서 조정한다.
   (다른 파일에서는 숫자를 직접 쓰지 않고 여기 값을 가져다 쓴다)
   ================================================================= */

// ---------------- 기본 규칙 ----------------
export const CONFIG = {
  START_GOLD: 500,            // 시작 골드
  COLS: 4,                    // 층당 방 칸 수 (가로)
  FLOORS: 3,                  // 전체 층 수 (세로)
  START_UNLOCKED_FLOORS: 1,   // 처음에 열려 있는 층 수
  DEMOLISH_REFUND: 0.5,       // 철거 시 환불 비율 (0.5 = 절반)

  // ---- 시간 ----
  DAY_SECONDS: 45,            // 하루 길이(초)
  STAY_SECONDS: 15,           // 손님이 방에 머무는 시간(초) = 1박
  GUEST_WALK_SPEED: 4,        // 손님 걷는 속도(초당 칸 단위 거리)
  FIRST_GUEST_DELAY: 3,       // 첫 방을 지은 뒤 첫 손님이 오기까지(초)

  // ---- 손님 방문 빈도 ----
  // 별점별 손님 방문 간격(초). 별점이 높을수록 자주 온다.
  SPAWN_INTERVAL_BY_STAR: { 1: 13, 2: 10, 3: 7.5, 4: 5.5, 5: 4 },
  SPAWN_RANDOMNESS: 0.25,     // 방문 간격에 ±25% 랜덤

  // ---- 만족도 ----
  BASE_SATISFACTION: 50,      // 방에 들어갈 때 기본 만족도
  SATISFACTION_SPEED: 8,      // 만족도가 목표치를 향해 변하는 속도(초당)
  RESTAURANT_SAT_BONUS: 6,    // 식당이 하나라도 있으면 목표 만족도 보너스
  ANGRY_LEAVE_SATISFACTION: 0,// 빈 방이 없어 돌아간 손님이 남기는 만족도
  MOOD_HAPPY: 70,             // 이 이상이면 😊
  MOOD_NEUTRAL: 40,           // 이 이상이면 😐, 미만이면 😠

  // ---- 돈 ----
  // 만족도가 TIP_START 이상이면 팁을 준다.
  // 만족도 100일 때 1박 수익의 TIP_MAX_RATIO 만큼 팁.
  TIP_START: 60,
  TIP_MAX_RATIO: 0.6,
  UNHAPPY_PAY_RATIO: 0.5,     // 😠 상태로 체크아웃하면 숙박비를 이 비율만큼만 낸다

  // ---- 별점 ----
  RATING_SAMPLE: 10,          // 최근 손님 N명의 평균 만족도로 별점 계산
  START_STARS: 3,             // 아직 평가가 없을 때 별점
  // 평가가 적을 때 별점이 확 튀지 않도록, 모자란 인원의 절반만큼 '기본 별점 손님'이 있다고 친다
  RATING_PRIOR_RATIO: 0.5,
};

// ---------------- 3D 배치 크기 ----------------
export const LAYOUT = {
  CELL_W: 4,      // 방 한 칸 가로
  CELL_H: 3,      // 한 층 높이
  CELL_D: 4,      // 방 깊이(앞뒤)
  SHAFT_W: 3,     // 왼쪽 입구/사다리 통로 너비
  SLAB: 0.3,      // 바닥 두께
};

// ---------------- 그래픽 ----------------
export const GRAPHICS = {
  MAX_PIXEL_RATIO: 1.75,      // 고해상도 화면에서 너무 무겁지 않도록 제한
  TORCH_INTENSITY: 14,        // 횃불 조명 밝기
  TORCH_DISTANCE: 11,         // 횃불 조명이 닿는 거리
  BACKGROUND: 0x120a1e,       // 배경색 (어두운 보라)
  CAMERA_MIN_DIST: 12,        // 휠 확대 한계
  CAMERA_MAX_DIST: 48,        // 휠 축소 한계
};

/* ---------------- 방 종류 ----------------
   cost: 설치 비용, income: 1박 수익
   comfort: 편안함, thrill: 스릴
   lodging: true면 손님이 묵는 방, false면 시설(식당)
   perGuest: 체크아웃하는 손님 1명당 추가 수익(식당)
   color: UI와 방 벽 장식 색 */
export const ROOM_TYPES = {
  slime: {
    name: '슬라임 물침대방', emoji: '🛏️', color: '#3fbf6a',
    cost: 100, income: 20, comfort: 2, thrill: 0, lodging: true,
  },
  sauna: {
    name: '용암 사우나', emoji: '🌋', color: '#ff7a2a',
    cost: 200, income: 40, comfort: 1, thrill: 1, lodging: true,
  },
  suite: {
    name: '해골 장식 스위트룸', emoji: '💀', color: '#b48cff',
    cost: 500, income: 100, comfort: 4, thrill: 0, lodging: true,
  },
  boulder: {
    name: '굴러오는 바위 어트랙션', emoji: '🪨', color: '#a8a39a',
    cost: 300, income: 30, comfort: 0, thrill: 3, lodging: true,
  },
  restaurant: {
    name: '고블린 식당', emoji: '🍲', color: '#d9b04a',
    cost: 250, income: 0, comfort: 0, thrill: 0, lodging: false, perGuest: 15,
  },
};

/* ---------------- 손님 종류 ----------------
   comfortWeight / thrillWeight: 방의 편안함/스릴 1점당 목표 만족도 변화량
   (음수면 싫어함)
   color: 3D 몸통 색 */
export const GUEST_TYPES = {
  warrior: { name: '전사',   emoji: '⚔️', color: 0xc8352e, comfortWeight: 2,  thrillWeight: 12, likes: '스릴' },
  wizard:  { name: '마법사', emoji: '🧙', color: 0x3a63d8, comfortWeight: 12, thrillWeight: -4, likes: '편안함' },
  rogue:   { name: '도적',   emoji: '🗡️', color: 0x7a7a84, comfortWeight: 7,  thrillWeight: 7,  likes: '무난' },
};

// 손님 종류가 나올 확률(가중치)
export const GUEST_SPAWN_WEIGHTS = { warrior: 1, wizard: 1, rogue: 1 };

// 손님 이름 (재미용)
export const GUEST_NAMES = [
  '아론', '베라', '카일', '도나', '에릭', '피오나', '가렌', '하나', '이반', '줄리',
  '켄', '루나', '마크', '니나', '오웬', '퍼시', '로이', '시라', '토르', '유나',
];
