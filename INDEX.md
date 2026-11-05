# 导航

`dsh-life-pipline` 是整个 `dsh-lpipe-` 系列的公共包：它自己也是一个插件（bundle），在 **设置** 侧栏提供一页「Lpipe 设置」并声明子槽 `lpipe.settings.panel`；每个组件是独立包、独立 bundle（自带 patch，插件列表里各占一张卡片），并以 `dsh-life-pipline` 为依赖。

- [README.md](README.md)：npm 上显示的那份（公共包说明）。
- [DEVELOPMENT.md](DEVELOPMENT.md)：开发笔记（结构、显示名与图标、组件说明、安装与配置）。
- [package.json](package.json)：包名、`icon`、`exports`、`dsh.bundle`（自己那一行）与 `dsh.client`。
- [cordis.patch.yml](cordis.patch.yml)：公共包自己的挂载行——只有它插这一行，组件不重复插。
- [client/panel.js](client/panel.js)：「Lpipe 设置」整页容器（`settings.section`，`id: lpipe`，声明子槽 `lpipe.settings.panel`）；构建到 `lib/client.js`。
- [scripts/build-client.mjs](scripts/build-client.mjs)：把 `client/panel.js` 包成宿主的模块壳。
- [scripts/install-local.mjs](scripts/install-local.mjs)：把本包与 `components/*` 以 link 方式装进本机 profile，并列进 `dsh.profile.bundles`。
- [test/panel.test.mjs](test/panel.test.mjs)：公共页容器的注册与渲染回归。
- [assets/icon.png](assets/icon.png) / [locale/](locale/)：插件卡片的图标与显示名。
- [components/dsh-lpipe-chat/](components/dsh-lpipe-chat/)：社交通道组件包（微信 / QQ），自身也是 bundle，依赖本包。
- [components/dsh-lpipe-wake/](components/dsh-lpipe-wake/)：唤醒组件包（自然唤醒 + 自主安排的主动唤醒），同样是独立 bundle，依赖本包。

## components/dsh-lpipe-chat

- [components/dsh-lpipe-chat/package.json](components/dsh-lpipe-chat/package.json)：包名、`icon`、`exports`、`dsh.bundle`、`dsh.client`，以及对 `dsh-life-pipline` 的依赖。
- [components/dsh-lpipe-chat/cordis.patch.yml](components/dsh-lpipe-chat/cordis.patch.yml)：组件自己的挂载行——这一行让它在插件列表里独立成卡。
- [components/dsh-lpipe-chat/assets/icon.png](components/dsh-lpipe-chat/assets/icon.png)：组件图标（两个气泡合流，512² 透明 PNG）。
- [assets/session-mark.png](assets/session-mark.png)：会话栏里主会话标题左侧的小标记（64² 透明 PNG，内联进公共包的客户端）。主会话是公共状态，所以这枚标记归 `dsh-life-pipline` 管。
- [components/dsh-lpipe-chat/locale/en.json](components/dsh-lpipe-chat/locale/en.json) / [zh.json](components/dsh-lpipe-chat/locale/zh.json)：组件显示名「Lpipe Chat」与简介。
- [components/dsh-lpipe-chat/src/index.js](components/dsh-lpipe-chat/src/index.js)：组件装配、服务注入与清理。
- [components/dsh-lpipe-chat/src/gateway.mjs](components/dsh-lpipe-chat/src/gateway.mjs)：入站窗口合并、通知消息构造与重试。
- [components/dsh-lpipe-chat/src/notice.mjs](components/dsh-lpipe-chat/src/notice.mjs)：主会话恢复、忙时注入与空闲唤醒。
- [components/dsh-lpipe-chat/client/panel.js](components/dsh-lpipe-chat/client/panel.js)：chat 自己那块设置（注册进 `lpipe.settings.panel`）；构建到 `lib/client.js`。
- [components/dsh-lpipe-chat/test/](components/dsh-lpipe-chat/test/)：窗口合并、投递、接收过滤、客户端与主题回归。

## components/dsh-lpipe-wake

- [components/dsh-lpipe-wake/package.json](components/dsh-lpipe-wake/package.json)：包名、`icon`、`exports`、`dsh.bundle`、`dsh.client`，以及对 `dsh-life-pipline` 的依赖。
- [components/dsh-lpipe-wake/cordis.patch.yml](components/dsh-lpipe-wake/cordis.patch.yml)：组件自己的挂载行。
- [components/dsh-lpipe-wake/src/engine.mjs](components/dsh-lpipe-wake/src/engine.mjs)：三个时间戳与开关的唯一规则（纯函数 `step`）。
- [components/dsh-lpipe-wake/src/runner.mjs](components/dsh-lpipe-wake/src/runner.mjs)：30 秒心跳、活动读取与 `agent.followup` 投递。
- [components/dsh-lpipe-wake/src/rpc.mjs](components/dsh-lpipe-wake/src/rpc.mjs)：`/api/dsh-lpipe-wake`（`wake.status` / `wake.config.save` / `wake.now` / `wake.reset`）。
- [components/dsh-lpipe-wake/src/tools.mjs](components/dsh-lpipe-wake/src/tools.mjs)：两个工具 `wake_set`（`in` / `at` + `reason`，`cancel` 取消）与 `wake_check`（只读：下次主动唤醒及缘由、下次自然唤醒）。
- [components/dsh-lpipe-wake/client/panel.js](components/dsh-lpipe-wake/client/panel.js)：设置里的「唤醒管线」块（自然 / 主动各一个开关），注册进 `lpipe.settings.panel`。
- [components/dsh-lpipe-wake/assets/icon.png](components/dsh-lpipe-wake/assets/icon.png)：组件图标（青绿色日出与蓝色地平线，512² 透明 PNG）。
- [components/dsh-lpipe-wake/assets/](components/dsh-lpipe-wake/assets/) 与 [locale/](components/dsh-lpipe-wake/locale/)：图标与显示名「Lpipe Wake / 唤醒管线」。
- [components/dsh-lpipe-wake/test/wake.test.mjs](components/dsh-lpipe-wake/test/wake.test.mjs)：规则、心跳、RPC、工具与客户端回归。
