# 栖所管线导航

本目录拥有个人文件夹配置、目录校验、主会话系统提示词，以及设置页里的「Lpipe Home」块和图标。

- [README.md](README.md)：设置页行为、配置桥、状态定义和权限边界。
- [src/config.mjs](src/config.mjs)：默认未选择、原子配置保存和目录验证。
- [src/prompt.mjs](src/prompt.mjs)：英文 `##` 提示词。
- [src/index.js](src/index.js)：主会话工作区解析、作用域及生命周期。
- [src/rpc.mjs](src/rpc.mjs)：配置读写和草稿验证。
- [client/panel.js](client/panel.js)：设置块（Owner 名字、栖所位置、自定义路径、状态行）。
- [lib/client.js](lib/client.js)：构建产物，由 `scripts/build-client.mjs` 生成，不手改。
- [scripts/build-client.mjs](scripts/build-client.mjs)：把 `client/panel.js` 包成 `window.__ModuleLoader__` 模块。
- [assets/icon.png](assets/icon.png)：512² 透明图标，扁平渐变房屋，与系列其它管线一致。
- [locale/zh.json](locale/zh.json) / [locale/en.json](locale/en.json)：显示名「栖所管线（Lpipe Home）」与字段词条。
- [test/core.test.mjs](test/core.test.mjs)：停用、失效、隔离及 RPC 回归。
- [test/client.test.mjs](test/client.test.mjs)：槽位注册、RPC 信封、状态与草稿纯函数。
- [test/package.test.mjs](test/package.test.mjs)：包元数据、图标和双语文案。
- [package.json](package.json) / [cordis.patch.yml](cordis.patch.yml)：独立 bundle 和导出资源。
