import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

/** Runtime preview assets remain publishable; only top-level historical evidence is excluded. */
export function excludedFromRelease(relative) {
  const rel = relative.split(path.sep).join('/');
  return ['original-pet-room', 'original-pet-room-v2.3-flat', 'previews'].some(prefix => rel === prefix || rel.startsWith(`${prefix}/`)) ||
    ['validation/frameworks/app/UniH5.generated.vue', 'validation/frameworks/build-log.txt'].includes(rel) ||
    ['validation/frameworks/host', 'validation/frameworks/app/public'].some(prefix => rel === prefix || rel.startsWith(`${prefix}/`));
}

/** Restore exact pre-release bytes when any later check or packaging step fails. */
export function releaseRollback(root, files) {
  const base = path.resolve(root);
  const originals = new Map(files.map(file => {
    const target = path.resolve(base, file), rel = path.relative(base, target);
    if (!rel || rel.startsWith(`..${path.sep}`) || rel === '..' || path.isAbsolute(rel)) throw new Error('发布备份路径超出项目目录');
    return [target, existsSync(target) ? readFileSync(target) : null];
  }));
  let settled = false;
  return {
    commit() { settled = true; originals.clear(); },
    rollback() {
      if (settled) return;
      for (const [file, original] of originals) {
        if (original === null) { if (existsSync(file)) unlinkSync(file); }
        else writeFileSync(file, original);
      }
      settled = true; originals.clear();
    },
  };
}
