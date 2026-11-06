export interface WrongDetail {
  wordId: string;
  spelling: string;
  meaning: string;
  mode: string;
  userAnswer: string;
}

const KEY = "wq_last_session_wrongs";

export function saveWrongDetails(items: WrongDetail[]) {
  uni.setStorageSync(KEY, JSON.stringify(items));
}

export function loadWrongDetails(): WrongDetail[] {
  try {
    const raw = uni.getStorageSync(KEY);
    if (!raw) return [];
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function clearWrongDetails() {
  uni.removeStorageSync(KEY);
}
