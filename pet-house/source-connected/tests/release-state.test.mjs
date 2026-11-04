import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { excludedFromRelease, releaseRollback } from '../scripts/release-state.mjs';

test('release rollback restores exact bytes and removes only newly generated transaction files', () => {
  const prefix = path.join(os.tmpdir(), 'pet-release-'), root = mkdtempSync(prefix);
  try {
    const original = Buffer.from([0xef, 0xbb, 0xbf, 13, 10, 65]);
    writeFileSync(path.join(root, 'version'), original);
    const transaction = releaseRollback(root, ['version', 'manifest']);
    writeFileSync(path.join(root, 'version'), 'new version');
    writeFileSync(path.join(root, 'manifest'), 'partial');
    transaction.rollback(); transaction.rollback();
    assert.deepEqual(readFileSync(path.join(root, 'version')), original);
    assert.equal(existsSync(path.join(root, 'manifest')), false);
    assert.throws(() => releaseRollback(root, ['../outside']), /超出项目目录/);
    const committed = releaseRollback(root, ['version']);
    writeFileSync(path.join(root, 'version'), 'successful');
    committed.commit(); committed.rollback();
    assert.equal(readFileSync(path.join(root, 'version'), 'utf8'), 'successful');
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(prefix)), '只清理本测试创建的临时目录');
    rmSync(root, { recursive: true, force: true });
  }
});

test('release excludes historical snapshots while keeping current runtime thumbnail assets', () => {
  for (const file of ['original-pet-room', 'original-pet-room/room.js', 'original-pet-room-v2.3-flat/assets/fox.glb', 'previews/old.png', 'validation/frameworks/host/node_modules/a']) {
    assert.equal(excludedFromRelease(file), true, file);
  }
  for (const file of ['assets/products/previews/sofa.png', 'assets/pets/previews/mint-cat.png', 'characters/pet-models.js', 'previews.js']) {
    assert.equal(excludedFromRelease(file), false, file);
  }
});
