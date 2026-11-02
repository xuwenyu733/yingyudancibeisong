/** 程序化音效（v2.7/batch1）：
 * 用 WebAudio 现场合成点击/签到/升级/勋章/购买/错误音效，无需外部音频素材。
 * Node 环境无 AudioContext 时全部静默 no-op，不崩溃（纯逻辑可测）。
 * 设计：只在首次用户交互后惰性创建 AudioContext，避免浏览器自动播放策略。
 */
const PRESETS = Object.freeze({
  click:    { wave: 'sine',      freqs: [880],        dur: 0.06, gain: 0.10 },
  checkin:  { wave: 'triangle',  freqs: [660, 880],   dur: 0.14, gain: 0.12 },
  levelup:  { wave: 'triangle',  freqs: [523, 659, 784, 1046], dur: 0.30, gain: 0.13 },
  badge:    { wave: 'sine',      freqs: [784, 1174],  dur: 0.22, gain: 0.12 },
  purchase: { wave: 'triangle',  freqs: [587, 880],   dur: 0.18, gain: 0.12 },
  error:    { wave: 'square',    freqs: [220, 196],   dur: 0.22, gain: 0.07 },
  water:    { wave: 'sine',      freqs: [1200, 900],  dur: 0.16, gain: 0.08 },
});

export function createSfx({ audioContext } = {}) {
  let ctx = audioContext || null;
  let muted = false;
  let disposed = false;
  // 允许宿主传入惰性工厂：真正需要发声时才创建。
  let ctxFactory = null;

  function ensureContext() {
    if (disposed) return null;
    if (ctx) {
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch { /* 忽略 */ } }
      return ctx;
    }
    if (ctxFactory) { try { ctx = ctxFactory(); } catch { return null; } }
    else if (typeof globalThis.AudioContext === 'function') { try { ctx = new globalThis.AudioContext(); } catch { return null; } }
    return ctx;
  }

  /** 播一个预设音效。name 为 PRESETS 键名；未知键静默。 */
  function play(name) {
    if (muted || disposed) return false;
    const preset = PRESETS[name];
    if (!preset) return false;
    const context = ensureContext();
    if (!context || typeof context.currentTime !== 'number') return false;
    try {
      const start = context.currentTime + 0.01;
      for (let index = 0; index < preset.freqs.length; index++) {
        const osc = context.createOscillator();
        const gain = context.createGain();
        osc.type = preset.wave;
        osc.frequency.setValueAtTime(preset.freqs[index], start + index * 0.055);
        const fade = preset.dur / Math.max(1, preset.freqs.length);
        gain.gain.setValueAtTime(0.0001, start + index * 0.055);
        gain.gain.exponentialRampToValueAtTime(preset.gain, start + index * 0.055 + fade * 0.6);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + index * 0.055 + preset.dur);
        osc.connect(gain).connect(context.destination);
        osc.start(start + index * 0.055);
        osc.stop(start + index * 0.055 + preset.dur + 0.02);
      }
      return true;
    } catch { return false; }
  }

  return {
    play,
    setMuted(value) { muted = !!value; return muted; },
    get muted() { return muted; },
    setContextFactory(factory) { ctxFactory = typeof factory === 'function' ? factory : null; },
    dispose() { disposed = true; if (ctx && typeof ctx.close === 'function') { try { ctx.close(); } catch { /* 忽略 */ } } ctx = null; },
  };
}

export const SFX_NAMES = Object.freeze(Object.keys(PRESETS));