// 静态文件 URL 让 Vite / Rollup 等打包器能追踪并复制模型资源。
export const DEFAULT_ASSET_URLS = Object.freeze({
  sofa: new URL('./assets/optimized/sofa.glb', import.meta.url).href,
  table: new URL('./assets/optimized/table.glb', import.meta.url).href,
  lamp: new URL('./assets/optimized/lamp.glb', import.meta.url).href,
});
