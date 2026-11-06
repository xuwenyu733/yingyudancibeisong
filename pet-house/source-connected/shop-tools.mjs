/** 商店工具（v2.17/F4）：自选心愿目标 + 搜索/价格排序/只看未拥有。
 * 纯函数、Node 可测；读写心愿目标走 localStorage（适配器可注入，缺失时降级为内存）。
 */
export const WISH_KEY_SUFFIX = '-wish-v1';
export const WISH_CATEGORIES = ['pets', 'furniture', 'flooring', 'wall'];
export const SORT_OPTIONS = Object.freeze([
  { value: 'default', label: '默认排序' },
  { value: 'price-asc', label: '价格从低到高' },
  { value: 'price-desc', label: '价格从高到低' },
]);

const number = value => (Number.isFinite(value) ? value : 0);

/** 归一化收藏目标对象：只保留合法的分类→sku 字符串。 */
export function normalizeWishTargets(input) {
  const out = {};
  for (const category of WISH_CATEGORIES) out[category] = '';
  if (!input || typeof input !== 'object') return out;
  for (const category of WISH_CATEGORIES) {
    const value = input[category];
    if (typeof value === 'string' && value.trim()) out[category] = value.slice(0, 80);
  }
  return out;
}

/** 从存储读取心愿目标；解析失败或不可用时返回空目标对象。 */
export function readWishTargets(wishKey, adapter) {
  if (!wishKey || !adapter || typeof adapter.getItem !== 'function') return normalizeWishTargets(null);
  let raw = null;
  try { raw = adapter.getItem(wishKey); } catch { return normalizeWishTargets(null); }
  if (typeof raw !== 'string') return normalizeWishTargets(null);
  try { return normalizeWishTargets(JSON.parse(raw)); } catch { return normalizeWishTargets(null); }
}

/** 保存心愿目标；失败静默（不影响购买流程）。 */
export function writeWishTargets(wishKey, targets, adapter) {
  if (!wishKey || !adapter || typeof adapter.setItem !== 'function') return false;
  try { adapter.setItem(wishKey, JSON.stringify(normalizeWishTargets(targets))); return true; } catch { return false; }
}

export function categoryOf(product) {
  return product?.category === 'flooring' ? 'flooring' : product?.category === 'wall' ? 'wall' : 'furniture';
}

/** 搜索 + 只看未拥有 + 价格排序（默认保持目录顺序）。返回过滤后的新数组。 */
export function applyCatalogView(products, { search = '', sort = 'default', unownedOnly = false, owned = () => false } = {}) {
  const list = Array.isArray(products) ? products.slice() : [];
  const text = String(search || '').trim().toLowerCase();
  let filtered = list;
  if (text) {
    filtered = filtered.filter(product => {
      const haystack = [product?.name, product?.sku, product?.description, product?.finish, ...(Array.isArray(product?.colors) ? product.colors : [])]
        .filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(text);
    });
  }
  if (unownedOnly) filtered = filtered.filter(product => !owned(product?.sku));
  if (sort === 'price-asc') filtered.sort((a, b) => number(a?.price) - number(b?.price));
  else if (sort === 'price-desc') filtered.sort((a, b) => number(b?.price) - number(a?.price));
  return filtered;
}

/** 心愿目标：已设置的未拥有物品优先；失效（已拥有/已下架）时回退到最便宜的未拥有物品。 */
export function wishTargetOf(products, owned, wishSku) {
  const list = Array.isArray(products) ? products : [];
  if (typeof wishSku === 'string' && wishSku) {
    const wished = list.find(product => product?.sku === wishSku && !owned(product.sku));
    if (wished) return wished;
  }
  return list.filter(product => !owned(product?.sku)).sort((a, b) => number(a?.price) - number(b?.price))[0] || null;
}