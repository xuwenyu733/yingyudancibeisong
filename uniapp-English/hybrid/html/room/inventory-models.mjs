import {createShopFurniture as originalFurniture} from './scene-economy.js';
import {itemBaseSku,itemCopyNumber} from './inventory-key.mjs';
import {giftProduct} from './gift-catalog.mjs';
import {createGiftFurniture} from './gift-models.mjs';
export function createShopFurniture(sku,materials){return giftProduct(sku)?createGiftFurniture(sku,materials):copyFurniture(sku,materials);}

function copyFurniture(sku,materials){const item=originalFurniture(itemBaseSku(sku),materials);item.root.userData.furnitureId='shop-'+sku;item.root.userData.sku=sku;item.root.userData.shopSku=sku;item.root.name='shop-'+sku;if(itemBaseSku(sku)!==sku)item.definition.label+=' · 第'+itemCopyNumber(sku)+'件';return item;}
