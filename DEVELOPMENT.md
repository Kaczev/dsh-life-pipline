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
    └── dsh-lpipe-memory/     # 组件：记忆管线（会话原文落盘，哈希链可校验）
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
| 记忆 | `dsh-lpipe-memory` | M1 已实现（写入 / 读取 / 校验 / 按天媒体包 / 冷日打包） |
| 星图 | `dsh-lpipe-starmap` | M1 已实现（词表 / 抽星 / 星表与星源 / 水位 / 只读查询） |
| 回忆、联想、想象、B站 | — | 未开始 |

### dsh-lpipe-chat

自己持有微信（iLink 官方机器人协议）和 QQ（开放平台机器人）两条通道，不再依赖 dsh-im。

- **入站**：扫码接入 → 长轮询收消息 → 只放行主人 → 两个计时。**合并间隔** `quietSeconds`（默认 1 秒）：每来一条都把截止时刻推到「现在 + 合并间隔」，要安静满它这一串才算说完。**收集窗口** `windowSeconds`（默认 5 秒）：一串送出后开一个窗口，窗口内继续来的消息先攒着，到窗口末尾再合并补一次。送达条件是 `Date.now() >= max(两个截止时刻)`——两个都到点才发。定时器只负责醒来比时间戳。
- **注入**：独立来源 `dsh-lpipe-chat`、`form: notice` 的后台通知；通过 `sessionController.resolveAgent` 恢复目标会话，忙时 `agent.inject` 等下一步读取，空闲时 `agent.followup` 唤醒。不走普通用户 `prompt`，不使用 `steer`。
- **标注**：注入正文形如 `[微信 · Kaczev] 原文`，群聊为 `[QQ · 群 · 昵称] 原文`。
- **时间**：微信的分隔规则，实现在 `src/clock.mjs`（由公共包导出为 `dsh-life-pipline/clock`）。间隔不足 5 分钟不加时间；更久则在自己那一行写 `14:22` / `昨天 14:22` / `周二 14:22` / `11月1日 14:22` / `2025年11月1日 14:22`。时间永不落进消息正文，宿主重启时用归档里最后一条入站消息做基准，不重复播报已经见过的时间。
- **出站**：`chat_send` 按渠道回复；回不回由当轮决定。`completed` 是选填布尔（默认 false）：发送成功且为 true 时调用 `exec.concludeTurn()`，这一轮当场结束，不再产生一次「在宿主里复述」的请求；发送失败不 conclude，错误照常抛出。
- **图片**：一条消息里的图会被下载、按魔数认格式（png / jpeg / webp / gif），交给宿主的 `attachments` 服务落成附件，再作为 `image` 内容块挂在同一条通知上——文字和图片是同一条消息。微信的图是密文（AES-128-ECB + `aeskey`），解密在 `src/weixin/vendor/weixin-api.mjs`；QQ 的图是 CDN 链接，只走 HTTPS、不跟随重定向。单图上限 8 MB、一批最多 4 张（`src/images.mjs` 的 `MAX_IMAGE_BYTES` / `MAX_IMAGES_PER_MESSAGE`）。单张图失败只丢这张并记一条 warn，不拖累这条消息；存不下时正文会补一句「N 张图片没能取过来：…」。
- **记录**：`~/.dsh/life-chat/messages.jsonl`，append-only，进出都记，不改写。图片只在归档里留 `{name, mediaType, bytes}` 三个事实，字节不进日志；`chat_history` 会把它们显示成「（N 张图片）」。

数据目录仍然叫 `life-chat`，改名会丢已扫码的凭据，所以不动。

工具：`chat_send`、`chat_history`、`chat_login`、`chat_status`。

**配置页**：设置 → **Lpipe 设置**（宿主 `settings.section` 槽，`id: lpipe`、`order: 60`）。整个 `dsh-lpipe-` 系列只有这一个侧栏条目：这一页由公共包 `dsh-life-pipline` 渲染，它声明子槽 `lpipe.settings.panel`（`kind: 'list'`），每个组件把自己的那一块注册进去，按 `order` 从上往下排——加组件不需要新增侧栏条目，也不改这一页的代码。主会话 id 输入并回显会话标题、合并间隔与收集窗口秒数、微信/QQ 状态与扫码接入（二维码直接画在页面上，需要配对码时出现输入框）。主会话在会话栏的行首带一枚小气泡标记（公共包根目录的 `assets/session-mark.png`，青蓝对半，内联成 data URL；挂在宿主的 `sidebar.session.row.leading` 槽位上，按 `sessionId` 判断是不是主会话）。这枚标记归公共包：主会话是共用状态，组件不各自去占这个座位。面板只用宿主的 `--dsw-alias-*` 设计 token，深浅色主题跟着宿主走。

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
  "quietSeconds": 1,
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

### 导入网页历史

`components/dsh-lpipe-memory/scripts/import-deepseek-web.mjs` 读 DeepSeek 网页版的 `history_messages` JSON，投影成 `user/message` / `assistant/message` / `tool/call` / `tool/result` 四类行，直接写进同一个记忆根（`~/.dsh/life-memory`）。网页消息的片段类型：`REQUEST`、`RESPONSE`、`THINK`、`FILE`（只有名字）、`TOOL_SEARCH`、`TOOL_OPEN`、`TIP`（丢弃）。

### 记忆大小的显示

`components/dsh-lpipe-memory/src/stats.mjs` 逐轮累计字节（行 JSON + 去重后的 media），`createStatsCache` 按 `state.seq` 缓存；`src/rpc.mjs` 在 `/api/dsh-lpipe-memory` 上暴露只读的 `memory.stats`；`client/panel.js` 往 `lpipe.settings.panel` 注册一块（id `memory`、order 30），画总量、最近一轮增量与最近 30 轮的累计曲线，纵横轴都按数据自适应。落盘后 `index.js` 会 `reader.reload()` 并清缓存，页面下一次轮询就看得见新的一轮。

### 记忆行的格式（v2）

一行只存一遍：正文进 `text`，思考进 `reasoning`，`parts` 只留「文本之外」的结构块（图片、文件引用、工具的结构化结果）。早期版本把文本块也复制进 `parts`，实测占过整库体积的 42%；现在 `project()` 的 `carriedParts()` 会滤掉 `text` / `reasoning` 两种块，导入脚本也不再写它们。

格式版本记在 `state.json` 的 `version`。`src/compact.mjs` 提供 `compact({ root })`（整库重建：行照旧、`seq` 照旧，重新焊哈希链，旧目录改名成 `<root>.bak-<时间>`，并保留 `lastEventSeq` 游标与 `meta.title`）与 `migrateIfNeeded({ root })`；`index.js` 在创建 writer 之前调用它，所以旧库会在宿主启动时自动升级一次，失败只 warn、继续用旧格式。

## 宿主约定：写日志的方式

Cordis 的 `LoggerService` 本身是可调用对象，`info` / `warn` 内部会先执行 `this()` 拿到带名字的 logger，再把日志交给它。所以插件里只能写成员调用：

```js
if (typeof ctx.logger?.info === 'function') ctx.logger.info(message)
else if (typeof ctx.logger?.warn === 'function') ctx.logger.warn(message)
```

把方法取出来再调用（`const sink = ctx.logger.info; sink(msg)`、`(ctx.logger?.info ?? ctx.logger?.warn)?.(msg)`）会丢掉 `this`，严格模式下抛 `TypeError: this is not a function`。宿主把插件加载期的异常当成 `dsh: fatal load failure`，整个进程退出——2026-11-06 16:08 打不开就是这么来的。日志函数本身也包一层 `try/catch`：写日志失败绝不能反过来带走宿主。

异步任务同理：`setTimeout` / `Promise` 里的异常不会被同步 `try/catch` 接住，必须挂 `.catch`（星图的 `run()` 就是这样做的），否则未处理的拒绝同样会被当成致命加载失败。

## components/dsh-lpipe-starmap

星图是**索引层**：读记忆层的原文，按轮抽出概念（星星），记下「哪一句同时提到了哪几颗星」。它不存正文、不写摘要、不做向量；删掉能重建。

- **构建单位是一轮**：每轮 `turn/end` 之后延迟 1.5 秒（等记忆层先落盘）读一次记忆，把这一轮里还没有星源的行接过来抽星。重启后补做全部灰记忆。
- **灰与亮**：`state.json` 的 `built[sessionId] = { turn, to }`。先写星表、星源，最后才抬水位；崩在中间，重启重算那一轮。
- **星星从哪来：问模型**。每轮把原文（带上「用户 / 助手 / 工具」说话人）发给模型，只问一件事：这一轮里哪两个概念一起出现过，答成 `[["记忆管线","星图"], …]`。规则写在 `src/llm.mjs` 的 `SYSTEM_PROMPT` 里：名字必须原样摘自原文、不要翻译或同义替换、最多 60 对、只输出 JSON 数组。
- **只有模型说过的对子才算数**：对子两端都要在同一轮的原文里找到（大小写与全角不敏感），找不到的整对丢弃，记进 `rejects.jsonl`（`{ at, session, turn, pair, why }`），方便回头分析模型为什么错。
- **匹配得到的三种星线**（`src/build.mjs` + `src/query.mjs`）：模型说的一对是一根**语星线**，星源是这一整轮，权重 0.5；两端落在同一句时是**自星线**，星源就是那句，权重 1（句内星数超过 8 时每对按 `1/(k-1)` 分摊）；落在相邻两句时是**邻星线**，星源是相邻的那两句，权重 0.5。定位越具体越重，同一轮里只按最具体的那一种记一次。
- **边不落盘**：星源里只写「这一轮哪几对名字被配成对、每句有哪几颗星」，边在查询时现聚合。
- **长的工具输出不当成「说过的话」**：`tool/result` 只有短于 600 字才进模型；读文件、列目录的结果是数据，不是句子。
- **抽星规则带版本号**：`src/build.mjs` 的 `RULES_VERSION` 记在 `state.json` 的 `rules` 里。改了提示词、分句、成星判定就把这个数加一，启动时一比对不上就整库重抽——名字是算出来的索引，按旧规则建出来的星表没有修补价值。
- **模型必须配全才抽星**：`~/.dsh/life-starmap/config.json` 里存 `provider` / `model` / `reasoningEffort` / `concurrency`，三个设置项**任一为空就完全不抽**（默认全空）。留空不表示「用会话默认模型」，而是「现在不抽」——宁可不点亮，也不拿猜的星污染这张图。
- **一条对话复用到底**：第一句用户消息固定是指令，之后每轮原文接在后面，模型逐条回答。前缀一直不变，模型侧的缓存才有机会命中；攒到 24 000 字符就换新的一条，并发的每一路各持一条，互不干扰。调用失败会把这一问撤回，保证重试的前缀与失败前一致。
- **自动补做只收拾近处**：灰记忆超过 3 轮就停手，等用户在设置页点「现在抽星」。中途停掉的轮次保持灰色，重新抽即可——重发的是同一段原文，有没有缓存命中都不影响正确性。
- **输出上限可调，默认 32000**：200–32000 之间夹住（`config.json` 的 `maxTokens`，设置页也能改）。额度不再是瓶颈，钱花多少由抽星轮数和强度决定。思考型模型的思考也算在输出里，1500 会在正文之前被截断，`finish` 的 `reason.kind` 是 `max-tokens`。截断时就地报「输出被截断（maxTokens 4000）」，并用 `salvagePairs()` 把已经写完的 `["甲","乙"]` 逐条捞回来，宁可少几对，也不整轮作废。
- **抽星中可以暂停**：设置页的「现在抽星」在抽星时变成「暂停」，走 `starmap.pause`；宿主只置一个 `stopRequested` 标志，手上的那一轮跑完就收手，不做中断式取消（模型流没有可靠的取消点）。抽星期间客户端 1.2 秒轮询一次，进度条直接画抽星进度；空闲时 20 秒一次，画已点亮比例。
- **用量记账**：每次调用追加一行 `~/.dsh/life-starmap/usage.jsonl`（`input` / `output` / `cacheRead`），设置页显示「调用 N 次 · 7 天 X token · 累计 Y token」。
- **RPC**：`/api/dsh-lpipe-starmap` 上的 `starmap.progress` / `starmap.star` / `starmap.turn` / `starmap.links` / `starmap.config` / `starmap.config.set` 与 `starmap.rebuild`（`{ full: true }` 时整库重抽），只有最后两个与配置写会改盘。
- **设置块**：`lpipe.settings.panel` 的 `id: 'starmap'`、`order: 40`，显示亮了多少轮、灰了多少轮、多少颗星、模型抽星进度，并可以选提供者 / 模型名 / 思考强度。
- **依赖**：`dsh-lpipe-memory`（读记忆，走它的 `./reader` 与 `./paths` 导出）与 `dsh-life-pipline`（设置页）。
