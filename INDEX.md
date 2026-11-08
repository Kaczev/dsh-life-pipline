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
- [components/dsh-lpipe-memory/](components/dsh-lpipe-memory/)：记忆组件包（会话原文落盘，可校验），依赖本包。
- [components/dsh-lpipe-starmap/](components/dsh-lpipe-starmap/)：星图组件包（从原文抽概念、按句连边），依赖本包与 `dsh-lpipe-memory`。
  - [src/brightness.mjs](components/dsh-lpipe-starmap/src/brightness.mjs)：基础亮度与通用分类的只读快照。
  - [src/match.mjs](components/dsh-lpipe-starmap/src/match.mjs)：准确／模糊匹配，输出闪烁星、基础亮度及最后命中位置；[测试](components/dsh-lpipe-starmap/test/brightness.test.mjs)。
  - [scripts/prune-single-letters.mjs](components/dsh-lpipe-starmap/scripts/prune-single-letters.mjs)：停写后定向清理单字母星，备份后写入，不改版本或水位；[测试](components/dsh-lpipe-starmap/test/prune.test.mjs)。
- [components/dsh-lpipe-recall/](components/dsh-lpipe-recall/)：回忆管线（被动模糊注入、主动想起与按区间深读），只读星图与记忆。
  - [README.md](components/dsh-lpipe-recall/README.md)：配置、设置块与两个主动工具的参数和分页规则。
  - [src/config.mjs](components/dsh-lpipe-recall/src/config.mjs)：默认值与归一化；设置页只读写五项，保存时保留其他键。
  - [src/match.mjs](components/dsh-lpipe-recall/src/match.mjs) / [src/candidates.mjs](components/dsh-lpipe-recall/src/candidates.mjs) / [src/render.mjs](components/dsh-lpipe-recall/src/render.mjs)：环境权重与预算、准确真文准入、亮度排序与原文选句。
  - [src/tools.mjs](components/dsh-lpipe-recall/src/tools.mjs)：`recall_fragments` / `recall_open` 定义与执行。
  - [src/open.mjs](components/dsh-lpipe-recall/src/open.mjs)：跨片段坐标、句子读取与输出限额。
  - [src/rpc.mjs](components/dsh-lpipe-recall/src/rpc.mjs)：`/api/dsh-lpipe-recall` 的 `recall.config` / `recall.config.save`。
  - [src/index.js](components/dsh-lpipe-recall/src/index.js)：组装、主动回忆系统指引、预注入、RPC 注册及可见回忆结果去重。
  - [client/panel.js](components/dsh-lpipe-recall/client/panel.js)：设置页里的「回忆管线」块（五项，一行排完，支持 K/M 简写）；构建到 [lib/client.js](components/dsh-lpipe-recall/lib/client.js)。
  - [scripts/build-client.mjs](components/dsh-lpipe-recall/scripts/build-client.mjs)：把面板包成宿主的客户端模块壳。
  - [test/open.test.mjs](components/dsh-lpipe-recall/test/open.test.mjs) / [test/index.test.mjs](components/dsh-lpipe-recall/test/index.test.mjs)：区间、限额、事件去重与真实存储查询回归。
  - [test/config.test.mjs](components/dsh-lpipe-recall/test/config.test.mjs) / [test/rpc.test.mjs](components/dsh-lpipe-recall/test/rpc.test.mjs) / [test/client.test.mjs](components/dsh-lpipe-recall/test/client.test.mjs)：五项读写保留、RPC 信封与客户端渲染回归。

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

## components/dsh-lpipe-memory

- `components/dsh-lpipe-memory/assets/icon.png` — 记忆管线图标（三层卡片 + 星点，512² 透明 PNG）

- [components/dsh-lpipe-memory/package.json](components/dsh-lpipe-memory/package.json)：包名、`exports`、`dsh.bundle`，以及对 `dsh-life-pipline` 的依赖。
- [components/dsh-lpipe-memory/cordis.patch.yml](components/dsh-lpipe-memory/cordis.patch.yml)：组件自己的挂载行。
- [components/dsh-lpipe-memory/src/paths.mjs](components/dsh-lpipe-memory/src/paths.mjs)：`~/.dsh/life-memory` 的目录规则（一对话一文件夹、按天分卷、图片跟着当天走）。
- [components/dsh-lpipe-memory/src/day.mjs](components/dsh-lpipe-memory/src/day.mjs)：凌晨 4 点换天的天界计算。
- [components/dsh-lpipe-memory/src/chain.mjs](components/dsh-lpipe-memory/src/chain.mjs)：哈希链（`prev` / `hash` 与校验）。
- [components/dsh-lpipe-memory/src/frames.mjs](components/dsh-lpipe-memory/src/frames.mjs)：8 KB 一帧的压缩与解压。
- [components/dsh-lpipe-memory/src/mediapack.mjs](components/dsh-lpipe-memory/src/mediapack.mjs)：一天一个媒体包（图片跟着当天的目录走，追加式帧 + 偏移表）。
- [components/dsh-lpipe-memory/scripts/migrate-media-into-days.mjs](components/dsh-lpipe-memory/scripts/migrate-media-into-days.mjs)：把旧的全局 `media/` 一次性搬进各自那一天。
- [components/dsh-lpipe-memory/src/writer.mjs](components/dsh-lpipe-memory/src/writer.mjs)：追加写入、偏移表、`meta.json` 与全局游标。
- [components/dsh-lpipe-memory/src/pack.mjs](components/dsh-lpipe-memory/src/pack.mjs)：冷日打包——过完的那一天整天重打成一条 zstd 19 流，启动后补做。
- [components/dsh-lpipe-memory/src/reader.mjs](components/dsh-lpipe-memory/src/reader.mjs)：按 `seq` 读一行（只解一帧）、时间线、搜索与链校验。
- [components/dsh-lpipe-memory/src/project.mjs](components/dsh-lpipe-memory/src/project.mjs)：四类白名单事件到记忆行的投影。
- [components/dsh-lpipe-memory/src/index.js](components/dsh-lpipe-memory/src/index.js)：宿主半边，订阅 `session/event`，一轮结束整轮落盘，并注册 `memory.stats`。
- [components/dsh-lpipe-memory/src/stats.mjs](components/dsh-lpipe-memory/src/stats.mjs)：逐轮累计大小、磁盘占用，按 `state.seq` 缓存。
- [components/dsh-lpipe-memory/src/rpc.mjs](components/dsh-lpipe-memory/src/rpc.mjs)：`/api/dsh-lpipe-memory` 的只读 RPC。
- [components/dsh-lpipe-memory/client/panel.js](components/dsh-lpipe-memory/client/panel.js)：设置页里的记忆显示块（总量 + 最近 30 轮曲线）。
- [components/dsh-lpipe-memory/lib/client.js](components/dsh-lpipe-memory/lib/client.js)：由 `scripts/build-client.mjs` 打包出的客户端半边。
- [components/dsh-lpipe-memory/test/stats.test.mjs](components/dsh-lpipe-memory/test/stats.test.mjs)：逐轮累计、窗口截取与缓存失效。
- [components/dsh-lpipe-memory/test/client.test.mjs](components/dsh-lpipe-memory/test/client.test.mjs)：只注册记忆块、格式化与曲线坐标。
- [components/dsh-lpipe-memory/test/store.test.mjs](components/dsh-lpipe-memory/test/store.test.mjs)：天界、跨会话、幂等、多帧、搜索与篡改检测。
- [components/dsh-lpipe-memory/README.md](components/dsh-lpipe-memory/README.md)：存什么、存在哪、怎么读。
