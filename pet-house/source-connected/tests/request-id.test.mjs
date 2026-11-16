import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createRequestId} from '../request-id.mjs';
test('request IDs retain native crypto receiver and native format',()=>{
 const source={randomUUID(){assert.equal(this,source);return 'native-id';},getRandomValues(){throw Error('unused');}};assert.equal(createRequestId(source),'native-id');
});
test('local HTTP fallback creates distinct RFC 4122 v4 IDs using getRandomValues',()=>{
 const ids=new Set(),source={getRandomValues(bytes){assert.equal(this,source);return webcrypto.getRandomValues(bytes);}};
 for(let i=0;i<500;i++){const id=createRequestId(source);assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);ids.add(id);}assert.equal(ids.size,500);
});
test('missing or broken cryptography fails explicitly rather than using weak IDs',()=>{
 assert.throws(()=>createRequestId({}),/安全随机/);assert.throws(()=>createRequestId({getRandomValues(){throw Error('unavailable');}}),/unavailable/);
});
