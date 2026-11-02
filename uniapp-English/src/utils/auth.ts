export function ensureLogin() {
  if (!uni.getStorageSync("wq_token")) {
    uni.reLaunch({ url: "/pages/auth/login" });
    return false;
  }
  return true;
}
