# 语气管线导航

语气管线只依赖生命核心，手动保存四项表达规则，为当前 LP 主会话提供系统提示词，并在「Lpipe 设置」页里提供自己的设置块。

- [src/index.js](src/index.js)：宿主注入、动态配置读取、主会话门禁与效果清理。
- [src/config.mjs](src/config.mjs)：路径、默认值、字段验证与原子保存。
- [src/prompt.mjs](src/prompt.mjs)：英文共同边界、四项章节、全空零注入与正文原样呈现。
- [src/rpc.mjs](src/rpc.mjs)：现有 Fetch RPC 信封下的配置读写。
- [client/panel.js](client/panel.js)：设置页里的「语气管线」块（措辞／句式／节奏／表达的显隐四个多行输入、维度解释、单项恢复默认、字符计数、保存、撤回、清空与读取／保存状态）；构建到 [lib/client.js](lib/client.js)。
- [scripts/build-client.mjs](scripts/build-client.mjs)：把面板包成宿主的客户端模块壳。
- [assets/icon.png](assets/icon.png)：组件图标（三根渐变量柱，512² 透明 PNG）。
- [test/host.test.mjs](test/host.test.mjs)：保存到提示词的行为、会话绑定变化、错误与卸载。
- [test/config.test.mjs](test/config.test.mjs)、[test/prompt.test.mjs](test/prompt.test.mjs)：存储安全、原样往返与空值渲染。
- [test/client.test.mjs](test/client.test.mjs)：设置块注册、读取失败与重试、校验与宿主一致、保存基线、失败保留草稿、晚返回不覆盖新草稿、清空。
- [package.json](package.json)、[cordis.patch.yml](cordis.patch.yml)：独立组件声明（含 `dsh.client`、`icon` 与客户端导出）。
- [README.md](README.md)：设置页用法、字段边界、调用格式与构建测试方式。
