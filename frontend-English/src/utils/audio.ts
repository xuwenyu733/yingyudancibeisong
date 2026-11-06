import type { Word } from '../types/api'

export function playWordAudio(word: Word) {
  const url =
    word.audioUrl ||
    `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word.spelling)}&type=2`
  const audio = new Audio(url)
  void audio.play().catch(() => {
    if ('speechSynthesis' in window) {
      const utter = new SpeechSynthesisUtterance(word.spelling)
      utter.lang = 'en-US'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utter)
    }
  })
}
