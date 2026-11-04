import test from 'node:test';
import assert from 'node:assert/strict';
import { createProfile, MAX_AVATAR_BYTES, validAvatar, badgeTierForLevel, BADGE_TIERS } from '../profile.mjs';
import { prepareAvatar } from '../scene-profile.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const memory = () => {
  const values = new Map();
  return { values, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test('avatar saves, reloads and resets; older version-1 profiles gain an empty avatar', () => {
  const adapter = memory(), profile = createProfile({ storageAdapter: adapter, storageKey: 'p' });
  assert.equal(profile.setAvatar(png).ok, true);
  assert.equal(createProfile({ storageAdapter: adapter, storageKey: 'p' }).getState().avatar, png);
  assert.equal(profile.setAvatar(png).unchanged, true);
  assert.equal(profile.setGender('male').ok, true);
  assert.equal(profile.getState().avatar, null);
  assert.equal(profile.setAvatar(png).ok, true);
  assert.equal(profile.setAvatar(null).ok, true);
  assert.equal(profile.getState().avatar, null);
  const legacy = JSON.parse(adapter.values.get('p')); delete legacy.avatar;
  adapter.values.set('p', JSON.stringify(legacy));
  const restored = createProfile({ storageAdapter: adapter, storageKey: 'p' });
  assert.equal(restored.getState().valid, true);
  assert.equal(restored.getState().avatar, null);
});

test('avatar rejects external, active, malformed and oversized content without changing the previous image', () => {
  const profile = createProfile({ storageAdapter: null });
  profile.setAvatar(png);
  for (const value of ['https://example.com/photo.jpg', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAAA', `${png}${'A'.repeat(MAX_AVATAR_BYTES)}`, {}, undefined]) {
    assert.equal(profile.setAvatar(value).ok, false);
    assert.equal(profile.getState().avatar, png);
  }
  assert.equal(validAvatar(png), true);
});

test('avatar write failure leaves the persisted and visible avatar intact', () => {
  let value = null, reject = false;
  const adapter = { getItem: () => value, setItem: (_, next) => { if (reject) throw new Error('quota'); value = next; } };
  const profile = createProfile({ storageAdapter: adapter });
  assert.equal(profile.setAvatar(png).ok, true);
  const saved = value; reject = true;
  assert.equal(profile.setAvatar(null).code, 'STORAGE_WRITE_FAILED');
  assert.equal(profile.getState().avatar, png);
  assert.equal(value, saved);
});

test('all twenty levels map to five increasing badge shapes with explicit boundaries', () => {
  assert.equal(BADGE_TIERS.length, 5);
  for (const tier of BADGE_TIERS) assert.equal(badgeTierForLevel(tier.minLevel).id, tier.id);
  assert.equal(badgeTierForLevel(3).id, 'bronze');
  assert.equal(badgeTierForLevel(7).id, 'silver');
  assert.equal(badgeTierForLevel(11).id, 'gold');
  assert.equal(badgeTierForLevel(15).id, 'crystal');
  assert.equal(badgeTierForLevel(20).id, 'royal');
  assert.equal(badgeTierForLevel(999).id, 'royal');
  assert.equal(badgeTierForLevel(NaN).id, 'bronze');
});

const pngFile = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])], { type: 'image/png' });
function imageWindow({ invalid = false, width = 600, height = 200 } = {}) {
  const draws = [], revoked = [];
  const canvas = { getContext: () => ({ fillRect() {}, drawImage: (...args) => draws.push(args) }), toDataURL: () => 'data:image/jpeg;base64,/9j/AA==' };
  const win = {
    URL: { createObjectURL: () => 'blob:local-photo', revokeObjectURL: url => revoked.push(url) },
    Image: class { naturalWidth = width; naturalHeight = height; set src(value) { this.source = value; queueMicrotask(() => invalid ? this.onerror() : this.onload()); } },
    document: { createElement: tag => { assert.equal(tag, 'canvas'); return canvas; } },
  };
  return { win, draws, revoked, canvas };
}

test('album image is decoded, center-cropped to 192px and releases its temporary object URL', async () => {
  const { win, draws, revoked, canvas } = imageWindow();
  const result = await prepareAvatar(pngFile(), win);
  assert.equal(validAvatar(result), true);
  assert.equal(canvas.width, 192); assert.equal(canvas.height, 192);
  assert.deepEqual(draws[0].slice(1), [200, 0, 200, 200, 0, 0, 192, 192]);
  assert.deepEqual(revoked, ['blob:local-photo']);
});

test('album picker rejects false MIME, oversized and undecodable files and frees failed decodes', async () => {
  await assert.rejects(prepareAvatar(new Blob(['<svg>'], { type: 'image/svg+xml' })), /JPG/);
  await assert.rejects(prepareAvatar(new Blob(['fake'], { type: 'image/png' })), /格式不符/);
  await assert.rejects(prepareAvatar({ type: 'image/png', size: 11 * 1024 * 1024 }), /10MB/);
  const { win, revoked } = imageWindow({ invalid: true });
  await assert.rejects(prepareAvatar(pngFile(), win), /无法读取/);
  assert.deepEqual(revoked, ['blob:local-photo']);
});
