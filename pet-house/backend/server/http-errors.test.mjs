import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createAppServer} from './server.mjs';

test('missing static files return a public 404 without the server filesystem path or username',async()=>{
 const sourceRoot=resolve(fileURLToPath(new URL('../../source-connected/',import.meta.url)));
 const pool={async query(){return[[],[]];},async execute(sql){if(sql.includes('information_schema.TABLES'))return[[{TABLE_NAME:'room_world_saves'}],[]];throw new Error('unexpected SQL');},async end(){}};
 const app=await createAppServer({sourceRoot,database:'pet_room',socialEnabled:false},{pool});
 try{await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+app.server.address().port;
  const response=await fetch(base+'/missing-static-file-audit.js'),body=await response.json();assert.equal(response.status,404);assert.equal(body.message,'没有找到这个页面或文件');assert.equal(JSON.stringify(body).includes(sourceRoot),false);assert.equal(JSON.stringify(body).includes('ENOENT'),false);
  const head=await fetch(base+'/missing-static-file-audit.js',{method:'HEAD'});assert.equal(head.status,404);assert.equal(await head.text(),'');
 }finally{await app.close();}
});
