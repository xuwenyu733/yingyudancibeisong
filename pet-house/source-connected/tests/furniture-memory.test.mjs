import test from 'node:test';
import assert from 'node:assert/strict';
import {furnitureMemoryAge} from '../furniture-memory.mjs';
test('acquisition time stays exact while the arrival day starts at one',()=>{
  const result=furnitureMemoryAge({at:'2026-10-28T03:04:00Z'},{now:new Date('2026-10-28T15:00:00Z'),timeZone:'Asia/Shanghai'});
  assert.equal(result.acquiredAt,'2026-10-28T03:04:00.000Z');assert.equal(result.acquiredDate,'2026-10-28');assert.equal(result.daysHeld,1);assert.equal(result.elapsedDays,0);
});
test('midnight crossing uses local calendar days, not full 24-hour intervals',()=>{
  const result=furnitureMemoryAge({at:'2026-10-27T16:30:00Z'},{now:new Date('2026-10-28T16:29:00Z'),timeZone:'Asia/Shanghai'});
  assert.equal(result.daysHeld,2);assert.equal(result.elapsedDays,1);
});
test('DST does not lose a day and future dates never produce a negative age',()=>{
  assert.equal(furnitureMemoryAge({at:'2026-03-07T17:00:00Z'},{now:new Date('2026-03-08T16:00:00Z'),timeZone:'America/New_York'}).daysHeld,2);
  assert.equal(furnitureMemoryAge({at:'2026-10-29T00:00:00Z'},{now:new Date('2026-10-28T00:00:00Z'),timeZone:'UTC'}).daysHeld,1);
});
test('legacy unknown and broken dates remain unknown instead of 1970',()=>{
  for(const at of [null,undefined,'','not-a-date'])assert.equal(furnitureMemoryAge({at}).daysHeld,null);
});
