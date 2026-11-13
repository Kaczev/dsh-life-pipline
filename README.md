# dsh-life-pipline · 生命管线

[中文](#中文) · [English](#english)

## 中文

生命管线为 DeepSeek Harness（DSH）提供微信 / QQ 聊天、主动唤醒、长期记忆和 B 站浏览等功能。安装整合包即可获得生命核心和七条管线，各项功能仍可单独开关。

### 包含哪些功能

| 组件 | 用途 |
| --- | --- |
| 生命核心 | 公共设置、LP 主对话、工作区选择与组件依赖管理 |
| 聊天 | 接入微信和 QQ，收发消息、查看历史与附件 |
| 唤醒 | 闲置后自然醒来，或由模型按本机时间安排稍后继续；醒来时附上剩余安排 |
| 记忆 | 在本地保存对话原文及媒体 |
| 星图 | 从已存记忆中整理概念，供回忆查找 |
| 回忆 | 在聊天时想起相关旧事，按需查看原文和图片 |
| B 站 | 浏览推荐、搜索、评论、字幕与视频分镜 |
| 栖所 | 为模型指定个人文件夹 |

### 安装与开始使用

要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 在 DSH 插件管理中安装并启用 `dsh-life-pipline`。
2. 打开 **设置 → Lpipe 设置**，绑定一个 LP 主对话；也可先选择工作区，再创建新的主对话。已有会话的菜单中也有「设为 LP 主对话」。
3. 按需接入聊天账号、配置星图模型或选择栖所文件夹。
4. 回到主对话，与模型自然交流即可。组件开关可在整合包详情页或各组件的插件条目中管理。

只需要部分功能时，可以单独安装对应的 `dsh-lpipe-*` 插件。所有管线都需要生命核心；星图还需要记忆，回忆还需要记忆和星图，无需先安装整合包。

### 使用前了解

- 聊天、唤醒、B 站和栖所默认服务于 LP 主对话。记忆默认只记录主对话；打开记忆中的「所有对话生效」后，记忆、星图和回忆会一同扩展到其他会话。
- 星图整理记忆需要调用所选模型，唤醒也可能产生新的模型用量。启用前请检查模型和预算。
- 关闭前置组件会连带关闭依赖它的组件；重新打开前置后，下游需要自行开启。关闭整合包入口不会移除已经启用的独立管线。
- 记忆原文、媒体和聊天记录保存在本地，可能含有私人信息。备份时应保存相关数据目录，星图索引不能代替原始记忆备份。
- 聊天和栖所的自主操作仍受宿主权限约束，提示词中的授权不能代替文件系统沙箱。

看不到 Lpipe 设置时，请检查生命核心是否启用。回忆没有结果时，请确认已有记忆、星图已完成整理，且当前会话在作用范围内；刚出现在对话中的内容通常不会重复展示。

### 许可与致谢

本包采用 AGPL-3.0-or-later，回忆管线采用 MIT。聊天管线保留对 dsh-im 的致谢，B 站管线保留对 dsh-video-storyboard、dsh-bili-subagent 和 dsh-bili-whale 的致谢；第三方版权与许可随对应组件保留。详情见 [项目仓库](https://github.com/Kaczev/dsh-life-pipline)。

## English

Life Pipline adds WeChat / QQ messaging, wake-ups, long-term memory and Bilibili browsing to DeepSeek Harness. The aggregate package installs Life Core and seven pipelines, each with its own switch.

### Included features

- **Life Core:** shared settings, the LP main conversation, workspace selection and dependency management.
- **Chat:** WeChat / QQ messaging, history and attachments.
- **Wake:** resume after inactivity or at a time chosen by the model using the computer's local clock; wake notices include remaining plans.
- **Memory:** save original conversations and media locally.
- **Starmap:** organize concepts from stored memory for retrieval.
- **Recall:** bring relevant older conversations back into context, with original text and images available on demand.
- **Bilibili:** recommendations, search, comments, subtitles and video storyboards.
- **Home:** a personal folder for the model.

### Install and start

Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

1. Install and enable `dsh-life-pipline` through DSH plugin management.
2. Open **Settings → Lpipe settings** and bind an LP main conversation, or select a workspace and create one. Existing conversations also have a menu action to make them the LP main conversation.
3. Connect chat accounts, select a Starmap model or choose a Home folder as needed.
4. Return to the main conversation and chat normally. Manage switches in the aggregate detail page or individual plugin entries.

You can install individual `dsh-lpipe-*` plugins instead. Every pipeline requires Life Core; Starmap also requires Memory, and Recall requires Memory and Starmap. The aggregate package is optional.

### Before using it

Chat, Wake, Bilibili and Home serve the LP main conversation. Memory defaults to that conversation; its **all sessions** switch also extends Starmap and Recall. Starmap extraction and wake-up turns can incur model usage.

Disabling a prerequisite also disables its dependents. Re-enabling it does not restore those dependents automatically. Disabling the aggregate entry does not remove independent pipelines.

Local records and media may contain private information. Back up original memory and media rather than only the rebuildable index. Prompt-based autonomy does not replace host permissions or a filesystem sandbox.

If settings are missing, check Life Core. If recall returns nothing, check stored memory, extraction progress and conversation scope; text already visible in the conversation is normally excluded.

### License and credits

This package uses AGPL-3.0-or-later; Recall uses MIT. Chat retains its acknowledgment of dsh-im. Bilibili retains acknowledgments of dsh-video-storyboard, dsh-bili-subagent and dsh-bili-whale. Third-party copyright and license notices remain with their components. See the [repository](https://github.com/Kaczev/dsh-life-pipline).
