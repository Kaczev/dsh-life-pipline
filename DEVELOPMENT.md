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
├── scripts/install-local.mjs # 把本包与 components/* 装进 profile
└── components/
    └── dsh-lpipe-chat/       # 组件：自己的 bundle + 自己的插件，依赖 dsh-life-pipline
        ├── package.json      # name / icon / exports / dsh.bundle / dsh.client / dependencies
        ├── cordis.patch.yml  # 只插自己这一行 → 插件列表里独立一张卡片
        ├── src/index.js      # 插件本体
        ├── client/panel.js   # chat 自己那块设置与主会话小气泡标记
        ├── lib/client.js     # 构建产物（提交进仓库）
        ├── locale/{en,zh}.json
        └── assets/icon.png   # 组件图标：两个气泡合流
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
| 设置侧栏条目与页面标题 | 由 `dsh-life-pipline` 渲染整页 | **Lpipe 设置** | — |

标题和简介来自包导出的 `locale/en.json`、`locale/zh.json` 的 `meta.title` / `meta.description`，由宿主的 `readPluginMeta` 读取，缺失时才回退 `package.json` 的 `name` / `description`；图标来自 `package.json` 的 `icon` 字段，必须在包目录内、≤256 KiB。两条路径都要在 `exports` 里放行，否则宿主解析不到。

同一个包只能有一个身份：卡片、组件行都读包自己的元信息。想让每个组件都有自己的名字和图标，就必须各做一个包——这就是 `components/` 下按组件分包、并且每个包自带 patch 的原因。

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
