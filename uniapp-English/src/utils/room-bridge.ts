import { usePlayerStore } from "../stores/player";

/**
 * App：加载打包的 v2.8 学习小屋。
 * H5：默认连本机 original-pet-room 预览端口。
 */
// #ifdef APP-PLUS
export const ROOM_URL = "/hybrid/html/room/index.html";
// #endif

// #ifndef APP-PLUS
export const ROOM_URL =
  (import.meta.env.VITE_ROOM_URL as string | undefined) ||
  "http://127.0.0.1:8768/";
// #endif

export function buildRoomUrl() {
  const player = usePlayerStore();
  const pending = player.readPending().map((event) => ({
    eventId: event.eventId,
    learned: event.learned,
    reviewed: event.reviewed,
    checkIn: event.checkIn || false,
  }));
  const storageKey = encodeURIComponent("word-quest-room-account-v1");
  const pendingParam = encodeURIComponent(JSON.stringify(pending));
  const join = ROOM_URL.includes("?") ? "&" : "?";
  return `${ROOM_URL}${join}host=1&storageKey=${storageKey}&pending=${pendingParam}`;
}

export function roomRuntimeTip() {
  const pending = usePlayerStore().pendingCount;
  // #ifdef APP-PLUS
  return pending
    ? `杏橘狐小屋已打包。本次将尝试入账 ${pending} 条闯关奖励。`
    : "杏橘狐学习小屋（v2.8）。在房内商店兑换家具 / 扩建。";
  // #endif
  // #ifndef APP-PLUS
  return pending
    ? `H5：${ROOM_URL}，待入账 ${pending} 条。请先启动 v2.8.0 预览服务。`
    : `H5 联调：${ROOM_URL}`;
  // #endif
}
