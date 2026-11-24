# 语气管线导航

语气管线只依赖生命核心，在「Lpipe 设置」中保存四项表达规则。默认只为绑定的 LP 主会话注入提示词，也可切换为所有顶层对话。

- [src/index.js](src/index.js)：动态读取配置、按作用范围注入提示词、清理效果。
- [src/config.mjs](src/config.mjs)：路径、文本与作用范围默认值、字段验证及原子保存。
- [src/prompt.mjs](src/prompt.mjs)：英文共同边界、四项章节、全空零注入与正文原样呈现。
- [src/rpc.mjs](src/rpc.mjs)：现有 Fetch RPC 信封下的配置读写。
- [client/panel.js](client/panel.js)：独立保存的作用范围开关、四项输入和文字草稿的编辑与保存；构建到 [lib/client.js](lib/client.js)。
- [scripts/build-client.mjs](scripts/build-client.mjs)：把面板包成宿主的客户端模块壳。
- [assets/icon.png](assets/icon.png)：组件图标（三根渐变量柱，512² 透明 PNG）。
- [test/host.test.mjs](test/host.test.mjs)：绑定主会话、顶层对话与子智能体的注入规则，以及错误与卸载。
- [test/config.test.mjs](test/config.test.mjs)、[test/prompt.test.mjs](test/prompt.test.mjs)：存储安全、原样往返与空值渲染。
- [test/client.test.mjs](test/client.test.mjs)：设置块注册、开关与草稿独立保存、错误恢复及构建复现。
- [package.json](package.json)、[cordis.patch.yml](cordis.patch.yml)：独立组件声明（含 `dsh.client`、`icon` 与客户端导出）。
- [README.md](README.md)：设置页用法、字段边界、调用格式与构建测试方式。
