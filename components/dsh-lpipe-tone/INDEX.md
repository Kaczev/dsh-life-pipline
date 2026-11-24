# 语气管线导航

语气管线只依赖生命核心，在「Lpipe 设置」中填写并保存一句习惯用语。默认只为绑定的 LP 主会话生成语气提示词，也可切换为所有顶层对话。

- [src/index.js](src/index.js) 动态读取配置，按作用范围注入提示词，并在卸载时清理注册项。
- [src/config.mjs](src/config.mjs) 定义配置路径、习惯用语与作用范围的默认值、字段验证及原子保存。
- [src/prompt.mjs](src/prompt.mjs) 去掉习惯用语两端的空白，以固定句式生成 `## Tone` 段落。纯空白时跳过该段。
- [src/rpc.mjs](src/rpc.mjs) 通过现有 Fetch RPC 信封读写配置。
- [client/panel.js](client/panel.js) 提供单行习惯用语输入框、保存和撤回，以及独立保存的作用范围开关。见[客户端产物](lib/client.js)。
- [scripts/build-client.mjs](scripts/build-client.mjs) 把面板包成宿主的客户端模块壳。
- [assets/icon.png](assets/icon.png) 是三根渐变量柱组成的组件图标（512² 透明 PNG）。
- [test/host.test.mjs](test/host.test.mjs) 覆盖绑定主会话、顶层对话与子智能体的注入规则，以及错误与卸载。
- [test/config.test.mjs](test/config.test.mjs) 和 [test/prompt.test.mjs](test/prompt.test.mjs) 覆盖存储安全、旧字段保留、固定句式与空值渲染。
- [test/client.test.mjs](test/client.test.mjs) 覆盖设置块注册、开关与草稿独立保存、错误恢复及构建复现。
- [package.json](package.json) 和 [cordis.patch.yml](cordis.patch.yml) 声明独立组件、`dsh.client`、`icon` 与客户端导出。
- [README.md](README.md) 说明设置页用法、字段边界、调用格式与构建测试方式。
