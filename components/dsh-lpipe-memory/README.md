# dsh-lpipe-memory · 记忆管线

[中文](#中文) · [English](#english)

## 中文

把 DeepSeek Harness 的对话原文和媒体保存到本地。本包负责归档，不会自动把旧记录注入当前对话。

### 安装与开始使用

在 DSH 插件管理中安装并启用 `dsh-lpipe-memory`。插件需要生命核心，无需先装整合包。要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 打开 **设置 → Lpipe 设置**，绑定 LP 主对话。
2. 默认只记录主对话。希望记录其他会话时，打开记忆中的「所有对话生效」。
3. 完成一轮对话后查看记忆统计。

「所有对话生效」决定哪些会话会被记录，不改变聊天、唤醒或 B 站的范围，也不会删除已有历史。

### 会保存什么

记忆保存用户与助手消息、思考内容，以及普通工具活动和相关媒体。系统提示、临时运行上下文及检索功能生成的重复注入会排除，避免把检索结果再次当成原始经历。

保存通常在一轮对话结束后完成，异常情况下另有定时写入。刚收到消息时，统计可能还没有更新。

### 隐私与备份

记忆可能包含私人对话、思考和附件。数据保存在宿主的本地记忆目录中，默认位于用户主目录的 `.dsh/life-memory` 下；配置过宿主数据位置时，以实际目录为准。压缩和完整性检查不等于加密，也不能恢复已经丢失的文件。

备份前应暂停写入，并保存完整记忆目录，包括媒体、索引与状态。只备份文字会丢失图片等资料。

没有新增记录时，请检查主对话绑定、作用范围，以及当前一轮是否已经保存。

许可：AGPL-3.0-or-later。

## English

Keep original DeepSeek Harness conversations and media locally. This package archives records; it does not inject them into the current conversation.

### Install and start

Install and enable `dsh-lpipe-memory` through DSH plugin management. It requires Life Core, not the aggregate package. Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main conversation in **Settings → Lpipe settings**. Only that conversation is recorded by default; turn on **all sessions** in Memory settings to include others. Complete a turn and inspect the statistics.

The all-sessions option determines which conversations get recorded. It does not change Chat, Wake or Bilibili scope, or delete stored history.

### What is saved

Memory retains user and assistant messages, reasoning, ordinary tool activity and related media. System prompts, temporary runtime context and generated recall-like injections are excluded to avoid storing retrieved material again as an original experience.

Records normally save after a turn ends, with a timed fallback. Statistics may not update immediately after a message arrives.

### Privacy and backups

Records may contain private conversations, reasoning and attachments. The default local folder is `.dsh/life-memory` under your home directory; a customized host data location can change this. Compression and integrity checks do not encrypt data or restore missing files.

Pause writes before backing up the complete memory folder, including media, indexes and state. Text-only backups lose media.

If no records appear, check the main-conversation binding, scope and whether the current turn has been saved.

License: AGPL-3.0-or-later.
