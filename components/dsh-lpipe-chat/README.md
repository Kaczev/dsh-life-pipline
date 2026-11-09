# dsh-lpipe-chat

DeepSeek Harness 组件：自己握有微信与 QQ 两条通道，把消息合并后注入主会话。

本组件只负责往「Lpipe 设置」里添加自己那一块；那个页面由公共包 [`dsh-life-pipline`](https://www.npmjs.com/package/dsh-life-pipline) 注册。**安装本组件前必须先安装 `dsh-life-pipline`**（它同时在本包的 `dependencies` 里），否则设置里不会有「Lpipe 设置」页。

## 做什么

- **接入**：微信走 iLink 官方机器人协议，QQ 走开放平台机器人，各自扫码登录，凭据只留在 Host 侧。
- **收消息**：长轮询，只放行主人。两个计时：**合并间隔** `quietSeconds`（默认 1 秒）决定一口气发来的几条何时算说完；**收集窗口** `windowSeconds`（默认 5 秒）在每串送出后继续攒，窗口末尾合并成一次补上。两者都到点才送达。
- **注入**：以 `[微信 · 名字] 原文` 的后台通知形式进入主会话；忙时等下一步读取，空闲时唤醒。
- **回消息**：模型调用 `chat_send` 才算发送。仅主会话获得自主聊天授权，无需逐次询问；主动消息只能发给经核验的 Owner 私聊，其他参与者可以在已有对话中回复。此限制属于系统提示词规则，不是新增的发送拦截器。
- **Owner**：名字在 Chat 设置中填写，仅作称呼；只有插件根据平台 ID 添加的 `(Owner)` 消息头才证明 Owner 身份。首次读取时兼容 Home 的旧名字，优先保留 Chat 已有名字；迁移后清空不会重新填入旧值。
- **记录**：`~/.dsh/life-chat/messages.jsonl`，append-only。
- **配置页**：设置 → **Lpipe 设置**（`settings.section` 槽，不再挂在插件详情页里）。整页由公共包托管，并声明子槽 `lpipe.settings.panel`；本组件把自己的「Lpipe Chat」一块注册进去，改两个计时秒数、扫码接入。
- **重连**：卡片上的「已连接」是此刻真的连着，「未连接」会附带最后一次失败原因。卡片常驻「重新连接」（用已存凭据重开通道）与「重新扫码」（换一个账号）；服务端把 token 作废后，前者会失败、后者仍能救回来。
- **标记**：主会话在会话栏里带一枚青蓝对半的小气泡——那枚标记由 `dsh-life-pipline` 提供，因为主会话是公共设置。

工具：`chat_send`、`chat_history`、`chat_login`、`chat_status`。

## 安装

先装公共包，再装本组件（插件页里搜名字，或）：

```bash
pnpm add dsh-life-pipline
pnpm add dsh-lpipe-chat
```

未安装 `dsh-life-pipline` 就不会有「Lpipe 设置」页，本组件的配置也就无处可放——那属于安装方式不完整，不是组件的猫病。

