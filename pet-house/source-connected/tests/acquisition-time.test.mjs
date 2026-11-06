import test from 'node:test';
import assert from 'node:assert/strict';
import {formatAcquisitionTime,acquisitionCaption} from '../acquisition-time.mjs';

test('stored instants display local calendar time with seconds and respect explicit timezone offsets',()=>{
  assert.equal(formatAcquisitionTime('2026-10-28T00:09:10.123Z',{timeZone:'Asia/Shanghai'}),'2026年10月28日 08:09:10');
  assert.equal(formatAcquisitionTime('2026-10-28T16:05:09-04:00',{timeZone:'Asia/Shanghai'}),'2026年10月29日 04:05:09');
  assert.equal(acquisitionCaption({acquiredAt:'2026-10-28T00:09:10Z',unlockedAt:'2020-01-01'},{timeZone:'UTC'}),'获得时间：2026年10月28日 00:09:10');
});

test('date-only legacy entries explicitly disclose missing precision; unknown or locked entries never invent a date',()=>{
  assert.equal(acquisitionCaption({unlockedAt:'2026-10-28'}),'获得日期：2026年10月28日（具体时间未记录）');
  assert.equal(acquisitionCaption({acquiredAt:'2026-10-28'}),'获得日期：2026年10月28日（具体时间未记录）');
  for(const acquiredAt of [null,undefined,'','invalid','2026-02-30T01:02:03Z','2026-10-28T08:12Z'])assert.equal(acquisitionCaption({acquiredAt}),'获得时间未记录');
  assert.equal(acquisitionCaption({acquiredAt:'2026-10-28T00:00:00Z',unlocked:false}),'尚未解锁');
  assert.equal(acquisitionCaption({acquiredAt:'2026-10-28T00:00:00Z',owned:false}),'尚未解锁');
});

test('a viewing date cannot become the acquisition date',()=>{
  const original=Date.now;Date.now=()=>{throw new Error('display must not consult now');};
  try{assert.equal(acquisitionCaption({acquiredAt:null},{now:new Date('2099-01-01')}),'获得时间未记录');assert.equal(formatAcquisitionTime('2020-01-01T01:02:03Z',{timeZone:'UTC',now:new Date('2099-01-01')}),'2020年1月1日 01:02:03');}
  finally{Date.now=original;}
});
