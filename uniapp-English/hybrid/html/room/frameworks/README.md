# React / Vue / Svelte / Uni H5 接入

这些组件挂载完整的小屋（商店、积分、仓库、个人主页、装修），通过 `../pet-house.js` 调用同一个入口。不要把 `bootstrap.js` 或演示页的整个 HTML 放进框架组件；它们会独立挂载另一份场景。

## React

把本整合包作为源码目录保留（包括 `assets/` 与 `vendor/`），在项目中导入：

```jsx
import React, {StrictMode} from 'react';
import ReactPetRoom from './pet-house/frameworks/ReactPetRoom.jsx';

export default function App() {
  return <StrictMode>
    <ReactPetRoom
      storageKey="pet-house:user-123"
      timeZone="Asia/Shanghai"
      onReady={api => console.log('小屋已就绪', api.getShop())}
      onError={error => console.error('小屋加载失败', error)}
    />
  </StrictMode>;
}
```

组件在 effect 中创建场景并在 cleanup 中销毁。React 开发环境 StrictMode 的重复挂载会销毁第一份实例，并忽略它晚到的 ready / error；回调函数变更不会重建小屋。`storageKey`、资源路径或存储适配器等配置变更会先卸载旧实例再挂载新实例。`storageAdapter`、`assetUrls`、`bridge` 对象请用 `useMemo` 或模块级常量保持引用稳定，避免父组件每帧更新状态时反复重建场景。

## Vue 3

```vue
<script setup>
import VuePetRoom from './pet-house/frameworks/VuePetRoom.vue';
function ready(api) {
  console.log('小屋已就绪', api.getShop());
}
function error(failure) {
  console.error('小屋加载失败', failure);
}
</script>
<template>
  <VuePetRoom storage-key="pet-house:user-123" time-zone="Asia/Shanghai"
    @ready="ready" @error="error" />
</template>
```

组件使用 `onMounted` / `onBeforeUnmount`。参数变更按顺序卸载与重建；已卸载实例的异步回调不会更新新实例。`@state` 收到完整状态，`@event` 收到 `{type, detail}`。组件 ref 暴露 `getApi()` 与 `remount()`，导入存档后可用 `remount()` 载入新存档。

## Svelte 5 与 Uni H5

Svelte 5可导入`frameworks/SveltePetRoom.svelte`。`onReady`、`onState`、`onEvent`、`onError`是函数属性；配置与React/Vue适配器相同。组件实例暴露`getApi()`、`remount()`，配置变化会先清理旧实例，回调引用变化不会重建房间。

```svelte
<script>
  import SveltePetRoom from './pet-house/frameworks/SveltePetRoom.svelte';
  const ready=api=>console.log(api.getShop());
</script>
<SveltePetRoom storageKey="pet-house:user-123" timeZone="Asia/Shanghai" onReady={ready}/>
```

uni-app的H5页面可使用`UniPetRoom.vue`。适配器透传账户、资源路径、质量、面板/控件、样式、桥接配置及`ready/state/event/error`事件，并暴露`getApi()`、`remount()`。非H5分支显示web-view接入提示；原生App与小程序需加载受信任的WebView页面，不能把依赖DOM/WebGL的组件直接当作原生组件使用。本包的验收覆盖H5条件分支模拟和浏览器iframe桥接，不宣称完成各原生平台真机验收。

React/Vue/Svelte组件可在服务端导入和渲染外壳，房间只在客户端挂载后创建。Shadow DOM/Custom Element宿主应把一个实际HTMLElement作为`container`；样式将载入相应的Document或ShadowRoot作用域。

新版API支持`setWallColor(color)`、`applyFlooring(sku|null)`，商店程序化分类增加`flooring`和`wall`。调用`setPresentationPaused()`通常交由内置商店管理；宿主自建弹窗时可使用它显示静态背景，关闭后恢复。

## 容器、资源与账户

- 给外层容器可见的宽高。组件默认高 `min(76vh,720px)`、最小高 360px，可以用 `style` 覆盖。
- 默认资源随源码进入打包器。若把资源放到 `public/pet-assets/`，保留 `optimized/sofa.glb`、`optimized/table.glb`、`optimized/lamp.glb` 路径，并传 `assetsBaseUrl="/pet-assets/"`。跨域资源须由资源服务器允许 CORS。
- 默认自动加载 `styles.css`。宿主已统一管理样式时传 `styles={false}`（React）或 `:styles="false"`（Vue）并自行引入配套样式。
- `panels=false` 隐藏商店与个人主页，`controls=false` 隐藏装修控件。二者均默认 true。
- 按当前账户设置稳定的 `storageKey`，例如 `pet-house:${userId}`；切换账户必须更换 key。默认 `hamster-room-layout-v3` 用于兼容旧演示存档，不用于隔离多个登录账户。
- `initialPoints` 只初始化没有存档的账户，默认 0。修改它不会再次赠送积分；生产数据由宿主校验后使用 `api.creditLearning({eventId,learned,reviewed,checkIn})` 入账。相同账户重复提交同一个 `eventId` 不会重复加分。
- `storageAdapter` 为同步 `{getItem,setItem,removeItem?}`。导入存档可能新建账户键时须提供 `removeItem`，以便写入失败后完整回滚。若 App 的存储接口只有异步方法，先读取并缓存再同步挂载，提交时在宿主同步维护缓存。不要传 `async getItem()`；传 `null` 可在当前实例中临时体验而不保存。
- 保留的 API 只属于该次挂载，卸载或导入存档要求重启后应重新取得新 API。`importArchive()` 成功返回 `relaunchRequired` 时，React 可更新组件 `key`，Vue 可调用上面的 `remount()`。

## 原生 JavaScript 与 TypeScript

```js
import {mountPetHouse} from './pet-house.js';
const room = mountPetHouse({container:document.querySelector('#room'),storageKey:'pet-house:user-123'});
try {
  const api = await room.ready;
  const result = await api.purchasePet('cloud-bunny','buy-pet-001');
  if (!result.ok) console.log(result.code, result.message);
} catch (error) {
  console.error(error);
}
// 宿主卸载这个页面时：room.dispose();
```

入口与桥接有配套 `.d.ts` / `.d.mts`，包括宠物购买、切换、头像与 `assetUrls` 类型。小屋没有要求宿主暴露全局 `window.PetRoom`；每个组件保存自己的 API 引用。

## 可选事件桥接

直接调用 API 是 React / Vue 内最简单的接入方式。启用 `bridge:true` 后，可向实例的 canvas 精确派发 `room-command`，不要向公共父节点派发或依赖冒泡。协议为：

```js
canvas.dispatchEvent(new CustomEvent('room-command', {detail:{
  protocolVersion:1, roomId:'study-room', requestId:'buy-001',
  type:'command', command:'purchasePet', params:{sku:'cloud-bunny'},
}}));
```

给入口传 `bridge:{roomId:'study-room',legacyName:false}`。监听 canvas 的 `room-event` 获得协议结果；`envelope.ok` 表示桥接调用完成，业务购买是否成功要继续检查 `envelope.result.ok`。

跨 iframe 时另外显式配置精确 HTTP(S) `allowedOrigins` 与 `allowedSources` 窗口引用；只检查来源域名不够。默认没有启用跨窗口通信，不接受 `*` 或 `null` 来源，也不会主动向未知窗口发事件。桥接拒绝原型链方法、访问器、非 JSON 值与无效参数。命令 `requestId` 在实例内去重；同一 ID 用于不同参数会报错。购买和学习奖励还通过账户账本持久去重，不能把桥接的内存缓存当成服务端身份验证。

已销毁的桥接停止执行新命令、停止发 ready 与待处理结果，并移除监听器。处于加载中的 `getState` 可用，其余指令须等待 ready；若宿主提前调用桥接 `ready()`，它返回 false，加载完成后可再次调用。


