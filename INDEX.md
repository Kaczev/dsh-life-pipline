# 导航

`dsh-life-pipline` 是聚合安装入口，选择生命核心和独立管线；所有 `dsh-lpipe-*` 直接依赖 `dsh-life-core`。共享设置与主会话逻辑由核心提供，根 `src/` 只保留兼容转发及聚合激活。

- [聚焦管线导航](components/dsh-lpipe-focus/INDEX.md)：开始下一段实质工作前如何用等效层替代已经得出结果的区间、何时跨轮提醒，以及如何按 `supersedes` 回收旧层；[实现说明](不入库/管线实现/dsh-lpipe-focus.md)，[局部设计](不入库/设计/dsh-lpipe-focus-配置块.html)。
- [语气管线导航](components/dsh-lpipe-tone/INDEX.md)介绍如何用习惯用语生成提示词，以及 LP 主对话与所有顶层对话的生效范围。
- [语气设置块](components/dsh-lpipe-tone/client/panel.js)提供单行习惯用语输入框，可保存或撤回草稿。见[客户端产物](components/dsh-lpipe-tone/lib/client.js)和[面板回归](components/dsh-lpipe-tone/test/client.test.mjs)。
- [生命核心导航](components/dsh-life-core/INDEX.md)：共享设置、隔离、数据路径与前置协调。
- [聚合激活](src/aggregate.mjs)：选择规范 bundle，避免混装重复插件行；[测试](test/aggregate.test.mjs)。
- [client/panel.js](client/panel.js)：聚合详情页组件开关，通过独立管理端点调用规范组件，中文名覆盖全部规范组件；[HTML 参考](不入库/设计/life-aggregate-components.html#aggregate-components)。
- [即时开关回归](test/components-client.test.mjs)：乐观切换、连续反向操作串行及失败回读。
- [组件开关回归](test/components-control.test.mjs)：前置顺序、级联关闭和非 applied 失败。
- [依赖联动测试](test/dependencies.test.mjs)：单装、级联关闭和重新开启。

- [README.md](README.md)：中英安装指南、七条管线职责与依赖、主对话配置及常见问题；各组件的 README 面向普通用户介绍功能、安装设置、注意事项与许可致谢。
- [package.json](package.json)：包名、`icon`、兼容 `exports`、聚合依赖与 `dsh.bundle`。
- [cordis.patch.yml](cordis.patch.yml)：聚合入口自己的挂载行；各独立 bundle 通过管理服务选择，不重复插入。
- [components/dsh-life-core/client/panel.js](components/dsh-life-core/client/panel.js)：「Lpipe 设置」容器、主会话标记及「设为 LP 主对话」会话菜单（`lp-set-main-session`，保存复用公共 RPC）；构建到 `lib/client.js`。局部设计：[菜单 HTML](不入库/设计/lp-main-session-menu.html)。
- [scripts/build-client.mjs](scripts/build-client.mjs)：兼容转发到核心的客户端构建脚本。
- [scripts/install-local.mjs](scripts/install-local.mjs)：按核心的组件清单，把整合包、核心与七条管线以 link 方式装进本机 profile，并列进 `dsh.profile.bundles`。
- [scripts/test.mjs](scripts/test.mjs)：默认运行根测试，以及核心和七条现行管线的测试；旧星图和回忆的专属测试不计入默认套件。
- [src/rpc.mjs](src/rpc.mjs)：公共配置与已有工作区列表、工作区选择即时持久化与失效清空、独立身份的空白 LP 主会话创建及绑定重试（只改名身份匹配的按钮创建会话）；[创建回归](test/create-main.test.mjs)，[局部设计](不入库/设计/lp-create-main-session.html)。
- [src/main-session.mjs](src/main-session.mjs)：动态主会话门禁、工具可见性与执行复核、系统提示词隔离；[回归](test/main-session.test.mjs)。
- [src/diagnostics.mjs](src/diagnostics.mjs)：四类诊断日志共用的 2 MiB 完整记录尾部保留；[测试](test/diagnostics.test.mjs)。
- [保存按钮局部 HTML](不入库/设计/lpipe-save-button-states.html)：只有有效未保存改动时强调色亮起，初始、改回原值和保存成功后禁用淡化；[跨管线回归](test/save-buttons.test.mjs)。
- [test/panel.test.mjs](test/panel.test.mjs)：公共页容器的注册与渲染回归。
- [test/settings-defaults.test.mjs](test/settings-defaults.test.mjs)：各配置块标题的固定默认值与宿主一致性。
- [assets/icon.png](assets/icon.png) / [locale/](locale/)：插件卡片的图标与显示名。
- [components/dsh-lpipe-home/INDEX.md](components/dsh-lpipe-home/INDEX.md)：栖所管线，默认未选择，个人文件夹校验、主会话英文提示词、设置块与图标。
- [components/dsh-lpipe-bili/INDEX.md](components/dsh-lpipe-bili/INDEX.md)：B 站管线，只读浏览、扫码登录、字幕与隔离分镜；设置页与图标已就位。
- [components/dsh-lpipe-chat/](components/dsh-lpipe-chat/)：社交通道组件包（微信 / QQ），独立设置块只依赖核心。
- [components/dsh-lpipe-wake/](components/dsh-lpipe-wake/)：唤醒组件包（自然唤醒 + 自主安排的主动唤醒），同样是独立 bundle，依赖核心。
- [记忆管线导航](components/dsh-lpipe-memory/INDEX.md)：欲望与设定（LP 主对话或所有顶层对话）、Lpipe 设置面板；不归档对话。

### 旧组件源码（不随整合包安装）

以下仅用于查阅旧版星图和回忆的实现。两者依赖旧版记忆接口，不能与当前记忆管线一起加载，也不在整合包或默认测试内。

- [components/dsh-lpipe-starmap/](components/dsh-lpipe-starmap/)：星图组件包（从原文抽概念、按句连边），依赖核心与 `dsh-lpipe-memory`。
  - [src/query.mjs](components/dsh-lpipe-starmap/src/query.mjs)：进度星数 = 文星 + 时星，准确／模糊／通用互斥计数；[统计回归](components/dsh-lpipe-starmap/test/progress.test.mjs)，[星数局部 HTML](不入库/设计/dsh-lpipe-starmap-星数.html)。
  - [src/index.js](components/dsh-lpipe-starmap/src/index.js)：新增轮次的自动抽星遵守记忆作用域，手动启动抽星与原文检查覆盖全库已有历史；面板轮数也统计全库历史；[作用域切换回归](components/dsh-lpipe-starmap/test/history-progress.test.mjs)。
  - [来源投影](components/dsh-lpipe-starmap/src/projection.mjs)：聊天结构化正文区间、主动唤醒理由与自然唤醒排除；模型保留聊天来源，程序抽模糊星仅看正文。回忆当前真文、历史背景与 BM25 复用正文投影；[抽星回归](components/dsh-lpipe-starmap/test/projection.test.mjs)、[回忆回归](components/dsh-lpipe-recall/test/projection.test.mjs)。本次不自动抬规则版本，筛选记忆后手动重抽。
  - [抽星提示词](components/dsh-lpipe-starmap/src/llm.mjs)：分来源证据规则、昵称可配准确星、渠道标记与 ID 排除，以及成星标准和 JSON 输出约束。
  - [src/brightness.mjs](components/dsh-lpipe-starmap/src/brightness.mjs)：基础亮度与通用分类的只读快照。
  - [src/match.mjs](components/dsh-lpipe-starmap/src/match.mjs)：文星／时星统一匹配，输出类型、亮度及最后命中位置；[文星测试](components/dsh-lpipe-starmap/test/brightness.test.mjs)。
  - [src/time.mjs](components/dsh-lpipe-starmap/src/time.mjs)：片段时间星视图、时间表达组合、文字定位端点过滤与范性／确性响应；[端点测试](components/dsh-lpipe-starmap/test/time-locator.test.mjs)；[解析测试](components/dsh-lpipe-starmap/test/time.test.mjs)、[回忆接入测试](components/dsh-lpipe-recall/test/time.test.mjs)。
  - [scripts/prune-invalid-stars.mjs](components/dsh-lpipe-starmap/scripts/prune-invalid-stars.mjs)：按当前非 LLM 规则过滤旧准确／通用星，保留模糊星、版本和水位；[测试](components/dsh-lpipe-starmap/test/prune-invalid.test.mjs)。
  - [scripts/prune-single-letters.mjs](components/dsh-lpipe-starmap/scripts/prune-single-letters.mjs)：停写后定向清理单字母星，备份后写入，不改版本或水位；[测试](components/dsh-lpipe-starmap/test/prune.test.mjs)。
- [components/dsh-lpipe-recall/](components/dsh-lpipe-recall/)：回忆管线（被动模糊注入、主动想起与按区间深读），只读星图与记忆。
  - [README.md](components/dsh-lpipe-recall/README.md)：用户安装、回忆体验、设置与费用说明。
  - [src/config.mjs](components/dsh-lpipe-recall/src/config.mjs)：默认值与归一化；设置页只读写六项，保存时保留其他键。
  - [src/match.mjs](components/dsh-lpipe-recall/src/match.mjs) / [src/candidates.mjs](components/dsh-lpipe-recall/src/candidates.mjs) / [src/render.mjs](components/dsh-lpipe-recall/src/render.mjs)：环境权重与预算、准确真文准入、亮度排序与原文选句。
  - [src/environment.mjs](components/dsh-lpipe-recall/src/environment.mjs)：片段时间、全库 BM25 与展示摘录前缀掩盖；[测试](components/dsh-lpipe-recall/test/environment.test.mjs)。
  - [src/tools.mjs](components/dsh-lpipe-recall/src/tools.mjs)：`recall_fragments` / `recall_open` / `recall_image` 定义与执行。
  - [src/text.mjs](components/dsh-lpipe-recall/src/text.mjs)：响应窗口投影与独立的展示白名单（工具仅展示发送正文）；[测试](components/dsh-lpipe-recall/test/text.test.mjs)。
  - [src/provenance.mjs](components/dsh-lpipe-recall/src/provenance.mjs)：展示白名单、历史缺省与渠道／收发双方标记；[跨组件回归](components/dsh-lpipe-recall/test/provenance.test.mjs)，[显示参考](不入库/设计/recall-provenance.html)。
  - [src/images.mjs](components/dsh-lpipe-recall/src/images.mjs)：图片元数据引用、所属片段校验与按需读取；[测试](components/dsh-lpipe-recall/test/images.test.mjs)。
  - [src/open.mjs](components/dsh-lpipe-recall/src/open.mjs)：跨片段坐标、句子读取与输出限额；与 `render.mjs` 共用来源头起始句 ID 和连续原句排版，图片 ID 统一放片段头（模糊回忆最多 9 张，深读列全，受总字数限制）。
  - [src/rpc.mjs](components/dsh-lpipe-recall/src/rpc.mjs)：`/api/dsh-lpipe-recall` 的 `recall.config` / `recall.config.save`。
  - [src/index.js](components/dsh-lpipe-recall/src/index.js)：组装、主动回忆系统指引、预注入、RPC 注册及可见回忆结果去重。
  - [client/panel.js](components/dsh-lpipe-recall/client/panel.js)：设置页里的「回忆管线」块（六项，自动换行，支持 K/M 简写）；构建到 [lib/client.js](components/dsh-lpipe-recall/lib/client.js)。
  - [scripts/build-client.mjs](components/dsh-lpipe-recall/scripts/build-client.mjs)：把面板包成宿主的客户端模块壳。
  - [test/open.test.mjs](components/dsh-lpipe-recall/test/open.test.mjs) / [test/index.test.mjs](components/dsh-lpipe-recall/test/index.test.mjs)：区间、限额、事件去重与真实存储查询回归。
  - [test/config.test.mjs](components/dsh-lpipe-recall/test/config.test.mjs) / [test/rpc.test.mjs](components/dsh-lpipe-recall/test/rpc.test.mjs) / [test/client.test.mjs](components/dsh-lpipe-recall/test/client.test.mjs)：六项读写保留、RPC 信封与客户端渲染回归。

## components/dsh-lpipe-chat

- [微信重绑切换](components/dsh-lpipe-chat/src/weixin/channel.mjs)：运行中连接绑定启动时的凭据，扫码换号后切换轮询，停止通知只发给旧凭据；[回归](components/dsh-lpipe-chat/test/weixin-rebind.test.mjs)。
- [显式收件人回归](components/dsh-lpipe-chat/test/explicit-target.test.mjs)：微信／QQ 不默认发给 Owner，文字／媒体目标一致、完整 ID 与未知昵称展示。

- [下载过期清理](components/dsh-lpipe-chat/src/download-cleanup.mjs)：默认 downloads 直属文件按修改时间清理，默认 7 天；[边界与配置测试](components/dsh-lpipe-chat/test/download-cleanup.test.mjs)。

- [components/dsh-lpipe-chat/package.json](components/dsh-lpipe-chat/package.json)：包名、`icon`、`exports`、`dsh.bundle`、`dsh.client`，以及对 `dsh-life-core` 的依赖。
- [components/dsh-lpipe-chat/cordis.patch.yml](components/dsh-lpipe-chat/cordis.patch.yml)：组件自己的挂载行——这一行让它在插件列表里独立成卡。
- [components/dsh-lpipe-chat/assets/icon.png](components/dsh-lpipe-chat/assets/icon.png)：组件图标（两个气泡合流，512² 透明 PNG）。
- [assets/session-mark.png](assets/session-mark.png)：会话栏里主会话标题左侧的小标记（64² 透明 PNG，内联进公共包的客户端）。主会话是核心公共状态，所以这枚标记归 `dsh-life-core` 管。
- [components/dsh-lpipe-chat/locale/en.json](components/dsh-lpipe-chat/locale/en.json) / [zh.json](components/dsh-lpipe-chat/locale/zh.json)：组件显示名「Lpipe Chat」与简介。
- [components/dsh-lpipe-chat/src/index.js](components/dsh-lpipe-chat/src/index.js)：组件装配、仅主会话的自由聊天／Owner 身份提示词、服务注入与清理。
- [components/dsh-lpipe-chat/test/owner-client.test.mjs](components/dsh-lpipe-chat/test/owner-client.test.mjs)：Owner 输入框保存、清空、取消与非法值禁用回归。
- [components/dsh-lpipe-chat/test/owner.test.mjs](components/dsh-lpipe-chat/test/owner.test.mjs)：旧 Home 名字一次性迁移、Chat 优先与清空、RPC 校验、主会话切换隔离。
- [components/dsh-lpipe-chat/src/qrcode.mjs](components/dsh-lpipe-chat/src/qrcode.mjs)：热重载安全的二维码 CommonJS 加载器；[重复重载测试](components/dsh-lpipe-chat/test/qrcode-loading.test.mjs)。
- [QQ 自身身份](components/dsh-lpipe-chat/src/qq/self-identity.mjs)：自动读取机器人名字与每群自身 OpenID，限时缓存、失败退避及连接结束隔离；[提及与缓存测试](components/dsh-lpipe-chat/test/qq-self-identity.test.mjs)。
- [components/dsh-lpipe-chat/src/qq/channel.mjs](components/dsh-lpipe-chat/src/qq/channel.mjs)：QQ 连接与按目标隔离的被动回复窗口、额度及明确拒绝后的单次主动降级；[路由测试](components/dsh-lpipe-chat/test/qq-routing.test.mjs)。
- [components/dsh-lpipe-chat/src/gateway.mjs](components/dsh-lpipe-chat/src/gateway.mjs)：入站窗口合并、通知消息构造与重试；完整平台 ID 在内部匹配主人，仅对匹配消息显示 `(Owner)` 前缀，保留群聊范围。
- [components/dsh-lpipe-chat/src/content.mjs](components/dsh-lpipe-chat/src/content.mjs)：大小单位、UTF-8 截断及 QQ 文本显示投影。
- [图片归档](components/dsh-lpipe-chat/src/image-archive.mjs)：入站保存稳定图片 ID 和私有下载凭据，通知按预算下载、历史仅按图片 ID 补读并缓存，过期明确报错；[图片归档回归](components/dsh-lpipe-chat/test/image-archive.test.mjs)。
- [components/dsh-lpipe-chat/src/history.mjs](components/dsh-lpipe-chat/src/history.mjs)：有界历史、长消息续读与稳定快照游标；本地时间按距上次标记五分钟、跨天及每页首条显示。
- [components/dsh-lpipe-chat/src/identity.mjs](components/dsh-lpipe-chat/src/identity.mjs)：通知与历史共用完整用户／群 ID 身份头，出站使用实际归档目标；[展示回归](components/dsh-lpipe-chat/test/history-display.test.mjs)。
- [components/dsh-lpipe-chat/src/files.mjs](components/dsh-lpipe-chat/src/files.mjs)：附件引用、显式限额下载及安全命名。
- [components/dsh-lpipe-chat/src/forward.mjs](components/dsh-lpipe-chat/src/forward.mjs)：转发图片／文件原位类型 ID、隐藏附件链接及按图片 ID 读取。
- [components/dsh-lpipe-chat/src/skill.mjs](components/dsh-lpipe-chat/src/skill.mjs)：插件作用域技能注册；[英文技能](components/dsh-lpipe-chat/skills/lpipe-chat-media/SKILL.md)。
- [components/dsh-lpipe-chat/src/media.mjs](components/dsh-lpipe-chat/src/media.mjs)：组合媒体发送、实际目标归档及逐项失败结果；[升级测试](components/dsh-lpipe-chat/test/upgrades.test.mjs)。
- [components/dsh-lpipe-chat/src/notice.mjs](components/dsh-lpipe-chat/src/notice.mjs)：主会话恢复、忙时注入与空闲唤醒。
- [components/dsh-lpipe-chat/client/panel.js](components/dsh-lpipe-chat/client/panel.js)：chat 自己那块设置（包含从 Home 移来的 Owner 名字；注册进 `lpipe.settings.panel`）；构建到 `lib/client.js`。
- [components/dsh-lpipe-chat/test/](components/dsh-lpipe-chat/test/)：窗口合并、投递、接收过滤、客户端与主题回归。

## components/dsh-lpipe-wake

- [components/dsh-lpipe-wake/package.json](components/dsh-lpipe-wake/package.json)：包名、`icon`、`exports`、`dsh.bundle`、`dsh.client`，以及对 `dsh-life-core` 的依赖。
- [components/dsh-lpipe-wake/cordis.patch.yml](components/dsh-lpipe-wake/cordis.patch.yml)：组件自己的挂载行。
- [components/dsh-lpipe-wake/src/engine.mjs](components/dsh-lpipe-wake/src/engine.mjs)：三个时间戳与开关的唯一规则（纯函数 `step`）。
- [components/dsh-lpipe-wake/src/runner.mjs](components/dsh-lpipe-wake/src/runner.mjs)：30 秒心跳、活动读取与 `agent.followup` 投递。
- [components/dsh-lpipe-wake/src/rpc.mjs](components/dsh-lpipe-wake/src/rpc.mjs)：`/api/dsh-lpipe-wake`（`wake.status` / `wake.config.save` / `wake.now` / `wake.reset`）。
- [components/dsh-lpipe-wake/src/tools.mjs](components/dsh-lpipe-wake/src/tools.mjs)：`wake_set` 新增／取消主动安排或锁定／解锁自然唤醒，`wake_check` 查询全部安排；结果回显剩余安排。
- [时间解析](components/dsh-lpipe-wake/src/time.mjs)：组合时长、本机时钟下一次到达、严格日期与带偏移 ISO；[测试](components/dsh-lpipe-wake/test/time.test.mjs)。
- [状态反馈](components/dsh-lpipe-wake/src/feedback.mjs)：通知／工具共享安排摘要，设置页变更在主会话下次请求合并反馈一次；[通知、投影和注入回归](components/dsh-lpipe-wake/test/feedback.test.mjs)。
- [components/dsh-lpipe-wake/client/panel.js](components/dsh-lpipe-wake/client/panel.js)：设置里的「唤醒管线」块（自然 / 主动各一个开关），注册进 `lpipe.settings.panel`。
- [components/dsh-lpipe-wake/assets/icon.png](components/dsh-lpipe-wake/assets/icon.png)：组件图标（青绿色日出与蓝色地平线，512² 透明 PNG）。
- [components/dsh-lpipe-wake/assets/](components/dsh-lpipe-wake/assets/) 与 [locale/](components/dsh-lpipe-wake/locale/)：图标与显示名「Lpipe Wake / 唤醒管线」。
- [唤醒提示词](components/dsh-lpipe-wake/src/index.js)：带二级标题的自然／计划唤醒说明，仅注入当前主会话；[回归](components/dsh-lpipe-wake/test/prompt.test.mjs)。
- [components/dsh-lpipe-wake/test/wake.test.mjs](components/dsh-lpipe-wake/test/wake.test.mjs)：规则、心跳、RPC、工具与客户端回归。

## components/dsh-lpipe-memory

- [README.md](components/dsh-lpipe-memory/README.md)：使用方式与旧归档范围。
- [package.json](components/dsh-lpipe-memory/package.json)、[cordis.patch.yml](components/dsh-lpipe-memory/cordis.patch.yml)：宿主与客户端入口、打包及独立挂载。
- [src/index.js](components/dsh-lpipe-memory/src/index.js)、[src/prompt.mjs](components/dsh-lpipe-memory/src/prompt.mjs)：主会话接入和两段提示词。
- [src/tools.mjs](components/dsh-lpipe-memory/src/tools.mjs)、[src/service.mjs](components/dsh-lpipe-memory/src/service.mjs)：工具 schema、操作权限及面板 RPC。
- [src/settings-context.mjs](components/dsh-lpipe-memory/src/settings-context.mjs)：在模型请求前投递、复用或撤销设定清单。
- [src/store.mjs](components/dsh-lpipe-memory/src/store.mjs)：数据格式、校验、事务及恢复。
- [client/panel.js](components/dsh-lpipe-memory/client/panel.js)、[scripts/build-client.mjs](components/dsh-lpipe-memory/scripts/build-client.mjs)：设置面板及其客户端产物构建。
- [test/host.test.mjs](components/dsh-lpipe-memory/test/host.test.mjs)、[test/store.test.mjs](components/dsh-lpipe-memory/test/store.test.mjs)、[test/client.test.mjs](components/dsh-lpipe-memory/test/client.test.mjs)：宿主、存储及客户端回归。
