import {defineConfig} from 'vite';
import vue from '@vitejs/plugin-vue';
import {svelte} from '@sveltejs/vite-plugin-svelte';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const here=path.dirname(fileURLToPath(import.meta.url));
const strictCheck=process.env.PET_ROOM_STRICT_MODE==='1';
export default defineConfig({
  root:path.join(here,'app'),base:'/framework-check/',plugins:[vue(),svelte()],
  resolve:{dedupe:['react','react-dom','vue','svelte']},
  define:{__PET_ROOM_STRICT_CHECK__:JSON.stringify(strictCheck),...(strictCheck?{'process.env.NODE_ENV':JSON.stringify('development')}:{})},
  build:{outDir:path.join(here,'host/framework-check'),minify:false,assetsInlineLimit:0,
    rolldownOptions:{input:{main:path.join(here,'app/index.html'),iframe:path.join(here,'app/iframe.html')}}},
});
