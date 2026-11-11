# dsh-life-pipline · 生命管线

[中文](#中文) · [English](#english)

## 中文

生命管线为 DeepSeek Harness（DSH）提供聊天、唤醒和长期记忆等功能。`dsh-life-pipline` 是整合安装入口：启用后选择生命核心和七条独立管线，各组件仍可单独开关。

### 组件与依赖

| 包 | 用途 |
| --- | --- |
| [dsh-life-core](https://www.npmjs.com/package/dsh-life-core) | 公共设置、LP 主会话、工作区选择、会话隔离与依赖联动 |
| [dsh-lpipe-chat](https://www.npmjs.com/package/dsh-lpipe-chat) | 微信 / QQ 收发、消息合并、历史与媒体附件 |
| [dsh-lpipe-wake](https://www.npmjs.com/package/dsh-lpipe-wake) | 停止活动后的自然唤醒，以及模型自主安排的主动唤醒 |
| [dsh-lpipe-memory](https://www.npmjs.com/package/dsh-lpipe-memory) | 按会话、按天保存原始事件与媒体，支持哈希链校验 |
| [dsh-lpipe-starmap](https://www.npmjs.com/package/dsh-lpipe-starmap) | 用模型从记忆抽取概念索引，保留原句证据 |
| [dsh-lpipe-recall](https://www.npmjs.com/package/dsh-lpipe-recall) | 相关旧记忆的自动注入、主动回忆、原文深读与按需看图 |
| [dsh-lpipe-bili](https://www.npmjs.com/package/dsh-lpipe-bili) | B 站只读浏览、扫码登录、字幕与视频分镜 |
| [dsh-lpipe-home](https://www.npmjs.com/package/dsh-lpipe-home) | 为主会话指定个人文件夹并注入使用规则 |

所有管线直接依赖 `dsh-life-core`。星图另依赖记忆；回忆另依赖记忆和星图。单装某条管线无需先装整合包。

### 安装与快速开始

要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 在 DSH 插件管理中安装并启用 `dsh-life-pipline`。只需要部分功能时，改为安装对应的 `dsh-lpipe-*` bundle。
2. 打开 **设置 → Lpipe 设置**，选择已有会话作为 LP 主对话，或选择工作区后创建新的 LP 主对话。也可从会话菜单使用「设为 LP 主对话」。
3. 在整合包详情页管理组件开关；各管线也保留自己的插件条目。
4. 按需配置：聊天扫码登录；星图选择提供者、模型和适用的思考强度；栖所选择已有目录。未配置的账号不会连接，未选择的栖所不会注入提示词。
5. 在 LP 主对话中使用管线工具。记忆默认只记录主对话；「所有对话生效」开关可将记忆、星图和回忆扩展到其他会话。

npm 依赖安装不等于 DSH bundle 已启用。不要用 `npm install -g` 代替宿主的插件安装。仓库开发安装见 [开发笔记](https://github.com/Kaczev/dsh-life-pipline/blob/main/DEVELOPMENT.md)。

### 配置与数据

公共主会话绑定位于 `~/.dsh/life-pipline/config.json`，例如：

```json
{
  "mainSessionId": "your-session-id"
}
```

优先通过设置页修改。聊天、唤醒、记忆、星图、回忆、栖所分别使用 `life-chat`、`life-wake`、`life-memory`、`life-starmap`、`life-recall`、`life-home` 数据目录；B 站的临时媒体在 `life-bili`，登录凭据由宿主 credentials 服务保存。除星图外，`DSH_HOME` 可代替默认的 `~/.dsh`；星图使用独立的 `DSH_LIFE_STARMAP_ROOT` 覆盖目录。各包 README 说明自己的配置、工具参数及限制。

聊天、唤醒、B 站和栖所的工具或提示词限定在 LP 主对话；记忆相关功能遵循记忆作用域。星图抽取会调用所选模型，唤醒也可能产生新的模型轮次，使用前应检查预算。聊天与栖所的自主操作规则包含提示词授权，不能代替宿主权限或文件系统沙箱。

### 常见问题

- **看不到 Lpipe 设置？** 检查 `dsh-life-core` 是否已作为 bundle 启用，以及宿主是否报告兼容或加载错误。旧文档要求先装整合包的说明已不适用。
- **关闭一个组件后其他组件也停了？** 关闭前置会级联关闭下游；开启下游会补齐前置。重新开启前置不会自动恢复已关闭的下游。
- **关闭整合入口为何管线还在？** 整合入口负责选择独立 bundle；关闭入口不会删除已选择的 bundle。请使用组件自己的开关。
- **升级会换数据目录吗？** 核心拆分保留原数据目录、主会话绑定和渠道凭据。备份应包含相关数据目录，不能只备份星图索引。
- **模型没想起某段话？** 先确认记忆已写入、星图已完成抽取、当前会话在作用域内；回忆还会排除当前可见原文及冷却窗口内的已读片段。

### 开发与许可

在仓库根目录执行：

```bash
npm run build-client
npm test
npm pack --dry-run --json
```

源码与各组件文档见 [GitHub 仓库](https://github.com/Kaczev/dsh-life-pipline)。本包采用 AGPL-3.0-or-later；回忆管线采用 MIT，其他组件和内置第三方代码以各自随包许可为准。

## English

Life Pipline adds messaging, wake-ups and long-term memory to DeepSeek Harness (DSH). `dsh-life-pipline` is the aggregate installer: enabling it selects Life Core and seven independent pipeline bundles. Each component keeps its own switch.

### Packages and dependencies

- **dsh-life-core** owns shared settings, the LP main session, workspace selection, session isolation and dependency coordination.
- **dsh-lpipe-chat** connects WeChat and QQ, batches incoming messages, sends replies and handles history and media.
- **dsh-lpipe-wake** wakes the main session after inactivity or at a time chosen by the model.
- **dsh-lpipe-memory** stores original events and media by session and day, with hash-chain verification.
- **dsh-lpipe-starmap** uses a model to extract a concept index with sentence-level evidence.
- **dsh-lpipe-recall** retrieves relevant excerpts automatically or through tools for recall, deeper reading and images.
- **dsh-lpipe-bili** provides read-only Bilibili browsing, QR login, subtitles and storyboards.
- **dsh-lpipe-home** assigns a personal folder and supplies main-session instructions for using it.

Every pipeline depends directly on Life Core. Starmap also needs Memory; Recall needs both Memory and Starmap. Standalone pipelines do not require the aggregate package.

### Install and get started

Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

1. Install and enable `dsh-life-pipline` through DSH plugin management, or install only the pipeline bundles you need.
2. Open **Settings → Lpipe settings**. Bind an existing LP main session, or select a workspace and create one. The session menu also offers an action to make a session the LP main conversation.
3. Use the aggregate detail page to switch components, or manage their individual plugin entries.
4. Connect chat accounts by QR login; select Starmap's provider, model and applicable reasoning effort; select an existing Home folder if needed.
5. Use pipeline tools in the LP main session. Memory defaults to that session; its **all sessions** switch also extends Starmap and Recall to other sessions.

Installing npm dependencies alone does not enable DSH bundles. A global npm install is not a substitute for installation in the host.

### Configuration and storage

The shared binding is stored in `~/.dsh/life-pipline/config.json` as `{"mainSessionId":"your-session-id"}`. Prefer the settings page. Components use separate `life-chat`, `life-wake`, `life-memory`, `life-starmap`, `life-recall` and `life-home` directories. Bilibili temporary media lives under `life-bili`; its login credentials use the host credentials service. `DSH_HOME` replaces the default `~/.dsh` base except for Starmap, which uses `DSH_LIFE_STARMAP_ROOT` as its directory override. Consult each package README for its configuration and tool examples.

Chat, Wake, Bilibili and Home tools or prompts are main-session scoped. Memory-related features follow the Memory scope. Starmap extraction makes model calls, and wake-ups can start model turns; check your budget before enabling them. Prompt-based autonomy rules do not replace host permissions or a filesystem sandbox.

### Troubleshooting

- **Missing settings page:** check that the Life Core bundle is enabled and inspect host loading or compatibility errors.
- **Other components stopped too:** disabling a prerequisite disables its dependents. Enabling a dependent enables prerequisites; re-enabling a prerequisite does not restore disabled dependents.
- **Pipelines remain after disabling the aggregate:** disable the individual components. Turning off the installer does not remove selected bundles.
- **Upgrades and backups:** the core split preserves existing data paths, bindings and channel credentials. Back up original Memory data, not just its rebuildable index.
- **No recall result:** check stored memory, extraction progress and session scope. Visible original text and recently visible recall results are excluded from selection.

### Development and license

Run `npm run build-client`, `npm test` and `npm pack --dry-run --json` from the repository root. This package is AGPL-3.0-or-later; Recall is MIT. Component and bundled third-party licenses remain in their respective packages.
