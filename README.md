# dsh-life-pipline

鲸鲸（Kaczev 的助手）的"Dsh 生活管线"。每个组件独立设计、独立验收，共用一个包。

设计稿在 [`不入库/管线规划.md`](不入库/管线规划.md)，配置页视觉稿在 [`不入库/设计/dsh-life-chat-配置页.html`](不入库/设计/dsh-life-chat-配置页.html)。

## 组件

| 组件 | ID | 状态 |
| --- | --- | --- |
| 社交（微信 / QQ） | `dsh-life-chat` | 实现中 |
| 记忆、星图、回忆、联想、想象、唤醒、B站 | — | 未开始 |

## dsh-life-chat

自己持有微信（iLink 官方机器人协议）和 QQ（开放平台机器人）两条通道，不再依赖 dsh-im。

- **入站**：扫码接入 → 长轮询收消息 → 只放行主人 → 第一条立即注入，其后 `windowSeconds` 内的消息合并成一次注入。
- **注入**：`sessionController.prompt(..., mode: queue)`，落在一次请求结束之后（followup 语义），不切当前输出。
- **标注**：注入正文形如 `[微信 · Kaczev] 原文`，群聊为 `[QQ · 群 · 昵称] 原文`。
- **出站**：`chat_send` 按渠道回复；回不回由当轮决定。
- **记录**：`~/.dsh/life-chat/messages.jsonl`，append-only，进出都记，不改写。

工具：`chat_send`、`chat_history`、`chat_login`、`chat_status`。

**配置页**：设置 → 插件 → `dsh-life-pipline` 的详情正文里（`plugins.bundle.config` 槽，按包名挂载）。主会话 id 输入并回显会话标题、兜窗口秒数、微信/QQ 状态与扫码接入（二维码直接画在页面上，需要配对码时出现输入框）。主会话在会话栏带 📌。面板只用宿主的 `--dsw-alias-*` 设计 token，深浅色主题跟着宿主走。

配置页通过 Host 的 `/api/dsh-life-chat` 管理通道与页面通信（`chat.status` / `chat.config.save` / `chat.session.title` / `chat.login.begin` / `chat.login.state` / `chat.login.code` / `chat.login.cancel`），凭据只留在 Host 侧，页面只能看到"已连接/未连接"。

客户端只有一份 `src/client/panel.js`，构建即包一层模块壳：

```bash
node scripts/build-client.mjs   # → lib/client.js（提交进仓库，link 安装无需构建）
```

## 安装到本机 profile

```bash
node scripts/install-local.mjs          # 写入 profile package.json 并 pnpm install
# 然后重启 DeepSeek Harness
```

`--revert` 撤销，`--no-install` 只改清单。脚本会先备份 profile 的 `package.json`。

## 配置

`~/.dsh/life-chat/config.json`：

```json
{
  "mainSessionId": "",
  "windowSeconds": 5,
  "ownerOnly": true,
  "ownerName": "",
  "weixin": { "enabled": true, "botToken": "", "accountId": "", "ownerUserId": "", "baseUrl": "https://ilinkai.weixin.qq.com/" },
  "qq": { "enabled": true, "appId": "", "appSecret": "", "ownerOpenId": "" }
}
```

凭据为空时不会连接，所以装上之后不会和 dsh-im 抢同一条通道；扫码成功后才开始抢。`chat_status` 会读出 `~/.dsh/integrations` 里 dsh-im 的账号，提示还有哪条通道没交接，避免两个轮询器互相踢。

## 收编说明

见 [`vendor/MANIFEST.md`](vendor/MANIFEST.md)：微信协议层取自 dsh-im 5.9.1（MIT），QQ 用官方 SDK。
