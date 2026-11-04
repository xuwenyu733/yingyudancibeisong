import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCompanionStore} from '../companion-state.mjs';
import {exportArchive,importArchive} from '../archive.mjs';
import {createEconomy} from '../economy.mjs';
import {createProfile} from '../profile.mjs';
test('wall drawing survives full archive validation',()=>{
  const state=createCompanionStore(),drawing={version:1,strokes:[{tool:'brush',color:'#ff0000',size:.02,points:[[.1,.2],[.8,.9]]}]};assert.equal(state.saveWallDrawing(drawing).ok,true);
  const archive=exportArchive({profile:createProfile().getState(),economy:createEconomy().getState(),meta:{companion:state.getState()}}),restored=importArchive(archive);
  assert.equal(restored.ok,true);assert.deepEqual(restored.meta.companion.wallDrawing,drawing);
});
test('wall editor has no photo or weather entry and room imports no capture/network pipeline',()=>{
  const ui=readFileSync(new URL('../creative-ui.js',import.meta.url),'utf8'),room=readFileSync(new URL('../room.js',import.meta.url),'utf8');
  for(const text of ['拍照','明信片','相册','天气'])assert.equal(ui.includes(text),false);
  for(const text of ['createRoomWeather','captureRoomCard','takeRoomPhoto','capturePostcard'])assert.equal(room.includes(text),false);
});
