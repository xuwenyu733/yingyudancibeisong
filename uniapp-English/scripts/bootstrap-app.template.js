import {mountRoom} from './room.js';
import {createRoomView} from './view.js';
import {createRoomBridge} from './integration.mjs';
import {createShopPanel} from './shop-panel.js';
import {createProfilePanel} from './scene-profile.js';

/**
 * 单词 App 嵌入入口：
 * - 初始积分 0
 * - 商店关闭演示领奖
 * - 通过 URL ?pending= 接收闯关待入账事件，并 creditLearning（幂等）
 */
const view = createRoomView(document.getElementById('app'));
const params = new URLSearchParams(location.search);
const storageKey = params.get('storageKey') || 'word-quest-room-account-v1';

let bridge = null;
let shop = null;
let profile = null;

function readPendingFromUrl() {
  const raw = params.get('pending');
  if (!raw) return [];
  try {
    const data = JSON.parse(decodeURIComponent(raw));
    return Array.isArray(data) ? data : Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}

async function applyPendingCredits(api) {
  const events = readPendingFromUrl();
  if (!events.length) return {applied: 0, failed: 0, earnedHint: 0};
  let applied = 0;
  let failed = 0;
  let earnedHint = 0;
  for (const event of events) {
    if (!event?.eventId) continue;
    try {
      const learned = Number(event.learned) || 0;
      const reviewed = Number(event.reviewed) || 0;
      const result = api.creditLearning({
        eventId: String(event.eventId).slice(0, 128),
        learned,
        reviewed,
        checkIn: Boolean(event.checkIn),
      });
      if (result?.ok) {
        applied += 1;
        if (result.code !== 'ALREADY_CLAIMED' && result.code !== 'ALREADY_APPLIED') {
          earnedHint += learned * 10 + reviewed * 5;
        }
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  return {applied, failed, earnedHint};
}

function notifyHost(event, detail) {
  try {
    window.parent?.postMessage?.(
      {protocolVersion: 1, type: 'event', event, detail},
      '*',
    );
  } catch {
    /* ignore */
  }
  try {
    window.uni?.postMessage?.({data: {event, detail}});
  } catch {
    /* ignore */
  }
}

const controller = mountRoom({
  canvas: view.canvas,
  uiRoot: view.controlsRoot,
  quality: ['low', 'balanced', 'high'].includes(params.get('quality'))
    ? params.get('quality')
    : 'auto',
  storageKey,
  initialPoints: 0,
  onState: (state) => {
    view.updateState(state);
    shop?.update(state);
    profile?.update(state);
  },
  onEvent: (type, detail) => {
    if (type !== 'ready') bridge?.emit(type, detail);
  },
});

shop = createShopPanel({
  root: view.root,
  api: controller.api,
  pointsLabel: '学习积分',
  demo: false,
});
profile = createProfilePanel({
  root: view.root,
  api: controller.api,
  pointsLabel: '学习积分',
});
bridge = createRoomBridge({
  api: controller.api,
  getState: controller.api.getState,
  eventTarget: view.canvas,
  globalObject: window,
  legacyName: 'PetRoom',
  roomId: 'word-quest-room',
});

if (!Object.hasOwn(window, 'HamsterRoom')) {
  window.HamsterRoom = controller.api;
}

controller.ready
  .then(async (api) => {
    view.ready();
    await bridge.ready();
    const summary = await applyPendingCredits(api);
    try {
      shop?.update(api.getShop?.() || api.getState?.());
    } catch {
      /* ignore */
    }
    notifyHost('host-credits-applied', summary);
  })
  .catch((error) => {
    if (error.code !== 'ABORTED') view.error(error);
  });

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  shop?.dispose();
  profile?.dispose();
  bridge?.dispose();
  controller.dispose();
  view.dispose();
});
