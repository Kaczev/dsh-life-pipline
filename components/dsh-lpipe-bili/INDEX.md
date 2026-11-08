# B 站管线导航

- [README.md](README.md)：用法、设置页、RPC、存储和验证边界。
- [src/index.js](src/index.js)：宿主注册和生命周期。
- [src/tools.mjs](src/tools.mjs)：十个模型工具与图像交付。
- [src/api.mjs](src/api.mjs)：只读 API、WBI、限流与字幕。
- [src/login.mjs](src/login.mjs)、[src/vendor/auth.mjs](src/vendor/auth.mjs)：宿主凭据与扫码流程。
- [src/watch.mjs](src/watch.mjs)、[src/storyboard-worker.mjs](src/storyboard-worker.mjs)：下载和隔离分镜。
- [src/storage.mjs](src/storage.mjs)：保留时间与清理。
- [src/rpc.mjs](src/rpc.mjs)：`/api/dsh-lpipe-bili` 的 status、扫码登录与保留时间 RPC。
- [client/panel.js](client/panel.js)：设置页里的「B 站」块（扫码登录 + 下载保留天数），注册进 `lpipe.settings.panel`；构建到 [lib/client.js](lib/client.js)。
- [scripts/build-client.mjs](scripts/build-client.mjs)：把面板包成宿主的客户端模块壳。
- [assets/icon.png](assets/icon.png)：组件图标（青绿小电视、蓝紫屏幕与白色播放键，512² 透明 PNG）。
- [locale/zh.json](locale/zh.json) / [locale/en.json](locale/en.json)：组件显示名与简介。
- [test/core.test.mjs](test/core.test.mjs)：接口与边界回归。
- [test/client.test.mjs](test/client.test.mjs)：设置块注册、扫码状态与保留时间解析。
- [test/theme.test.mjs](test/theme.test.mjs)：宿主主题 token 与槽位约束。
- [test/package.test.mjs](test/package.test.mjs)：客户端、图标、双语元数据与打包字段。
- [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)：复用来源与许可。
