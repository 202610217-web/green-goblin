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
  // 층 해금 비용 [지하1층, 지하2층, 지하3층] (지하1층은 처음부터 열림)
  FLOOR_UNLOCK_COST: [0, 1000, 3000],
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

  // ---- 청결 (2-2) ----
  DIRT_PER_SECOND_STAY: 2.2,  // 손님이 묵는 동안 초당 더러워지는 정도 (1박 ≈ +33)
  DIRT_PER_SECOND_IDLE: 0.08, // 빈 방도 아주 천천히 먼지가 쌓인다
  DIRT_SAT_PENALTY: 0.4,      // 더러움 1당 목표 만족도 감소 (더러움 100 → -40)
  DIRT_VISIBLE_FROM: 12,      // 이 이상 더러우면 바닥에 얼룩이 보인다
  CLEAN_SPEED: 30,            // 청소 고블린이 초당 치우는 양
  CLEAN_START_DIRT: 15,       // 이 이상 더러운 방부터 청소하러 간다

  // ---- 직원 (2-2) ----
  STAFF_MAX_PER_TYPE: 4,      // 종류별 최대 고용 인원
  STAFF_WALK_SPEED: 3,        // 직원 걷는 속도
  COOK_BONUS_PER_GUEST: 10,   // 요리 고블린 1명당 식당 손님 1명 추가 수익
  COOKS_PER_RESTAURANT: 2,    // 식당 1개당 효과를 내는 요리사 최대 인원

  // ---- 용사 습격 (2-3) ----
  RAID_START_DAY: 3,          // 이 날부터 습격이 올 수 있다
  RAID_CHANCE_PER_DAY: 0.4,   // 하루가 시작될 때 습격이 올 확률
  RAID_WARNING_SECONDS: 15,   // 경고 후 용사가 도착하기까지(초)
  HERO_WALK_SPEED: 3.2,       // 용사 걷는 속도
  RAID_BASE_DEFENSE: 0.15,    // 아무 준비 없을 때 방어 성공 확률
  RAID_TRAP_BONUS: 0.2,       // '진짜 모드' 함정 1개당 방어 확률 +
  RAID_GUARD_BONUS: 0.15,     // 경비 고블린 1명당 방어 확률 +
  RAID_MAX_DEFENSE: 0.95,     // 방어 확률 최대치
  RAID_REWARD_BASE: 150,      // 방어 성공 보상 = 기본 + 날짜 × 일당
  RAID_REWARD_PER_DAY: 20,
  RAID_STEAL_RATIO: 0.25,     // 방어 실패 시 빼앗기는 골드 비율
  RAID_STEAL_MIN: 100,        // 방어 실패 시 최소 빼앗기는 골드
  REAL_MODE_SAT_PENALTY: 50,  // 진짜 모드 함정에 묵는 일반 손님의 목표 만족도 감소
  REPAIR_COST_RATIO: 0.5,     // 망가진 방 수리비 = 설치비 × 비율
};

/* ---------------- 층별 손님 등급 (2-1) ----------------
   아래층일수록 고급 손님: 돈을 더 많이 내지만 만족시키기 어렵다
   incomeMul: 숙박비 배수, tipMul: 팁 배수, satPenalty: 목표 만족도 감소 */
export const GUEST_TIERS = [
  { name: '일반', badge: '',   incomeMul: 1.0, tipMul: 1.0, satPenalty: 0,  scale: 1.0 },
  { name: '고급', badge: '💎', incomeMul: 1.7, tipMul: 1.8, satPenalty: 10, scale: 1.08 },
  { name: '귀족', badge: '👑', incomeMul: 2.6, tipMul: 2.6, satPenalty: 20, scale: 1.16 },
];

/* ---------------- 직원 종류 (2-2) ----------------
   hireCost: 고용할 때 한 번 내는 돈, salary: 하루마다 나가는 월급 */
export const STAFF_TYPES = {
  cleaner: { name: '청소 고블린', emoji: '🧹', hireCost: 80,  salary: 25, outfit: 0x2a6ad0, desc: '더러운 방을 찾아가 청소해요' },
  cook:    { name: '요리 고블린', emoji: '🍳', hireCost: 120, salary: 35, outfit: 0xf0f0f0, desc: '식당 손님당 수익 +10G' },
  guard:   { name: '경비 고블린', emoji: '🛡️', hireCost: 150, salary: 40, outfit: 0x5a5a6e, desc: '용사 습격 방어 확률 +15%' },
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
    trap: true,   // 용사 습격 때 '진짜 모드'로 바꿀 수 있는 함정
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
