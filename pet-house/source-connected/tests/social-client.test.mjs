import test from 'node:test';
import assert from 'node:assert/strict';
import {createSocialClient} from '../social-client.mjs';
test('friend requests have a finite deadline and preserve an explicit caller cancellation signal',async()=>{
 const calls=[],client=createSocialClient({fetcher:async(url,options)=>{calls.push(options);return{ok:true,json:async()=>({ok:true,identity:{publicId:'PET-AAAAAAAAAA'}})};}});await client.enter();assert(calls[0].signal instanceof AbortSignal);const controller=new AbortController();await client.request('overview',{signal:controller.signal});assert.equal(calls[1].signal,controller.signal);assert.equal(calls[0].credentials,'same-origin');
});
test('network failures and malformed responses produce readable feedback',async()=>{
 await assert.rejects(createSocialClient({fetcher:async()=>{throw new TypeError('Failed to fetch');}}).overview(),/朋友连接暂时不可用/);
 for(const value of [null,[],42])await assert.rejects(createSocialClient({fetcher:async()=>({ok:true,json:async()=>value})}).overview(),/无法读取/);
});
