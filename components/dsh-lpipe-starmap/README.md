# dsh-lpipe-starmap · 星图管线

[中文](#中文) · [English](#english)

## 中文

从生命管线已经保存的记忆中整理概念及其出处，帮助回忆找到相关旧事。原始对话仍由记忆管线保管，星图保存的是可以重新建立的索引。

### 安装与开始使用

在 DSH 插件管理中安装并启用 `dsh-lpipe-starmap`。插件需要生命核心和记忆，无需先装整合包。要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 打开 **设置 → Lpipe 设置**，绑定 LP 主对话，并确认已有保存的记忆。
2. 在星图设置中选择提供者、模型和适用的思考强度。模型没有强度选项时可以留空。
3. 检查输出预算与并发数，启动抽星并查看进度。
4. 若要在聊天中自动想起旧事，还需要启用回忆管线。

新增对话的自动整理遵循记忆的作用范围；手动整理和进度检查可以涉及库内已有的其他会话历史。

### 模型与费用

**整理记忆会调用所选模型并消耗额度。** 默认输出预算为 32000 token，包含思考输出，并发数为 3。可以在设置页按模型能力和预算调整，输出过少可能导致整理失败。

未完成配置或模型调用失败时，记忆会保持待处理状态。请检查错误后再重试；重新整理也可能再次产生模型用量。

### 常见问题

- **待处理数量没有减少？** 检查模型、思考强度、服务可用性及输出预算。
- **为什么进度里有其他会话？** 手动操作面向已存历史，自动整理才遵循当前记忆作用范围。
- **整理完成却没有回忆？** 检查回忆是否启用、当前话题是否有关联，以及相关原文是否已经在当前对话中出现。
- **索引能代替备份吗？** 索引可以重建，但原文与媒体应单独备份。主动唤醒只提取安排缘由，附带的剩余安排和设置状态不参与抽星。

许可：AGPL-3.0-or-later。

## English

Organize concepts and their sources from stored Life Pipline memory so Recall can find relevant older conversations. Memory keeps the original records; Starmap maintains a rebuildable index.

### Install and start

Install and enable `dsh-lpipe-starmap` through DSH plugin management. It requires Life Core and Memory, not the aggregate package. Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main conversation in **Settings → Lpipe settings** and confirm that memory has been saved. Select a provider, model and applicable reasoning effort in Starmap settings; effort can be empty for models without that choice. Review the output budget and concurrency, then start extraction and watch progress. Enable Recall separately for conversational retrieval.

Automatic processing of new conversations follows Memory scope. Manual processing and progress checks can include other conversations already in storage.

### Model usage

**Extraction calls the selected model and incurs usage.** Defaults are a 32000-token output budget, including reasoning, and concurrency of 3. Adjust these in settings for your model and budget; too little output can cause extraction failures.

Missing configuration or failed calls leave records pending. Check the error before retrying. Reprocessing can incur model usage again.

### Troubleshooting

If progress stalls, check the model, reasoning effort, service availability and output budget. Other conversations may appear because manual operations cover stored history.

If extraction finishes but no recall appears, check that Recall is enabled, the topic has relevant history and the original text is not already visible. A rebuildable index cannot replace a backup of original text and media. Planned wakes contribute only their reason; attached schedule snapshots and settings updates are excluded from extraction.

License: AGPL-3.0-or-later.
