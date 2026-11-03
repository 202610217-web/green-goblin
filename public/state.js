/* =================================================================
   state.js — 게임 진행 데이터(gameState)
   골드, 방, 별점, 날짜, 손님 등 '저장해야 할 모든 것'을 이 객체 하나에 담는다.
   - 3D 메쉬 같은 화면용 객체는 절대 여기 넣지 않는다 (JSON으로 저장 가능해야 함)
   - 나중에 DB 저장 시 JSON.stringify(gameState) 그대로 보내면 된다
   ================================================================= */
import { CONFIG } from './config.js';

// 처음 시작할 때의 상태를 새로 만들어 돌려준다
export function createInitialGameState() {
  return {
    version: 1,                               // 저장 형식 버전 (나중에 형식이 바뀌면 올린다)
    gold: CONFIG.START_GOLD,
    day: 1,
    dayTimer: 0,                              // 오늘 흐른 시간(초)
    stars: CONFIG.START_STARS,                // 호텔 별점 1~5
    ratings: [],                              // 최근 손님 만족도 기록
    unlockedFloors: CONFIG.START_UNLOCKED_FLOORS,
    // rooms[층][칸] = null(빈칸) 또는 { type: 'slime' }
    rooms: Array.from({ length: CONFIG.FLOORS }, () => Array(CONFIG.COLS).fill(null)),
    // 현재 호텔에 있는 손님들 (위치/경로도 순수 숫자로만 보관)
    guests: [],
    nextGuestId: 1,
    spawnTimer: CONFIG.FIRST_GUEST_DELAY,     // 다음 손님이 오기까지 남은 시간
    stats: {                                  // 통계 (나중에 결과 화면 등에 활용)
      totalGuests: 0,
      angryGuests: 0,
      totalEarned: 0,
    },
  };
}

// 게임 전체에서 함께 쓰는 단 하나의 상태 객체
export const gameState = createInitialGameState();

// 불러온 데이터 등으로 상태를 통째로 교체 (객체 참조는 그대로 유지)
export function replaceGameState(newState) {
  for (const key of Object.keys(gameState)) delete gameState[key];
  Object.assign(gameState, newState);
}
