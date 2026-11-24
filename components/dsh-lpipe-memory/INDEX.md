# 记忆管线

- [README](README.md)：在设置面板管理欲望、设定和生效范围。
- [Host 入口](src/index.js)：注册工具、提示词和设定快照钩子；在这里查主对话与顶层对话的判定。
- [服务](src/service.mjs) 与 [存储](src/store.mjs)：查面板 RPC、工具写入限制和本地状态格式。
- [设定快照](src/settings-context.mjs)：查每次模型请求如何加入、更新或移除设定。
- [Web 面板](client/panel.js)：查生效范围开关和两类记忆的管理界面。
- 回归：[Host](test/host.test.mjs)、[存储](test/store.test.mjs)、[客户端](test/client.test.mjs)。
