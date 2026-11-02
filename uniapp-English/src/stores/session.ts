import { defineStore } from "pinia";
import { ref } from "vue";

export const useSessionStore = defineStore("session", () => {
  const token = ref("");

  function hydrate() {
    token.value = (uni.getStorageSync("wq_token") as string) || "";
  }

  function setToken(value: string) {
    token.value = value;
    uni.setStorageSync("wq_token", value);
  }

  function logout() {
    token.value = "";
    uni.removeStorageSync("wq_token");
    uni.reLaunch({ url: "/pages/auth/login" });
  }

  return { token, hydrate, setToken, logout };
});
