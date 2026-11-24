# dsh-life-pipline · 生命管线

[中文](#中文) · [English](#english)

## 中文

生命管线为 DeepSeek Harness（DSH）提供微信 / QQ 聊天、主动唤醒和 B 站浏览等功能。整合包包含生命核心和七条可以单独开关的管线。

### 包含哪些功能

| 组件 | 用途 |
| --- | --- |
| 生命核心 | 公共设置、LP 主对话、工作区选择与组件依赖管理 |
| 聊天 | 接入微信和 QQ，收发消息、查看历史与附件 |
| 唤醒 | 闲置后自然醒来，或由模型按本机时间安排稍后继续；醒来时附上剩余安排 |
| [记忆](components/dsh-lpipe-memory/README.md) | 在主会话管理欲望与默认设定，不归档对话 |
| B 站 | 浏览推荐、搜索、评论、字幕与视频分镜 |
| 栖所 | 为模型指定个人文件夹 |
| 语气 | 分别设置措辞、句式、节奏和表达的显隐，只改变主对话的表达方式 |
| 聚焦 | 在开始下一段实质工作前，用等效层替代已经得出结果的工作区间，并保留后续需要的定义、经验、决策依据和结论 |

星图和回忆只保留历史源码，不能与当前的记忆管线一起使用。已有归档无需迁移，当前版本不会动它们。

### 安装与开始使用

要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 在 DSH 插件管理中安装并启用 `dsh-life-pipline`。
2. 打开 **设置 → Lpipe 设置**，绑定一个 LP 主对话；也可先选择工作区，再创建新的主对话。已有会话的菜单中也有「设为 LP 主对话」。
3. 按需接入聊天账号、选择栖所文件夹，或调整语气的四项设置。
4. 回到主对话，与模型自然交流即可。组件开关可在整合包详情页或各组件的插件条目中管理。

只需要部分功能时，可以单独安装对应的 `dsh-lpipe-*` 插件。表中七条管线都需要生命核心，无需先安装整合包。

### 使用前了解

- 聊天、唤醒、B 站和栖所只服务于 LP 主对话。记忆和语气默认也只在 LP 主对话生效；如需扩展，在 **设置 → Lpipe 设置** 的对应管线中打开「所有顶层对话生效」。两个开关独立、即时保存，不会保存尚未提交的编辑，也不会扩展到子智能体。记忆开启后，符合条件的对话共用同一份欲望和设定。
- 聚焦默认服务于 LP 主对话及其子智能体。聚焦可扩展到所有顶层对话，也可单独关闭子智能体继承。
- 语气提供四项可编辑的英文默认值，支持任意语言填写；四项全空时不注入。它只改变表达，不改变内容、态度和行为。旧版非空描述／示例需先备份并手动迁移，详见[语气管线说明](components/dsh-lpipe-tone/README.md)。
- 唤醒可能产生新的模型用量。启用前请检查模型和预算。
- 关闭前置组件会连带关闭依赖它的组件；重新打开前置后，下游需要自行开启。关闭整合包入口不会移除已经启用的独立管线。
- 旧版记忆归档和聊天记录保存在本地，可能含有私人信息。备份时请保存完整的数据目录。
- 聊天和栖所的自主操作仍受宿主权限约束，提示词中的授权不能代替文件系统沙箱。

看不到 Lpipe 设置时，请检查生命核心是否启用。

### 许可与致谢

本包采用 AGPL-3.0-or-later。聊天管线保留对 dsh-im 的致谢，B 站管线保留对 dsh-video-storyboard、dsh-bili-subagent 和 dsh-bili-whale 的致谢；第三方版权与许可随对应组件保留。仓库保留的旧回忆管线采用 MIT。详情见[项目仓库](https://github.com/Kaczev/dsh-life-pipline)。

## English

Life Pipline adds WeChat / QQ messaging, wake-ups and Bilibili browsing to DeepSeek Harness. The aggregate package installs Life Core and seven pipelines, each with its own switch.

### Included features

- **Life Core:** shared settings, the LP main conversation, workspace selection and dependency management.
- **Chat:** WeChat / QQ messaging, history and attachments.
- **Wake:** resume after inactivity or at a time chosen by the model using the computer's local clock; wake notices include remaining plans.
- **[Memory](components/dsh-lpipe-memory/README.md):** wishes and default facts for the main session; does not archive conversations.
- **Bilibili:** recommendations, search, comments, subtitles and video storyboards.
- **Home:** a personal folder for the model.
- **Tone:** configure diction, syntax, rhythm and expression visibility without changing content, attitude or behavior.
- **Focus:** before the next substantive piece of work, replace a span that already established a result, keeping the definitions, experience, guidance and conclusions still needed.

Starmap and Recall remain as historical source only and do not work with the current Memory plugin. Existing archives require no migration and are left untouched.

### Install and start

Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

1. Install and enable `dsh-life-pipline` through DSH plugin management.
2. Open **Settings → Lpipe settings** and bind an LP main conversation, or select a workspace and create one. Existing conversations also have a menu action to make them the LP main conversation.
3. Connect chat accounts, choose a Home folder, or adjust the four tone settings as needed.
4. Return to the main conversation and chat normally. Manage switches in the aggregate detail page or individual plugin entries.

You can install individual `dsh-lpipe-*` plugins instead. All seven pipelines require Life Core; the aggregate package is optional.

### Before using it

Chat, Wake, Bilibili and Home serve only the LP main conversation. Memory and Tone also default to the LP main conversation. To extend either one, turn on **Apply to all top-level conversations** in its panel under **Settings → Lpipe settings**. The switches save immediately and independently of unsaved edits, and do not extend to subagents. When Memory is enabled for all top-level conversations, they share the same wishes and settings.

Focus defaults to the LP main conversation and its subagents. You can extend Focus to all top-level conversations or turn off subagent inheritance separately. Wake-up turns can incur model usage.

Tone provides editable English defaults for four fields; rules may be written in any language. With all four fields blank, nothing is injected. Only expression changes, not content, attitude or behavior. Back up and manually migrate nonempty legacy descriptions or examples; see the [Tone guide](components/dsh-lpipe-tone/README.md).

Disabling a prerequisite also disables its dependents. Re-enabling it does not restore those dependents automatically. Disabling the aggregate entry does not remove independent pipelines.

Local records and media may contain private information. Back up the complete data directories. Prompt-based autonomy does not replace host permissions or a filesystem sandbox.

If settings are missing, check Life Core.

### License and credits

This package uses AGPL-3.0-or-later. Chat retains its acknowledgment of dsh-im. Bilibili retains acknowledgments of dsh-video-storyboard, dsh-bili-subagent and dsh-bili-whale. Third-party copyright and license notices remain with their components. The legacy Recall source retains its MIT license. See the [repository](https://github.com/Kaczev/dsh-life-pipline).
