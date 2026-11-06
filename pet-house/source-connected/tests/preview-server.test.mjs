import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('preview server reserves its local port so a later copy cannot serve a different version there',t=>{
  const root=fileURLToPath(new URL('../',import.meta.url));
  const script=`import sys\nsys.path.insert(0,${JSON.stringify(root)})\nfrom serve import LocalHTTPServer, SimpleHTTPRequestHandler\na=LocalHTTPServer(('127.0.0.1',0),SimpleHTTPRequestHandler)\ntry:\n    try:\n        b=LocalHTTPServer(a.server_address,SimpleHTTPRequestHandler)\n    except OSError:\n        print('exclusive')\n    else:\n        b.server_close()\n        raise AssertionError('same port accepted twice')\nfinally:\n    a.server_close()\n`;
  const result=spawnSync('python',['-c',script],{encoding:'utf8',timeout:10000});
  if(result.error?.code==='ENOENT'){t.skip('Python is only required for the optional local preview launcher');return;}
  assert.equal(result.status,0,result.stderr||result.error?.message);assert.equal(result.stdout.trim(),'exclusive');
});
