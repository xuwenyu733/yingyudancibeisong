# 可复现的框架接入验证

需要 Node.js 22.12+ 与 npm。在本目录执行：

```sh
npm ci
npm run check:types
npm run check:ssr
npm run build
npm run check:browser
npm run preview
```

打开终端打印的 `/framework-check/` 链接，点击「运行全部接入验证」。默认构建使用真实React生产运行时。设置`PET_ROOM_STRICT_MODE=1`后分别执行`build`和`check:browser`，可另外构建React开发运行时并实际执行StrictMode的额外挂载清理；两种模式独立记录，不能用开发模式替代生产验收。完成专项后清除该变量并重新构建即可恢复生产预览。

依赖已锁定为 React / ReactDOM 19.3.1、Vue 3.5.44、Svelte 5.57.3、Vite 8.3.5、Vue 插件 6.0.10、Svelte 插件 7.3.1、TypeScript 5.9.3。测试使用内存存储，不修改真实账户。

检查内容包括实际 WebGL 模型加载、子目录部署、StrictMode、路由卸载/重新挂载、React/Svelte回调变更、Vue/Svelte账户切换、Vue暴露API、积分兑换、表单嵌入、共享样式、导入后重挂、取消加载、窄容器、相对/覆盖资源路径、全部46张模型图片、商店暂停绘制、Shadow DOM/Custom Element宿主及 iframe 来源校验。`check:ssr`实际执行React、Vue和Svelte的无DOM服务端渲染。

自动浏览器验证需要安装Playwright和Chromium，或通过`PET_ROOM_PLAYWRIGHT_MODULE`与`PET_ROOM_CHROMIUM_EXECUTABLE`指定本机路径。结果分别保存在`results-production.json`、`results-strict.json`，`results.json`记录最近一次；截图在`host/framework-validation-production.png`或`host/framework-validation-strict.png`。`host/`、`node_modules/`和`app/public/`是本地构建产物，不属于发布包源文件。

`prepare.mjs` 在构建前复制三个家具模型，供相对 `assetsBaseUrl` 专项用例使用，并按H5条件分支生成`UniH5.generated.vue`后交给Vue编译。默认资源打包测试仍使用小屋入口里的静态 URL，而非这些复制文件。Uni检查验证的是H5适配器的条件分支、配置和事件透传，未运行uni-app原生工具链。

测试完成后会卸载所有实例并检查遗留场景、样式、提示和未处理异常。这是桌面 Chromium 中的浏览器接入验证，不能代替 iOS/Android 原生 WebView 或各小程序平台的真机验收。
