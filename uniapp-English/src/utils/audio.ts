import type { Word } from "../types/api";

let player: UniApp.InnerAudioContext | null = null;

export function playWordAudio(word: Word) {
  const url =
    word.audioUrl ||
    `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word.spelling)}&type=2`;

  if (player) {
    player.stop();
    player.destroy();
  }

  player = uni.createInnerAudioContext();
  player.src = url;
  player.autoplay = true;
  player.onError(() => {
    uni.showToast({ title: "暂时无法播放发音", icon: "none" });
  });
}

export function stopWordAudio() {
  if (!player) return;
  player.stop();
  player.destroy();
  player = null;
}
