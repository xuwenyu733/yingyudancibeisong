import {createShopFurniture as originalFurniture} from './scene-economy.js';
import {giftProduct} from './gift-catalog.mjs';
import {createGiftFurniture} from './gift-models.mjs';
export function createShopFurniture(sku,materials){return giftProduct(sku)?createGiftFurniture(sku,materials):originalFurniture(sku,materials);}
