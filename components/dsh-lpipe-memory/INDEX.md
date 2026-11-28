# 记忆管线

- [README](README.md)：在设置面板管理欲望、设定和生效范围。
- [Host 入口](src/index.js)：注册工具、提示词和设定快照钩子；在这里查主对话与顶层对话的判定。
- [服务](src/service.mjs) 与 [存储](src/store.mjs)：查面板 RPC、工具写入限制和本地状态格式。
- [上下文快照](src/settings-context.mjs)：查看设定清单与情景目录的去重、未选择情景时的提醒，以及空情景和长期未加载情景的标记。
- [回忆工具](src/recollection-tools.mjs)：查看英文系统提示、情景查询与选择、条目写入及回执。当前情景按会话保存在存储中。
- [模型清单](src/model-list.mjs) 与 [工具回执](src/tools.mjs)：查设定、欲望在模型上下文中的正文、ID 与数据边界。
- [Web 面板](client/panel.js)：查顶层共享总开关、各页签的共享选择和清单编辑界面。
- [定时回顾](src/review.mjs) 与[回顾测试](test/review.test.mjs)：查看主会话的类别选择、空清单跳过和投递重试。
- 回归：[Host](test/host.test.mjs)、[存储](test/store.test.mjs)、[客户端](test/client.test.mjs)。
