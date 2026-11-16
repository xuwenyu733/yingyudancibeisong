import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('service worker upgrades keep other applications caches',async()=>{
 const handlers={},removed=[],script=await readFile(new URL('../sw.js',import.meta.url),'utf8'),current=/const CACHE = '([^']+)'/.exec(script)[1];
 vm.runInNewContext(script,{self:{addEventListener:(k,f)=>handlers[k]=f,clients:{claim:async()=>{}},location:{origin:'http://localhost'}},caches:{keys:async()=>['learning-offline-cache','pet-room-vOLD',current],delete:async name=>removed.push(name)}});
 let done;handlers.activate({waitUntil:promise=>done=promise});await done;assert.deepEqual(removed,['pet-room-vOLD']);
});
test('the page uses an external worker registration compatible with production CSP',async()=>{
 const html=await readFile(new URL('../index.html',import.meta.url),'utf8');assert.match(html,/<script type="module" src="\.\/register-worker\.js"><\/script>/);assert(!/<script(?![^>]*\bsrc=)[^>]*>\s*\S/.test(html));
});
