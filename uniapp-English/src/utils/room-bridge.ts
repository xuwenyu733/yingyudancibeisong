import { usePlayerStore } from "../stores/player";

/** App 打包进 www 的本地小屋入口（勿改成 file://，云打包会失效） */
const APP_ROOM_PATH = "/hybrid/html/room/index.html";

/**
 * App：加载 hybrid/html/room。
 * H5：优先 VITE_ROOM_URL；手机用局域网打开 H5 时改连同主机 8768。
 */
export function resolveRoomBase(): string {
  // #ifdef APP-PLUS
  return APP_ROOM_PATH;
  // #endif

  // #ifndef APP-PLUS
  const fromEnv = import.meta.env.VITE_ROOM_URL as string | undefined;
  if (fromEnv) return fromEnv.endsWith("/") || fromEnv.endsWith(".html") ? fromEnv : `${fromEnv}/`;

  try {
    const { protocol, hostname } = window.location;
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${protocol}//${hostname}:8768/`;
    }
  } catch {
    /* ignore */
  }
  return "http://127.0.0.1:8768/";
  // #endif
}

export const ROOM_URL = resolveRoomBase();

function appendQuery(base: string, query: string) {
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}${query}`;
}

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
  const base = resolveRoomBase();
  return appendQuery(
    base,
    `host=1&storageKey=${storageKey}&pending=${pendingParam}`,
  );
}

export function roomRuntimeTip() {
  const pending = usePlayerStore().pendingCount;
  const base = resolveRoomBase();
  // #ifdef APP-PLUS
  return pending
    ? `杏橘狐小屋已打包（v2.28.1）。本次将尝试入账 ${pending} 条闯关奖励。`
    : "杏橘狐学习小屋（v2.28.1）。在房内商店兑换家具 / 扩建 / 装修码。";
  // #endif
  // #ifndef APP-PLUS
  return pending
    ? `H5：${base}，待入账 ${pending} 条。请先在电脑启动：python serve.py --port 8768（需监听 0.0.0.0）`
    : `H5 联调 v2.28.1：${base}`;
  // #endif
}
