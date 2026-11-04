# dsh-life-pipline

鲸鲸（Kaczev 的助手）的「Dsh 生活管线」。一个 bundle 包装清单，每个组件是独立包，独立设计、独立验收。

设计稿在 [`不入库/管线规划.md`](不入库/管线规划.md)，配置页视觉稿在 [`不入库/设计/dsh-life-chat-配置页.html`](不入库/设计/dsh-life-chat-配置页.html)。

## 结构

```
dsh-life-pipline/            # bundle：只有清单，没有实现
├── package.json              # dsh.bundle.patch → cordis.patch.yml
├── index.js                  # 只是导出名字，不是插件
├── cordis.patch.yml          # 一行挂一个组件包
├── locale/{en,zh}.json       # bundle 自己的显示名与简介
├── assets/icon.png           # bundle 图标：心形带子
└── components/
    └── dsh-lpipe-chat/       # 组件：真正的插件包
        ├── package.json      # name / icon / exports / dsh.client
        ├── src/index.js      # 插件本体
        ├── client/panel.js   # 配置页源码
        ├── lib/client.js     # 构建产物（提交进仓库）
        ├── locale/{en,zh}.json
        └── assets/icon.png   # 组件图标：两个气泡合流
```

`cordis.patch.yml` 一行对应一个组件包：

```yaml
- insert:
    - id: dsh-lpipe-chat
      name: dsh-lpipe-chat
```

行名必须写裸包名。写成 `dsh-life-pipline/xxx` 这类子路径，宿主解析不出包元信息，客户端半边会静默不加载。

## 显示名与图标

| 位置 | 包 | 显示名 | 图标 |
| --- | --- | --- | --- |
| 插件列表卡片 | `dsh-life-pipline` | **Life Pipline** | [`assets/icon.png`](assets/icon.png) |
| 「包含的组件」行 | `dsh-lpipe-chat` | **Life Chat** | [`components/dsh-lpipe-chat/assets/icon.png`](components/dsh-lpipe-chat/assets/icon.png) |
| 组件配置页标题 | `dsh-lpipe-chat` | **Life Chat** | — |

标题和简介来自包导出的 `locale/en.json`、`locale/zh.json` 的 `meta.title` / `meta.description`，由宿主的 `readPluginMeta` 读取，缺失时才回退 `package.json` 的 `name` / `description`；图标来自 `package.json` 的 `icon` 字段，必须在包目录内、≤256 KiB。两条路径都要在 `exports` 里放行，否则宿主解析不到。

同一个包只能有一个身份：卡片、组件行、配置页槽都读包自己的元信息。想让两个组件在同一张卡片下各显其名，就必须各做一个包——这就是 `components/` 下按组件分包的原因。

图标用 ComfyUI（Krea 2 Turbo）出原型，再用 Photoshop 去白底、居中留白、缩到 512² 导出；候选留在 `不入库/设计/图标/candidates/`。

## 组件

| 组件 | 包 | 状态 |
| --- | --- | --- |
| 社交（微信 / QQ） | `dsh-lpipe-chat` | 实现中 |
| 记忆、星图、回忆、联想、想象、唤醒、B站 | — | 未开始 |

### dsh-lpipe-chat

自己持有微信（iLink 官方机器人协议）和 QQ（开放平台机器人）两条通道，不再依赖 dsh-im。

- **入站**：扫码接入 → 长轮询收消息 → 只放行主人 → 第一条立即注入，其后 `windowSeconds` 内的消息合并成一次注入。
- **注入**：独立来源 `dsh-lpipe-chat`、`form: notice` 的后台通知；通过 `sessionController.resolveAgent` 恢复目标会话，忙时 `agent.inject` 等下一步读取，空闲时 `agent.followup` 唤醒。不走普通用户 `prompt`，不使用 `steer`。
- **标注**：注入正文形如 `[微信 · Kaczev] 原文`，群聊为 `[QQ · 群 · 昵称] 原文`。
- **出站**：`chat_send` 按渠道回复；回不回由当轮决定。
- **记录**：`~/.dsh/life-chat/messages.jsonl`，append-only，进出都记，不改写。

数据目录仍然叫 `life-chat`，改名会丢已扫码的凭据，所以不动。

工具：`chat_send`、`chat_history`、`chat_login`、`chat_status`。

**配置页**：设置 → 插件 → Life Pipline 的详情正文里（`plugins.bundle.config` 槽，按 bundle 包名 `dsh-life-pipline` 挂载）。主会话 id 输入并回显会话标题、兜窗口秒数、微信/QQ 状态与扫码接入（二维码直接画在页面上，需要配对码时出现输入框）。主会话在会话栏带 📌。面板只用宿主的 `--dsw-alias-*` 设计 token，深浅色主题跟着宿主走。

配置页通过 Host 的 `/api/dsh-lpipe-chat` 管理通道与页面通信（`chat.status` / `chat.config.save` / `chat.session.title` / `chat.login.begin` / `chat.login.state` / `chat.login.code` / `chat.login.cancel`），凭据只留在 Host 侧，页面只能看到「已连接/未连接」。

客户端只有一份 `client/panel.js`，构建即包一层模块壳：

```bash
node components/dsh-lpipe-chat/scripts/build-client.mjs   # → lib/client.js（提交进仓库，link 安装无需构建）
```

## 加一个组件

1. `components/<包名>/` 建包，`package.json` 里写 `name`、`icon`、`exports`（含 `./icon`、`./locale/en.json`、`./locale/zh.json`）、`dsh.client`。
2. `locale/{en,zh}.json` 写 `meta.title` / `meta.description`。
3. `cordis.patch.yml` 加一行，`name` 用裸包名。
4. 跑 `node scripts/install-local.mjs` 重新装进 profile。

## 安装到本机 profile

```bash
node scripts/install-local.mjs          # 写入 profile package.json 并 pnpm install
# 然后重启 DeepSeek Harness
```

脚本把 bundle 和 `components/*` 逐个以 `link:` 写进 profile 的依赖（同时清掉旧的 `dsh-life-pipline`），再 `pnpm install`。`--revert` 撤销，`--no-install` 只改清单，执行前会备份 profile 的 `package.json`。

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

## 测试

```bash
node --test "components/*/test/*.test.mjs"
```

## 收编说明

见 [`vendor/MANIFEST.md`](vendor/MANIFEST.md)：微信协议层取自 dsh-im 5.9.1（MIT），QQ 用官方 SDK。
