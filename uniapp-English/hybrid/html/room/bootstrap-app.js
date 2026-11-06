import { mountPetEstate } from './estate-house.js';

/**
 * 单词 App 嵌入入口（v2.28.1 完整版）：
 * - 完整版多房间庄园（mountPetEstate），纯本地存储，不依赖后端
 * - 初始积分 0，学习积分制（demo:false），商店/档案/伙伴/创意面板全套 UI
 * - 通过 URL ?pending= 接收闯关待入账事件，并 creditLearning（幂等）
 * - 入账完成后通过 postMessage 通知宿主（host-credits-applied）
 */
const params = new URLSearchParams(location.search);
const storageKey = params.get('storageKey') || 'word-quest-room-account-v1';
const app = document.getElementById('app');
const isHostEmbed = params.get('host') === '1';

/** 仅 App 原生子 webview 需要房内返回；浏览器 iframe 已有宿主顶栏，勿再叠一层 */
function mountHostExit() {
  if (!isHostEmbed || document.getElementById('wq-host-exit')) return;
  const isAppWebview = typeof plus !== 'undefined';
  if (!isAppWebview) return;
  const btn = document.createElement('button');
  btn.id = 'wq-host-exit';
  btn.type = 'button';
  btn.className = 'wq-host-exit';
  btn.textContent = '返回';
  btn.addEventListener('click', () => {
    notifyHost('host-exit', {});
    try {
      window.uni?.switchTab?.({ url: '/pages/pet/index' });
    } catch {
      /* ignore */
    }
    try {
      window.uni?.navigateBack?.({ delta: 1 });
    } catch {
      /* ignore */
    }
  });
  document.body.appendChild(btn);
}

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
  if (!events.length) return { applied: 0, failed: 0, earnedHint: 0 };
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
  return { applied, failed, earnedHint };
}

function notifyHost(event, detail) {
  try {
    window.parent?.postMessage?.(
      { protocolVersion: 1, type: 'event', event, detail },
      '*',
    );
  } catch {
    /* ignore */
  }
  try {
    window.uni?.postMessage?.({ data: { event, detail } });
  } catch {
    /* ignore */
  }
}

let room = null;

function disposeRoom() {
  room?.dispose();
  room = null;
}

room = mountPetEstate({
  container: app,
  storageKey,
  quality: ['low', 'balanced', 'high'].includes(params.get('quality'))
    ? params.get('quality')
    : 'auto',
  initialPoints: 0,
  pointsLabel: '学习积分',
  demo: false,
  bridge: { legacyName: 'PetRoom', roomId: 'word-quest-room' },
});

if (!Object.hasOwn(window, 'HamsterRoom')) {
  window.HamsterRoom = room.api;
}

mountHostExit();

room.ready
  .then(async (api) => {
    const summary = await applyPendingCredits(api);
    notifyHost('host-credits-applied', summary);
  })
  .catch((error) => {
    if (error.code !== 'ABORTED') console.error(error);
  });

window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  disposeRoom();
});
