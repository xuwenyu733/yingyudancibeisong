/** 家具栏真实缩略图（v2.17/F1）：优先使用 assets/products/previews/<sku>.png，
 * 找不到预览图时回退为按名称分类的 Emoji。纯函数，Node 可测。
 */
import { PRODUCT_PREVIEW_INFO } from './product-previews.mjs';
import {giftProduct} from './gift-catalog.mjs';

function emojiFallback(name = '') {
  if (name.includes('沙发')) return '🛋';
  if (name.includes('桌') || name.includes('柜')) return '🗄';
  if (name.includes('灯')) return '💡';
  if (name.includes('地毯')) return '🧶';
  if (name.includes('花') || name.includes('盆栽')) return '🪴';
  if (name.includes('画')) return '🖼';
  if (name.includes('凳')) return '🪑';
  if (name.includes('栅栏')) return '🚧';
  return '📦';
}

/** 返回 {kind:'image',src,alt} 或 {kind:'emoji',text}。
 * item 形如仓库条目 {sku?, id?, furnitureId?, name?}；先按 sku/id 找预览图，
 * 再回退到按名称分组的 Emoji（保持与旧版一致的轻量回退）。 */
export function stripPreviewSource(item) {
  const key = item && typeof item === 'object' ? (item.sku || item.id) : null;
  const gift=giftProduct(key);if(gift)return {kind:'image',src:gift.image,alt:item?.name||gift.name};
  const info = typeof key === 'string' ? PRODUCT_PREVIEW_INFO.get(key) : null;
  if (info) return { kind: 'image', src: `./assets/products/previews/${key}.png`, alt: (item?.name || info.name || key) };
  return { kind: 'emoji', text: emojiFallback(item?.name || '') };
}

/** 家具栏筛选分类（v2.17/F1）：全部 / 家具（摆在地上的）/ 挂件（挂在墙上的）/ 仓库（未摆放的）。
 * placed: 该条目是否在房间里；wall: 是否墙挂件。 */
export function stripFilterMatch(filter, { placed, wall }) {
  if (filter === 'all' || !filter) return true;
  if (!placed) return filter === 'storage';
  return filter === 'furniture' ? !wall : filter === 'wall' ? wall : false;
}
