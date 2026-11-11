# dsh-lpipe-recall · 回忆管线

[中文](#中文) · [English](#english)

## 中文

让 DeepSeek Harness 在聊天时想起相关旧事，把带有来源的原句摘录放回对话。模型还可以主动查找记忆、阅读更完整的上下文，并按需查看历史图片。

### 安装与开始使用

在 DSH 插件管理中安装并启用 `dsh-lpipe-recall`。插件需要生命核心、记忆和星图，无需先装整合包。要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 打开 **设置 → Lpipe 设置**，绑定 LP 主对话，并确认记忆已经保存。
2. 配置星图模型，完成记忆整理，再启用回忆。前置组件会随依赖启用，但模型仍需自行设置。
3. 回到主对话，聊起过去的内容，或直接请模型回想某件事。

默认只对主对话生效。记忆中的「所有对话生效」会同时扩展记忆、星图和回忆的作用范围。

### 会怎样想起旧事

回忆围绕当前话题选取相关原句。默认每次最多展示 4 个片段，每个片段最多 2 句；需要更多上下文时，模型可以继续查看原文。摘录可能省略中间段落，历史材料应按其原有时间和来源理解。

当前对话中已经可见的原文，以及近期仍可见的回忆，通常不会重复展示。明确提到某个时间可以帮助找回当时的经历；没有合适结果时，回忆会保持为空。

图片按需查看，不会因为提到旧事就自动把所有历史图片送入当前对话。图片文件缺失时，也无法仅凭文字引用恢复画面。

### 设置与费用

设置页可以调整片段数、每段句数、参考的输入和背景长度、重复回忆的冷却范围，以及近期记忆的时间加成。长度按字符计算，不是 token。多数情况下可以先用默认值。

检索本身不额外调用模型；提前整理星图需要模型用量，回忆加入上下文后也会占用当前对话的输入预算。原始记忆和星图不会因一次回忆被改写。

有记忆却想不起来时，请检查星图整理进度、当前会话是否在作用范围内，以及相关内容是否已经出现在当前对话中。记忆保存了某项活动，不代表它一定会作为交流正文被检索。

许可：MIT。记忆、星图及其第三方代码遵循各自许可。

## English

Help DeepSeek Harness remember relevant older conversations by bringing original excerpts and their sources into the current chat. The model can also look for a memory explicitly, read more context and view historical pictures on demand.

### Install and start

Install and enable `dsh-lpipe-recall` through DSH plugin management. It requires Life Core, Memory and Starmap, not the aggregate package. Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main conversation in **Settings → Lpipe settings**, confirm saved memory, configure a Starmap model and finish extraction. Enable Recall, then discuss an older subject or ask the model to remember an event. Dependency switches are enabled as needed, but model configuration remains yours to set.

Only the main conversation is included by default. Memory's **all sessions** option extends Memory, Starmap and Recall together.

### How memories appear

Recall selects original sentences related to the current topic. Defaults are up to 4 fragments with up to 2 sentences each; the model can read further when more context is needed. Excerpts may omit intervening passages, and historical material should be understood by its original date and source.

Original text already visible in the conversation, and recently recalled material still visible, are normally excluded. Mentioning a specific time can help retrieve events from that period. No suitable match means no excerpt.

Historical pictures are viewed on demand rather than all loaded into the conversation automatically. A textual reference cannot restore a missing image file.

### Settings and usage

Settings cover fragment and sentence counts, input and background lengths, repeat-recall cooldown and the recent-memory time boost. Lengths are measured in characters, not tokens. Start with the defaults unless you need to adjust them.

Retrieval makes no extra model calls. Preparing Starmap does incur model usage, and recalled text consumes input context in the current conversation. Retrieval does not rewrite stored memory or its index.

If nothing appears, check extraction progress, conversation scope and whether the content is already visible. Stored activity is not necessarily eligible conversational text for retrieval.

License: MIT. Memory, Starmap and their third-party code retain their own licenses.
