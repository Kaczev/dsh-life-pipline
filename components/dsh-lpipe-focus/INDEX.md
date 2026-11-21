# 聚焦管线导航

聚焦管线只依赖生命核心，默认为当前 LP 主会话（开启 `allSessions` 后扩展至全部顶层对话，排除子 agent）提供单会话窗口内的结论堆叠、程序整理与未转化提醒，并在「Lpipe 设置」页提供配置块。

- [src/index.js](src/index.js)：宿主装配、会话门禁（LP 主会话／所有顶层对话，排除 subagent）、`focus_conclude` 工具与系统提示词注册、`agent/pre-step` 挂载及诊断写入。
- [src/config.mjs](src/config.mjs)：`life-focus/config.json` 路径、`allSessions` 开关与四项默认值及关系校验、损坏文件保护与原子保存。
- [src/rpc.mjs](src/rpc.mjs)：`/api/dsh-lpipe-focus` 的 `focus.config` 与 `focus.config.save` 信封处理。
- [src/tools.mjs](src/tools.mjs)：`focus_conclude` 参数校验、并发工具调用硬拦截与结果渲染。
- [src/render.mjs](src/render.mjs)：结论层 `<working-conclusions>`、提示层 `<current-objective>` 与轻推提醒 `<system-reminder>` 正文构造。
- [src/surface.mjs](src/surface.mjs)：四层表层切分、双段 `replace` 折叠、过线／闲置程序归并裁剪与防刷屏轻推提醒。
- [src/prompt.mjs](src/prompt.mjs)：注入主会话的英文固定系统提示词章节（`order: 712`）。
- [client/panel.js](client/panel.js)：设置页里的「聚焦管线」块（「所有对话生效」即时开关、四项输入、K/M 简写、恢复默认／撤回／保存、读取失败保护与重试）；构建到 [lib/client.js](lib/client.js)。
- [scripts/build-client.mjs](scripts/build-client.mjs)：把面板打包为宿主的客户端模块壳。
- [assets/icon.png](assets/icon.png)：组件图标（聚焦四角框 + 堆叠结论条 + 琥珀色当前目标条，512² 透明 PNG）。
- [test/config.test.mjs](test/config.test.mjs)：四项范围、跨字段关系、损坏文件保护与未知键保留测试。
- [test/surface.test.mjs](test/surface.test.mjs)：四层折叠与前缀守恒、提示层承接、并发拦截、过线／闲置整理、提醒与主会话隔离回归。
- [test/rpc.test.mjs](test/rpc.test.mjs)：RPC 信封、HTTP 状态码与读写错误测试。
- [test/client.test.mjs](test/client.test.mjs)：客户端构建同步、宿主主题 token、K/M 输入校验、读取失败重试与保存按钮状态测试。
- [package.json](package.json)、[cordis.patch.yml](cordis.patch.yml)：独立组件声明与挂载行。
- [README.md](README.md)：功能机制、四项阈值说明、RPC 接口与构建测试命令。
