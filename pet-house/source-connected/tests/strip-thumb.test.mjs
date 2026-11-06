import test from 'node:test';
import assert from 'node:assert/strict';
import { stripPreviewSource, stripFilterMatch } from '../strip-thumb.mjs';
import { PRODUCT_PREVIEW_INFO } from '../product-previews.mjs';
import { SHOP_CATALOG, STORAGE_CATALOG } from '../economy.mjs';

// —— v2.17/F1：家具栏真实缩略图 + 筛选 ——
test('v2.17/F1: 商店家具/房间件都有真实预览图（无 Emoji 占位）', () => {
  const skus = [];
  for (const item of SHOP_CATALOG) if (typeof item.sku === 'string') skus.push(item.sku);
  for (const item of STORAGE_CATALOG) skus.push(item.sku || item.id);
  const missing = skus.filter(key => !PRODUCT_PREVIEW_INFO.has(key));
  assert.deepEqual(missing, [], '每个可摆放条目都应有 assets/products/previews/<key>.png');
  for (const key of skus) {
    const source = stripPreviewSource({ sku: key, name: 'x' });
    assert.equal(source.kind, 'image');
    assert.ok(source.src.includes(`previews/${key}.png`), `${key} 应指向真实 PNG`);
  }
});

test('v2.17/F1: 未知条目回退 Emoji，且按名称分类', () => {
  assert.equal(stripPreviewSource({ id: 'ghost', name: '小台灯' }).kind, 'emoji');
  assert.equal(stripPreviewSource({ id: 'ghost', name: '小台灯' }).text, '💡');
  assert.equal(stripPreviewSource({ id: 'x', name: '杂物' }).text, '📦');
  assert.equal(stripPreviewSource({ name: '沙发床' }).text, '🛋');
});

test('v2.17/F1: 筛选分类——未摆放归仓库，摆放后家具/挂件分流', () => {
  assert.equal(stripFilterMatch('all', { placed: false, wall: false }), true);
  assert.equal(stripFilterMatch('storage', { placed: false, wall: true }), true);
  assert.equal(stripFilterMatch('furniture', { placed: false, wall: false }), false);
  assert.equal(stripFilterMatch('furniture', { placed: true, wall: false }), true);
  assert.equal(stripFilterMatch('furniture', { placed: true, wall: true }), false);
  assert.equal(stripFilterMatch('wall', { placed: true, wall: true }), true);
  assert.equal(stripFilterMatch('wall', { placed: true, wall: false }), false);
  assert.equal(stripFilterMatch('storage', { placed: true, wall: false }), false);
  assert.equal(stripFilterMatch('bogus', { placed: true, wall: false }), false);
});

// —— v2.17/F2：装修撤销/重做栈 ——
import { createEditHistory, cloneForHistory } from '../edit-history.mjs';

test('v2.17/F2: 撤销/重做按栈序回放，cap 限制记忆长度', () => {
  const history = createEditHistory({ cap: 3 });
  assert.equal(history.canUndo, false);
  history.push('a'); history.push('b'); history.push('c'); history.push('d'); // a 被挤出
  assert.equal(history.canUndo, true);
  assert.equal(history.length, 3);
  // 当前状态 X（第 4 步之后）
  assert.equal(history.undo('X'), 'd');   // 回到第 3 步前
  assert.equal(history.canRedo, true);
  assert.equal(history.undo('d'), 'c');   // 回到第 2 步前
  assert.equal(history.redo('c'), 'd');   // 重做第 3 步
  assert.equal(history.undo('d'), 'c');   // 再撤销一次
  // 新操作清空重做栈
  history.push('e');
  assert.equal(history.canRedo, false);
  assert.equal(history.undo('anything'), 'e');
});

test('v2.17/F2: 空栈撤销/重做返回 null 且不污染状态', () => {
  const history = createEditHistory();
  assert.equal(history.undo('cur'), null);
  assert.equal(history.redo('cur'), null);
  assert.equal(history.canUndo, false);
  history.push('x'); history.clear();
  assert.equal(history.canUndo, false);
  assert.equal(history.undo('cur'), null);
});

test('v2.17/F2: cloneForHistory 深拷贝快照（互不引用）', () => {
  const snapshot = { version: 3, furniture: { a: { position: [1, 2, 3] } } };
  const copy = cloneForHistory(snapshot);
  assert.notEqual(copy, snapshot);
  assert.notEqual(copy.furniture, snapshot.furniture);
  copy.furniture.a.position[0] = 99;
  assert.equal(snapshot.furniture.a.position[0], 1);
  assert.equal(cloneForHistory(null), null);
  assert.equal(cloneForHistory(undefined), undefined);
});
