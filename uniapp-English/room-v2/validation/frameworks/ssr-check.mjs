import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const server=await createServer({configFile:fileURLToPath(new URL('./vite.config.mjs',import.meta.url)),server:{middlewareMode:true},appType:'custom'});
try{const module=await server.ssrLoadModule('/ssr-entry.jsx');console.log(`Server rendering without DOM/WebGL: ${(await module.run()).join(', ')} PASS`);}finally{await server.close();}
