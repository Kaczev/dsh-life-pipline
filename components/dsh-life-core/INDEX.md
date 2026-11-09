# Life Core 导航

公共核心，不依赖任何业务管线。保留原有 `life-pipline` 数据目录、RPC 名称和设置槽位。

- [package.json](package.json)：公共子路径导出与独立 bundle 元信息。
- [index.js](index.js)：公共 RPC、远场问答保护和前置协调注册。
- [src/dependencies.mjs](src/dependencies.mjs)：唯一依赖图、规范 bundle 选择和事件驱动开关联动。
- [src/components.mjs](src/components.mjs)：聚合详情页使用的规范组件管理动作，按前置／下游顺序切换。
- [src/config.mjs](src/config.mjs) / [src/paths.mjs](src/paths.mjs)：兼容现有配置与主会话绑定。
- [src/rpc.mjs](src/rpc.mjs)：公共设置、工作区选择和主会话创建。
- [client/panel.js](client/panel.js)：共享设置页与主会话标记；[构建脚本](scripts/build-client.mjs)。
- [README.md](README.md)：安装和数据兼容说明。
- [依赖测试](../../test/dependencies.test.mjs)：单装补齐、级联关闭与重新开启。
