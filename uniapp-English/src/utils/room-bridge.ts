import { usePlayerStore } from "../stores/player";

/** Resolve lazily so H5 on a phone uses the host's LAN address. */
export function resolveRoomBase(): string {
  // #ifdef APP-PLUS
  return "/hybrid/html/room/index.html";
  // #endif
  // #ifndef APP-PLUS
  const configured = String(import.meta.env.VITE_ROOM_URL || "");
  if (configured) return configured;
  try {
    const { protocol, hostname } = window.location;
    if (hostname && hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${protocol}//${hostname}:8899/`;
    }
  } catch { /* Native builds resolve the bundled entry above. */ }
  return "http://127.0.0.1:8899/";
  // #endif
}

export const ROOM_URL = resolveRoomBase();

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
  const [base] = resolveRoomBase().split("#");
  const join = base.includes("?") ? "&" : "?";
  return `${base}${join}host=1&storageKey=${storageKey}&pending=${pendingParam}`;
}

export function roomRuntimeTip() {
  const pending = usePlayerStore().pendingCount;
  // #ifdef APP-PLUS
  return pending
    ? `杏橘狐小屋已打包（v2.42.0）。本次将尝试入账 ${pending} 条闯关奖励。`
    : "杏橘狐学习小屋（v2.42.0）。在房内商店兑换家具 / 扩建 / 装修码。";
  // #endif
  // #ifndef APP-PLUS
  return pending
    ? `H5：${resolveRoomBase()}，待入账 ${pending} 条。请先启动仓鼠屋数据库服务（8899）`
    : `H5 联调 v2.42.0：${resolveRoomBase()}`;
  // #endif
}

/** Only the room uses this handoff. Learning tokens never enter an iframe URL. */
export async function buildAuthenticatedRoomUrl(): Promise<string> {
  const token = uni.getStorageSync("wq_token") as string;
  if (!token) throw new Error("请先登录学习账号，再进入仓鼠屋");
  const configured = (import.meta.env.VITE_ROOM_API_BASE as string | undefined) || "";
  const detected = /^https?:\/\/[^/]+/.exec(resolveRoomBase())?.[0];
  const roomApi = (configured || detected || "http://127.0.0.1:8899").replace(/\/$/, "");
  if (!/^https?:\/\/[^?#@]+$/.test(roomApi)) throw new Error("仓鼠屋服务器地址未正确配置");
  const ticket = await new Promise<string>((resolve, reject) => {
    uni.request({
      url: roomApi + "/api/v1/room-access/ticket",
      method: "POST", timeout: 10000, data: {},
      header: {"Content-Type":"application/json", Authorization:`Bearer ${token}`},
      success(response) {
        const body = response.data as {ticket?:string;message?:string};
        if (response.statusCode === 200 && /^[a-f0-9]{64}$/.test(body.ticket || "")) resolve(body.ticket!);
        else reject(new Error(body.message || "暂时无法核验小屋身份，请稍后再试"));
      },
      fail() { reject(new Error("无法连接仓鼠屋服务器，请检查网络后重试")); },
    });
  });
  const [url] = buildRoomUrl().split("#");
  return url + "&roomApi=" + encodeURIComponent(roomApi) + "#roomTicket=" + ticket;
}

/** Only the room page owns this lock; unlock restores the app's packaged default. */
export function createNativeRoomOrientation(getScreen = () => (globalThis as unknown as {
  plus?: { screen?: { lockOrientation(value: string): void; unlockOrientation(): void } };
}).plus?.screen) {
  let locked = false;
  function set(orientation: "portrait" | "landscape") {
    const screen = getScreen();
    if (!screen) return false;
    try {
      screen.lockOrientation(orientation);
      locked = true;
      return true;
    } catch { return false; }
  }
  return {
    set,
    leave() {
      if (!locked) return;
      locked = false;
      try { getScreen()?.unlockOrientation(); } catch { /* The room can still close. */ }
    },
  };
}
