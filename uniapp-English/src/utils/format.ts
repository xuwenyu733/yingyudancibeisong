export function yuan(cents: number) {
  const value = cents / 100;
  return Number.isInteger(value) ? `¥${value}` : `¥${value.toFixed(2)}`;
}

export function gradeLabel(grade: number) {
  const labels = ["", "一年级", "二年级", "三年级", "四年级", "五年级", "六年级"];
  return labels[grade] || `${grade}年级`;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "请求失败";
}
