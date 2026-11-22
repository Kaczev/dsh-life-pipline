# 聚焦管线导航

聚焦管线只依赖生命核心。开始下一段实质工作前，在单个会话内用等效层替代已经得出结果的工作区间。默认作用于 LP 主会话及其子智能体；范围和整理阈值可在「Lpipe 设置」中调整。

- [src/index.js](src/index.js)：宿主装配、会话门禁、工具与系统提示词注册、`agent/pre-step` 挂载及诊断写入。
- [src/config.mjs](src/config.mjs)：两个作用域开关与三项数值的默认值、校验、损坏文件保护与原子保存。
- [src/rpc.mjs](src/rpc.mjs)：`focus.config` 与 `focus.config.save` 接口。
- [src/tools.mjs](src/tools.mjs)：`focus_equate` 参数、会话内键和显式覆盖校验；新版回执与已保存等效层的识别。
- [src/render.mjs](src/render.mjs)：等效层正文、独立的下一步提示、跨轮工作量与上下文压力提醒。
- [src/surface.mjs](src/surface.mjs)：用等效层替代连续工作区间；累计跨轮工作量，在闲置或过线时仅回收显式覆盖的旧层。
- [src/prompt.mjs](src/prompt.mjs)：英文系统提示词，说明何时等效及如何理解新旧词义。
- [client/panel.js](client/panel.js)：作用域、数值编辑、保存、撤回与读取失败重试；由 [构建脚本](scripts/build-client.mjs) 生成 [lib/client.js](lib/client.js)。
- [assets/icon.png](assets/icon.png)：插件图标。
- [test/surface.test.mjs](test/surface.test.mjs)：连续区间、定义更新、覆盖回收、会话恢复、压缩锁与作用域。
- [test/contract.test.mjs](test/contract.test.mjs)：字段约束、键不复用、回执匹配与新版事件重放。
- [test/config.test.mjs](test/config.test.mjs)、[test/rpc.test.mjs](test/rpc.test.mjs)、[test/client.test.mjs](test/client.test.mjs)：配置、接口与设置面板回归。
- [package.json](package.json)、[cordis.patch.yml](cordis.patch.yml)：组件声明与挂载行。
- [README.md](README.md)：用法、三项阈值、RPC 与测试命令。
