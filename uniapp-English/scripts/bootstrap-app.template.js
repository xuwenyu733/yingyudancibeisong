import {startProtectedHouse} from './protected-entry.js';
import {notifyHost} from './host-credits.mjs';

// Native webviews need their own return control; the H5 host already has a bar.
function mountHostExit() {
  if (new URLSearchParams(location.search).get('host') !== '1' ||
      !window.plus || document.getElementById('wq-host-exit')) return;
  const button = document.createElement('button');
  button.id = 'wq-host-exit';
  button.className = 'wq-host-exit';
  button.type = 'button';
  button.textContent = '返回';
  button.addEventListener('click', () => {
    if (window.HamsterRoom?.returnToLearning) window.HamsterRoom.returnToLearning();
    else notifyHost('room-access-exit', {});
    try {
      if (window.uni?.switchTab) window.uni.switchTab({url: '/pages/pet/index'});
      else window.uni?.navigateBack?.({delta: 1});
    } catch { /* The host message can still close the room. */ }
  });
  document.body.appendChild(button);
}

mountHostExit();
document.addEventListener('plusready', mountHostExit, {once: true});
await startProtectedHouse({embedded:true});
