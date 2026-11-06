export interface AvatarOption {
  id: string;
  label: string;
  color: string;
  bg: string;
}

export const AVATAR_OPTIONS: AvatarOption[] = [
  { id: "mint", label: "薄荷绿", color: "#2eb086", bg: "#d9f3e8" },
  { id: "orange", label: "暖橙色", color: "#f59a3a", bg: "#ffe8cc" },
  { id: "sky", label: "天空蓝", color: "#3b82f6", bg: "#dbeafe" },
  { id: "violet", label: "葡萄紫", color: "#8b5cf6", bg: "#ede9fe" },
];

export function avatarLetter(name?: string) {
  return (name?.trim()?.[0] || "词").toUpperCase();
}

export function resolveAvatarOption() {
  const id = uni.getStorageSync("wq_avatar_id") || AVATAR_OPTIONS[0].id;
  return AVATAR_OPTIONS.find((item) => item.id === id) || AVATAR_OPTIONS[0];
}
