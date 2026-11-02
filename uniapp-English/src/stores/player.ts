import { computed, ref } from "vue";
import { defineStore } from "pinia";
import {
  buyShopItem,
  equipInventoryItem,
  fetchInventory,
  fetchShop,
  fetchWallet,
} from "../api";
import type { ShopGoods } from "../types/api";
import { errorMessage } from "../utils/format";

const MIRROR_KEY = "word-quest-player-mirror-v1";
const PENDING_KEY = "word-quest-room-pending-v1";

interface PendingLearning {
  eventId: string;
  learned: number;
  reviewed: number;
  checkIn?: boolean;
  estimatedPoints: number;
  createdAt: number;
}

function readPending(): PendingLearning[] {
  try {
    const raw = uni.getStorageSync(PENDING_KEY);
    if (!raw) return [];
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(data?.events) ? data.events : [];
  } catch {
    return [];
  }
}

function writePending(events: PendingLearning[]) {
  uni.setStorageSync(
    PENDING_KEY,
    JSON.stringify({ events, updatedAt: Date.now() }),
  );
}

/**
 * 服务端钱包为真相；本地 mirror 方便展示。
 * pending 仍给学习小屋 creditLearning 用（同 eventId 幂等）。
 */
export const usePlayerStore = defineStore("player", () => {
  const points = ref(0);
  const lastEarned = ref(0);
  const inventory = ref<ShopGoods[]>([]);
  const shopItems = ref<ShopGoods[]>([]);
  const pendingCount = computed(() => readPending().length);
  const ownedItems = computed(() => inventory.value);
  const equippedOutfitId = computed(
    () =>
      inventory.value.find((item) => item.category === "outfit" && item.equipped)
        ?.id || "",
  );

  function hydrate() {
    try {
      const raw = uni.getStorageSync(MIRROR_KEY);
      if (!raw) return;
      const data = typeof raw === "string" ? JSON.parse(raw) : raw;
      points.value = Number(data.points) || 0;
      lastEarned.value = Number(data.lastEarned) || 0;
    } catch {
      /* ignore */
    }
  }

  function persistMirror() {
    uni.setStorageSync(
      MIRROR_KEY,
      JSON.stringify({
        points: points.value,
        lastEarned: lastEarned.value,
      }),
    );
  }

  function setBalance(balance: number, earned = 0) {
    points.value = Math.max(0, Math.floor(balance));
    if (earned > 0) lastEarned.value = earned;
    persistMirror();
  }

  /** 闯关 API 已发币后：同步余额 + 给房间排队同 eventId */
  function applySessionReward(payload: {
    earnedPoints: number;
    balance: number;
    eventId?: string;
    learned?: number;
    reviewed?: number;
  }) {
    const earned = Math.max(0, Math.floor(payload.earnedPoints || 0));
    setBalance(payload.balance ?? points.value + earned, earned);
    if (earned <= 0 || !payload.eventId) return earned;

    const events = readPending();
    if (!events.some((item) => item.eventId === payload.eventId)) {
      events.push({
        eventId: payload.eventId,
        learned: payload.learned || 0,
        reviewed: payload.reviewed || 0,
        estimatedPoints: earned,
        createdAt: Date.now(),
      });
      writePending(events.slice(-50));
    }
    return earned;
  }

  async function refreshWallet() {
    const wallet = await fetchWallet();
    setBalance(wallet.balance);
    return wallet;
  }

  async function refreshShop() {
    const result = await fetchShop();
    shopItems.value = result.items;
    setBalance(result.balance);
    return result;
  }

  async function refreshInventory() {
    const result = await fetchInventory();
    inventory.value = result.items;
    setBalance(result.balance);
    return result;
  }

  function owns(itemId: string) {
    return inventory.value.some((item) => item.id === itemId);
  }

  async function redeem(item: { id: string; name: string; price: number }) {
    try {
      const result = await buyShopItem(item.id);
      setBalance(result.balance);
      await refreshInventory();
      await refreshShop();
      if (result.alreadyOwned) {
        return { ok: true, message: "已经拥有啦" };
      }
      return {
        ok: true,
        message: item.price > 0 ? `兑换成功 · 剩余 ${result.balance}` : "已装备",
      };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }

  async function equipOutfit(itemId: string) {
    try {
      const result = await equipInventoryItem(itemId);
      inventory.value = result.items;
      setBalance(result.balance);
      return { ok: true, message: "穿戴成功" };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }

  async function applyOwnedDecor(itemId: string) {
    try {
      const result = await equipInventoryItem(itemId);
      inventory.value = result.items;
      setBalance(result.balance);
      return { ok: true, message: "已标记应用到房间" };
    } catch (error) {
      return { ok: false, message: errorMessage(error) };
    }
  }

  function clearPending() {
    writePending([]);
  }

  return {
    points,
    lastEarned,
    inventory,
    shopItems,
    ownedItems,
    equippedOutfitId,
    pendingCount,
    hydrate,
    setBalance,
    applySessionReward,
    refreshWallet,
    refreshShop,
    refreshInventory,
    owns,
    redeem,
    equipOutfit,
    applyOwnedDecor,
    readPending,
    clearPending,
  };
});
