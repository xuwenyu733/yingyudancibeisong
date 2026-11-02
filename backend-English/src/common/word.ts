import { Word } from '../domain/types';

export function wordAudioUrl(spelling: string): string {
  return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(spelling)}&type=2`;
}

export function toPublicWord(word: Word) {
  return {
    id: word.id,
    spelling: word.spelling,
    phonetic: word.phonetic,
    meaning: word.meaning,
    example: word.example,
    audioUrl: wordAudioUrl(word.spelling),
  };
}
