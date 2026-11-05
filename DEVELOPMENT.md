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
        ├── client/panel.js   # chat 自己那块设置
        ├── lib/client.js     # 构建产物（提交进仓库）
        ├── locale/{en,zh}.json
        └── assets/icon.png   # 组件图标：两个气泡合流
    └── dsh-lpipe-wake/       # 组件：唤醒管线（同样自带 bundle 与 patch）
        ├── src/engine.mjs    # 自然 / 主动两种唤醒的唯一规则
        ├── src/runner.mjs    # 30s 心跳 → agent.followup
        ├── src/rpc.mjs       # /api/dsh-lpipe-wake
        ├── src/tools.mjs     # wake_set / wake_check
        ├── client/panel.js   # 设置里的「唤醒管线」块（两个开关）
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

## 通知触发的轮次

微信 / QQ 批次（`source.kind = 'dsh-lpipe-chat'`）与唤醒通知（`source.kind = 'dsh-lpipe-wake'`）都可能在主人离开电脑时把主会话叫起来。宿主的 `ask_user_question` 是阻塞的：它要等到 UI provider 返回一个人类答案，所以这种轮次里问出去会把整轮挂住，连后续消息与唤醒一起堵。

三层兜住：

1. **系统提示词（英文）**：chat 与 wake 各自 `systemPrompt.context` 注入一条规则——这种轮次不要调用 `ask_user_question`。聊天那侧另有两条：`chat_send` 之后不要在宿主里重复同样的话；`completed: true` 可以当场收尾。
2. **硬拦截**：公共包在 `tools/pre-execute` 上挂 `createAwayGuard()`（`src/away-guard.mjs`），只处理 `ask_user_question`；判断依据是 `exec.agent.session` 里**最新一条 `user/message` 的 `source.kind`**，属上面两种就返回 `{ kind: 'deny', reason: AWAY_REASON }`，理由全英。不维护「本轮是 IM 触发」这种内存标记，重启也不会残留。
3. **回退**：真要在远场逐层降级，可以把宿主的 `ask_user_question` 改成 `mode: 'timed'`，超时返回 pending 结果而不是跳过。

`AWAY_REASON` 让模型知道下一步该怎么做：把问题写成纯文本发出去（IM 轮次用 `chat_send`），或者自己先决定。拒绝只在「最新一条用户消息」是通知时生效——主人自己在 GUI 里打字问的轮次不受影响。

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
- **出站**：`chat_send` 按渠道回复；回不回由当轮决定。`completed` 是选填布尔（默认 false）：发送成功且为 true 时调用 `exec.concludeTurn()`，这一轮当场结束，不再产生一次「在宿主里复述」的请求；发送失败不 conclude，错误照常抛出。
- **记录**：`~/.dsh/life-chat/messages.jsonl`，append-only，进出都记，不改写。

数据目录仍然叫 `life-chat`，改名会丢已扫码的凭据，所以不动。

工具：`chat_send`、`chat_history`、`chat_login`、`chat_status`。

**配置页**：设置 → **Lpipe 设置**（宿主 `settings.section` 槽，`id: lpipe`、`order: 60`）。整个 `dsh-lpipe-` 系列只有这一个侧栏条目：这一页由公共包 `dsh-life-pipline` 渲染，它声明子槽 `lpipe.settings.panel`（`kind: 'list'`），每个组件把自己的那一块注册进去，按 `order` 从上往下排——加组件不需要新增侧栏条目，也不改这一页的代码。主会话 id 输入并回显会话标题、兜窗口秒数、微信/QQ 状态与扫码接入（二维码直接画在页面上，需要配对码时出现输入框）。主会话在会话栏的行首带一枚小气泡标记（公共包根目录的 `assets/session-mark.png`，青蓝对半，内联成 data URL；挂在宿主的 `sidebar.session.row.leading` 槽位上，按 `sessionId` 判断是不是主会话）。这枚标记归公共包：主会话是共用状态，组件不各自去占这个座位。面板只用宿主的 `--dsw-alias-*` 设计 token，深浅色主题跟着宿主走。

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

两种唤醒彼此独立，各有一个开关、各自的数值（`src/engine.mjs` 的纯函数 `step`，测试直接打这里）：

**自然唤醒**

- 基准来自主会话事件日志：`lastActivityEndedAt` 取最新一条事件的 `time`（`src/session-activity.mjs`，导出为 `dsh-life-pipline/session`）。日志比我们自己的运行时长更可信，宿主重启不会把你说过的话抹掉。
- 新事件出现 → 基准前移，`nextWakeAt = lastActivityEndedAt + interval` 跟着重算，所以不存在「到点但我还在活动」。
- 没有结束时间（新会话）→ 以此刻为结束时间，`nextWakeAt = now + interval`。
- `now >= nextWakeAt` 且我空闲 → 注入一条，然后从这一刻重新起算（否则旧基准会让下一个心跳再醒一次，形成循环）；我还在跑就不发，等下一个心跳再看。
- `naturalEnabled === false` → 不触发，但时间照算、照显示。
- 跨过午夜后，句子不再说「已经过了 62 小时」，而是用同一套时间写法说「10月26日 21:00 之后你就停下来了，现在是 09:12」。

**主动唤醒**

- 一条独立的列表 `plannedWakes: [{ id, at, reason, createdAt }]`，由 `wake_set` / 设置页写入，上限 20 条。
- 我活动不会取消它——这正是「惊喜」能成立的前提。到点且我空闲就发，发完从列表里删掉。
- 正文带上缘由：「（主动醒来）我给自己定的时间是 20:30。／我留给这一刻的话：提醒他吃晚上的药。」
- `manualEnabled === false` → 到点也不发，列表原样保留。

**共用**

- **心跳**：`src/runner.mjs` 每隔 `heartbeatMs`（默认 30 秒）读一次主会话的最新事件时间（`sessions` 服务）与 `sessionController.resolveAgent(主会话)` 的 `status`；投递走 `agent.followup`，与 chat 同一条路径，只在对方 `idle` 时发。
- **状态**：`~/.dsh/life-wake/state.json`，`{ naturalEnabled, manualEnabled, defaultIntervalMs, heartbeatMs, lastActivityEndedAt, nextWakeAt, plannedWakes, lastWokeAt, lastWokeKind, lastWokeReason, lastSeenAt }`，0600。
- **RPC**：`wake.status`、`wake.config.save`（两个开关 / 间隔 / 心跳）、`wake.plan`、`wake.cancel`、`wake.tick`。
- **公共配置**：主会话与 chat 共用 `~/.dsh/life-pipline/config.json`，同一处配置，不重复填。
- **锁**：`naturalLockUntil` 是「我自愿不出声」的到期时刻，压住自然唤醒而不动开关；`现在 >= 锁的时刻` 时引擎在同一跳把它清空。
- **计时**：永远比时间戳（`now >= deadline`），心跳只决定多久看一次；不累加倒计时，掉帧与休眠都不会造成偏移。
- **工具**：`wake_set`（`in` / `at` + `reason`，`cancel` 取消一条或全部，`lock` / `unlock` 设定时锁）、`wake_check`（只读：下次主动唤醒及其缘由 + 下次自然唤醒，含是否锁着）。
- **设置块**：`lpipe.settings.panel` 的 `id: 'wake'`、`order: 20`；第一行两张卡（自然 / 主动）各带自己的开关，第二行是默认间隔与心跳间隔。
- **不用宿主的 schedule**：它按墙钟走、有自己的开关、投递的是普通用户消息，表达不了「从我停下那一刻起算」。
