import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mountRoom } from '../room.js';

test('room module imports in a fresh Node process without touching DOM or starting frames', () => {
  const roomURL = new URL('../room.js', import.meta.url).href;
  const script = `
    import assert from 'node:assert/strict';
    globalThis.document = new Proxy({}, {get(){throw new Error('unexpected DOM access during import');}});
    globalThis.requestAnimationFrame = () => {throw new Error('unexpected animation frame during import');};
    const module = await import(${JSON.stringify(roomURL)});
    assert.equal(typeof module.mountRoom, 'function');
    assert.equal(globalThis.HamsterRoom, undefined);
    assert.equal(globalThis.window, undefined);
    process.stdout.write('import-ok');
  `;
  assert.equal(execFileSync(process.execPath, ['--input-type=module', '--eval', script], {
    encoding: 'utf8', timeout: 10_000,
  }), 'import-ok');
});

test('invalid canvas inputs fail before creating a renderer or reserving a mount', () => {
  let contextReads = 0;
  const detached = {getContext(){contextReads++;},ownerDocument:{defaultView:null}};
  for (const canvas of [undefined, null, {}, {getContext(){}}, detached]) {
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.throws(() => mountRoom({canvas}), (error) => error.code === 'INVALID_CANVAS');
    }
  }
  assert.equal(contextReads, 0);
});

test('invalid character factories are rejected in preflight with no WebGL mock', () => {
  const canvas = {
    getContext(){throw new Error('renderer must not be reached');},
    ownerDocument:{defaultView:{}},
  };
  for (const characterFactory of [null, {}, 'character', 42]) {
    assert.throws(() => mountRoom({canvas,characterFactory}), (error) => error.code === 'INVALID_CHARACTER');
  }
  // Failed preflight must not leave this canvas marked ALREADY_MOUNTED.
  assert.throws(() => mountRoom({canvas,characterFactory:null}), (error) => error.code === 'INVALID_CHARACTER');
});

test('unknown quality profiles fail before canvas styling, listeners or context creation', () => {
  const canvas = {
    getContext(){throw new Error('renderer must not be reached');},
    ownerDocument:{defaultView:{navigator:{}}},
  };
  assert.throws(() => mountRoom({canvas,quality:'unsupported-profile'}), TypeError);
});
test('invalid resource timeout props fail before creating a renderer',()=>{
  const canvas={getContext(){throw new Error('renderer must not be reached');},ownerDocument:{defaultView:{}}};
  for(const loadTimeoutMs of [0,-1,NaN,Infinity,'1000'])assert.throws(()=>mountRoom({canvas,loadTimeoutMs}),error=>error.code==='INVALID_TIMEOUT');
});
