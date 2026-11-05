# dsh-life-pipline · 开发笔记

DeepSeek Harness 的「生活管线」系列。当前阶段只做组件：每个 `dsh-lpipe-` 包都是独立插件，独立设计、独立验收；它们共同依赖公共包 `dsh-life-pipline`，后者提供设置里的「Lpipe 设置」这一页容器。

设计稿在 [`不入库/管线规划.md`](不入库/管线规划.md)，配置页视觉稿在 [`不入库/设计/dsh-life-chat-配置页.html`](不入库/设计/dsh-life-chat-配置页.html)。

## 结构

```
dsh-life-pipline/            # 公共包：自己也是一个 bundle 插件
├── package.json              # dsh.bundle（自己那一行）+ dsh.client（设置页壳）
├── cordis.patch.yml         # 只插 dsh-life-pipline 这一行
├── client/panel.js          # 「Lpipe 设置」整页容器（settings.section）
├── lib/client.js            # 构建产物（提交进仓库）
├── scripts/build-client.mjs  # 包模块壳
├── scripts/link-self.mjs     # 让 checkout 能按包名解析共享模块（test 前自动跑）
├── scripts/install-local.mjs # 把本包与 components/* 装进 profile
├── src/clock.mjs             # 共用时间规则，导出为 dsh-life-pipline/clock
└── components/
    ├── dsh-lpipe-chat/       # 组件：自己的 bundle + 自己的插件，依赖 dsh-life-pipline
        ├── package.json      # name / icon / exports / dsh.bundle / dsh.client / dependencies
        ├── cordis.patch.yml  # 只插自己这一行 → 插件列表里独立一张卡片
        ├── src/index.js      # 插件本体
        ├── client/panel.js   # chat 自己那块设置与主会话小气泡标记
        ├── lib/client.js     # 构建产物（提交进仓库）
        ├── locale/{en,zh}.json
        └── assets/icon.png   # 组件图标：两个气泡合流
    └── dsh-lpipe-wake/       # 组件：唤醒管线（同样自带 bundle 与 patch）
        ├── src/engine.mjs    # 三个时间戳与开关的唯一规则
        ├── src/runner.mjs    # 30s 心跳 → agent.followup
        ├── src/rpc.mjs       # /api/dsh-lpipe-wake
        ├── src/tools.mjs     # wake_set
        ├── client/panel.js   # 设置里的「唤醒管线」块（含开关）
        └── assets/icon.png   # 组件图标：日出与地平线
```

每个包带一份自己的 `cordis.patch.yml`，各插自己一行：

```yaml
# dsh-life-pipline
- insert:
    - id: dsh-life-pipline
      name: dsh-life-pipline

# components/dsh-lpipe-chat
- insert:
    - id: dsh-lpipe-chat
      name: dsh-lpipe-chat
```

公共包的那一行**只由它自己插**。组件不要替它插：两个 bundle 插同一个 id 会合成两条 id 相同的 entry（实测 `composeEntries` 不去重），客户端两份一起注册同一个 keyed 槽会报错。组件通过 `dependencies` 把公共包拉进来。

宿主里「bundle 不是插件行」——bundle 只贡献 patch，因此每个包要作为插件出现在列表里，就必须自带 patch、并自己被列进 profile 的 `dsh.profile.bundles`（脚本会替你做）。

行名必须写裸包名。写成 `dsh-life-pipline/xxx` 这类子路径，宿主解析不出包元信息，客户端半边会静默不加载。

## 显示名与图标

| 位置 | 包 | 显示名 | 图标 |
| --- | --- | --- | --- |
| 插件列表卡片（公共包） | `dsh-life-pipline` | **Life Pipline** | [`assets/icon.png`](assets/icon.png) |
| 插件列表卡片（组件） | `dsh-lpipe-chat` | **Lpipe Chat** | [`components/dsh-lpipe-chat/assets/icon.png`](components/dsh-lpipe-chat/assets/icon.png) |
| 插件列表卡片（组件） | `dsh-lpipe-wake` | **Lpipe Wake** / 唤醒管线 | [`components/dsh-lpipe-wake/assets/icon.png`](components/dsh-lpipe-wake/assets/icon.png) |
| 设置侧栏条目与页面标题 | 由 `dsh-life-pipline` 渲染整页 | **Lpipe 设置** | — |

标题和简介来自包导出的 `locale/en.json`、`locale/zh.json` 的 `meta.title` / `meta.description`，由宿主的 `readPluginMeta` 读取，缺失时才回退 `package.json` 的 `name` / `description`；图标来自 `package.json` 的 `icon` 字段，必须在包目录内、≤256 KiB。两条路径都要在 `exports` 里放行，否则宿主解析不到。

同一个包只能有一个身份：卡片、组件行都读包自己的元信息。想让每个组件都有自己的名字和图标，就必须各做一个包——这就是 `components/` 下按组件分包、并且每个包自带 patch 的原因。

图标用 ComfyUI（Krea 2 Turbo）出原型，再用 Photoshop 去白底、居中留白、缩到 512² 导出；候选留在 `不入库/设计/图标/candidates/`。亮形的几何图标（如唤醒的日出）可以直接用 PIL 画：写 `不入库/设计/图标/work/wake_icon.py` 这类脚本，4 倍超采样后降到 512²，颜色沿用同一套 `#6ecbbb` / `#7389d3`。

## 组件

| 组件 | 包 | 状态 |
| --- | --- | --- |
| 社交（微信 / QQ） | `dsh-lpipe-chat` | 已实现 |
| 唤醒 | `dsh-lpipe-wake` | 已实现 |
| 记忆、星图、回忆、联想、想象、B站 | — | 未开始 |

### dsh-lpipe-chat

自己持有微信（iLink 官方机器人协议）和 QQ（开放平台机器人）两条通道，不再依赖 dsh-im。

- **入站**：扫码接入 → 长轮询收消息 → 只放行主人 → 第一条立即注入，其后 `windowSeconds` 内的消息合并成一次注入。
- **注入**：独立来源 `dsh-lpipe-chat`、`form: notice` 的后台通知；通过 `sessionController.resolveAgent` 恢复目标会话，忙时 `agent.inject` 等下一步读取，空闲时 `agent.followup` 唤醒。不走普通用户 `prompt`，不使用 `steer`。
- **标注**：注入正文形如 `[微信 · Kaczev] 原文`，群聊为 `[QQ · 群 · 昵称] 原文`。
- **时间**：微信的分隔规则，实现在 `src/clock.mjs`（由公共包导出为 `dsh-life-pipline/clock`）。间隔不足 5 分钟不加时间；更久则在自己那一行写 `14:22` / `昨天 14:22` / `周二 14:22` / `11月1日 14:22` / `2025年11月1日 14:22`。时间永不落进消息正文，宿主重启时用归档里最后一条入站消息做基准，不重复播报已经见过的时间。
- **出站**：`chat_send` 按渠道回复；回不回由当轮决定。
- **记录**：`~/.dsh/life-chat/messages.jsonl`，append-only，进出都记，不改写。

数据目录仍然叫 `life-chat`，改名会丢已扫码的凭据，所以不动。

工具：`chat_send`、`chat_history`、`chat_login`、`chat_status`。

**配置页**：设置 → **Lpipe 设置**（宿主 `settings.section` 槽，`id: lpipe`、`order: 60`）。整个 `dsh-lpipe-` 系列只有这一个侧栏条目：这一页由公共包 `dsh-life-pipline` 渲染，它声明子槽 `lpipe.settings.panel`（`kind: 'list'`），每个组件把自己的那一块注册进去，按 `order` 从上往下排——加组件不需要新增侧栏条目，也不改这一页的代码。主会话 id 输入并回显会话标题、兜窗口秒数、微信/QQ 状态与扫码接入（二维码直接画在页面上，需要配对码时出现输入框）。主会话在会话栏的行首带一枚小气泡标记（`assets/session-mark.png`，青蓝对半，内联成 data URL；挂在宿主的 `sidebar.session.row.leading` 槽位上，按 `sessionId` 判断是不是主会话）。面板只用宿主的 `--dsw-alias-*` 设计 token，深浅色主题跟着宿主走。

配置页通过 Host 的 `/api/dsh-lpipe-chat` 管理通道与页面通信（`chat.status` / `chat.config.save` / `chat.session.title` / `chat.login.begin` / `chat.login.state` / `chat.login.code` / `chat.login.cancel`），凭据只留在 Host 侧，页面只能看到「已连接/未连接」。

客户端只有一份 `client/panel.js`，构建即包一层模块壳：

```bash
node components/dsh-lpipe-chat/scripts/build-client.mjs   # → lib/client.js（提交进仓库，link 安装无需构建）
```

## 加一个组件

1. `components/<包名>/` 建包，`package.json` 里写 `name`、`icon`、`exports`（含 `./icon`、`./locale/en.json`、`./locale/zh.json`）、`dsh.bundle.patch`、`dsh.client`，并把 `dsh-life-pipline` 写进 `dependencies`（它提供设置页）。
2. `locale/{en,zh}.json` 写 `meta.title` / `meta.description`。
3. 包里放 `cordis.patch.yml`，一行插自己（`id` 与 `name` 都用裸包名）。
4. 设置页不用新建侧栏条目：往 `lpipe.settings.panel` 槽注册一块即可——`ctx.slots.inject('lpipe.settings.panel', () => ctx.slots.register({ name: 'lpipe.settings.panel', id: '<组件短名>', order: 20, inject: () => ({ rpcCall }) }, 你的面板))`。`id` 在同一槽内唯一，`order` 决定上下顺序。
5. 跑 `node scripts/install-local.mjs` 重新装进 profile（脚本会把公共包与每个组件都列进 `dsh.profile.bundles`）。

## 安装

**安装任何 `dsh-lpipe-` 组件之前必须先安装 `dsh-life-pipline`**。它负责注册整页「Lpipe 设置」与公共部分；组件只负责往那一页里添加自己的配置项。没装公共包就是安装方式不完整，组件不会自己去补一个页面出来。

安装顺序：先公共包，再组件。两者都是 bundle，都需要在插件页启用一次（或用下面的 `install-local`，它会把两者都写进 `dsh.profile.bundles`）。

## 安装到本机 profile（开发）

```bash
node scripts/install-local.mjs          # 写入 profile package.json 并 pnpm install
# 然后重启 DeepSeek Harness
```

脚本把整合包和 `components/*` 逐个以 `link:` 写进 profile 的依赖，也逐个列进 `dsh.profile.bundles`（同时清掉旧的 `dsh-life-piplines`），再 `pnpm install`。`--revert` 撤销，`--no-install` 只改清单，执行前会备份 profile 的 `package.json`。

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
node --test "test/*.test.mjs" "components/*/test/*.test.mjs"
```

## 收编说明

见 [`vendor/MANIFEST.md`](vendor/MANIFEST.md)：微信协议层取自 dsh-im 5.9.1（MIT），QQ 用官方 SDK。

### dsh-lpipe-wake

- **规则**（`src/engine.mjs` 的纯函数 `step`，测试直接打这里）：
  - 开关关掉 → `nextWakeAt = null`，什么都不决定。
  - 我开始活动（`status !== 'idle'`）→ `nextWakeAt = null`、`lastActivityEndedAt = null`。
  - 空闲且没有结束时间 → 以此刻为结束时间，`nextWakeAt = now + interval`。
  - 空闲且没有截止时间 → `nextWakeAt = lastActivityEndedAt + interval`。
  - `now >= nextWakeAt` → 注入一条，然后从这一刻重新起算（否则旧基准会让下一个心跳再醒一次，形成循环）。
  - 跨过午夜后，句子不再说「已经过了 62 小时」，而是用同一套时间写法说「10月26日 21:00 之后你就停下来了，现在是 09:12」。
- **心跳**：`src/runner.mjs` 每 30 秒读一次 `sessionController.resolveAgent(主会话)` 的 `status`；投递走 `agent.followup`，与 chat 同一条路径，只在对方 `idle` 时发。
- **投递**：`source.kind = 'dsh-lpipe-wake'`、`form: 'notice'`，正文是「（自己醒来）已经过了 2 小时 06 分，现在是 23:47。想做什么就做什么，没事也可以什么都不做。」——陈述，不带指令。
- **状态**：`~/.dsh/life-wake/state.json`，`{ enabled, defaultIntervalMs, lastActivityEndedAt, nextWakeAt, lastWokeAt, lastSeenAt }`，0600。
- **公共配置**：主会话与 chat 共用 `~/.dsh/life-pipline/config.json`，同一处配置，不重复填。
- **工具**：`wake_set` 接受 `in`（`45m`）、`at`（ISO 时刻）、`clear`，无参只读；时长与时刻随意，过去的时间就是下一次心跳立刻醒。
- **设置块**：`lpipe.settings.panel` 的 `id: 'wake'`、`order: 20`；标题右侧是开关，关掉时卡片变淡并写明「不会自行醒来」。
