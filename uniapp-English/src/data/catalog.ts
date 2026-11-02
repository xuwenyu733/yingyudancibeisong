export type ShopCategory = "furniture" | "decor" | "outfit";

export interface ShopItem {
  id: string;
  name: string;
  category: ShopCategory;
  price: number;
  desc: string;
  /** 兑换后发给 3D 房间的指令 payload */
  roomAction:
    | { type: "furniture-transform"; furnitureId: string; position: number[]; rotation?: number[]; scale?: number }
    | { type: "outfit"; outfitId: string; tint?: string }
    | { type: "decor-flag"; flag: string; enabled: boolean };
}

/** 演示商品：积分兑换后写入背包，进入房间时再应用到场景 */
export const CATALOG: ShopItem[] = [
  {
    id: "sofa-left",
    name: "沙发靠左摆",
    category: "furniture",
    price: 120,
    desc: "把沙发挪到靠窗一侧",
    roomAction: {
      type: "furniture-transform",
      furnitureId: "sofa",
      position: [0.2, 0, -2.28],
      rotation: [0, -Math.PI / 2, 0],
      scale: 3.7,
    },
  },
  {
    id: "table-center",
    name: "矮桌居中",
    category: "furniture",
    price: 80,
    desc: "木质矮桌摆到房间中央",
    roomAction: {
      type: "furniture-transform",
      furnitureId: "table",
      position: [0.1, 0, 0.2],
      scale: 1.9,
    },
  },
  {
    id: "lamp-night",
    name: "暖光夜灯预设",
    category: "decor",
    price: 60,
    desc: "进入房间时自动打开暖光",
    roomAction: { type: "decor-flag", flag: "lampOn", enabled: true },
  },
  {
    id: "outfit-pink",
    name: "樱花粉滤镜",
    category: "outfit",
    price: 150,
    desc: "仓鼠身体偏粉（占位换装，后续可换真衣服模型）",
    roomAction: { type: "outfit", outfitId: "pink", tint: "#f3b6c8" },
  },
  {
    id: "outfit-mint",
    name: "薄荷绿滤镜",
    category: "outfit",
    price: 150,
    desc: "仓鼠身体偏青绿（占位换装）",
    roomAction: { type: "outfit", outfitId: "mint", tint: "#9fd6c2" },
  },
  {
    id: "outfit-default",
    name: "原色毛发",
    category: "outfit",
    price: 0,
    desc: "恢复默认配色",
    roomAction: { type: "outfit", outfitId: "default" },
  },
];

export const CATEGORY_LABEL: Record<ShopCategory, string> = {
  furniture: "家具摆放",
  decor: "房间装饰",
  outfit: "衣服/外观",
};
