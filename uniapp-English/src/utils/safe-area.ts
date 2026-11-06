import { ref } from "vue";

/** 状态栏 / 刘海顶部避让高度（px） */
export const statusBarPx = ref(0);

export function hydrateSafeArea() {
  try {
    const info = uni.getSystemInfoSync();
    const status = Number(info.statusBarHeight || 0);
    const inset =
      Number(info.safeAreaInsets?.top || 0) ||
      (info.safeArea?.top != null ? Number(info.safeArea.top) : 0);
    statusBarPx.value = Math.max(status, inset, 0);
  } catch {
    statusBarPx.value = 0;
  }
  return statusBarPx.value;
}

export function pagePadStyle() {
  const top = Math.max(statusBarPx.value, 0);
  return {
    paddingTop: `${top + 12}px`,
  };
}

/** 自定义顶栏：状态栏 + 内容条高度 */
export function chromePadStyle(barContentPx = 44) {
  const top = Math.max(statusBarPx.value, 0);
  return {
    paddingTop: `${top}px`,
    minHeight: `${top + barContentPx}px`,
  };
}
