# dsh-lpipe-memory · 记忆管线

[中文](#中文) · [English](#english)

## 中文

把 DeepSeek Harness 会话中的选定原始事件和媒体保存到本地长期存储，供星图建立索引、回忆读取原句。记忆保存正文与来源，不负责生成摘要或概念索引。

### 安装与快速开始

在 DSH 插件管理中安装并启用 `dsh-lpipe-memory`。本包直接依赖 `dsh-life-core`，无需先装整合包。公共核心要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`；存储使用 Node 的 zstd 支持。

1. 在 **设置 → Lpipe 设置** 绑定 LP 主对话。
2. 默认只对主对话生效。需要记录其他会话时，在记忆块打开「所有对话生效」。
3. 完成一轮对话后检查记忆统计。该开关也控制星图、回忆的会话作用域，不影响聊天、唤醒或 B 站，不会删除已有历史。
4. 需要相关内容检索时另启用星图与回忆；本包本身没有面向模型的搜索工具。

配置位于 `~/.dsh/life-memory/config.json`：

```json
{
  "allSessions": false
}
```

### 保存与排除

保存四类事件：用户消息、助手消息（含思考及用量等字段）、工具调用、工具结果。正文放在 `text`，思考放在 `reasoning`，`parts` 保留图片、文件引用等结构块，避免再复制一遍文字。

系统 / 开发者消息、流式中间事件、运行期上下文不写入；回忆等管线生成的注入和 `recall_*` / `assoc_*` / `imagine_*` 工具调用及其结果也排除，避免将检索结果重新当作原始记忆。普通工具事件会保存，但下游星图和回忆另有正文筛选规则。

事件通常在 `turn/end` 后整轮落盘；没有结束事件时另有 60 秒保险刷写。尚未写入的内存缓冲不能替代持久化备份。

### 磁盘与校验

默认目录是 `~/.dsh/life-memory`，`DSH_HOME` 可替换默认基目录。每个会话有自己的 `sessions/<sessionId>/`，其中 `days/` 按本地凌晨 4 点换天：

- `<day>.jsonl.zst`：记忆行，热日按小帧追加，冷日可重打包。
- `<day>.idx`、`<day>.frames`：按全局 `seq` 定位数据。
- `<day>.media.zst`、`<day>.media.idx`：当天的媒体字节与内容哈希索引。
- 会话 `meta.json` 与根 `state.json`：会话信息和写入游标。

`seq` 全局递增，`prev` / `hash` 组成跨文件的哈希链，用于检测篡改。校验不能恢复丢失数据，也不提供加密。图片在同一天内按内容去重。备份时应暂停写入并保存整个记忆目录，包括媒体、索引和状态，而不只是正文文件。

### JavaScript 读取示例

从已安装的包导入公开的 `reader` 子路径。`seq` 是数值参数，不是 `{ seq }` 对象：

```js
import { MemoryReader } from 'dsh-lpipe-memory/reader'

const memory = new MemoryReader()
const sessions = memory.sessions()
const row = memory.read(10421)
const recent = memory.timeline({ limit: 20 })
const hits = memory.search({ text: '天文摄影', limit: 10 })
const problems = memory.verify()
console.log({ sessions, row, recent, hits, problems })
```

`verify()` 返回问题数组；空数组表示本次检查未发现问题。存储更新后调用 `reload()` 清缓存并重读状态。子串搜索和全链校验可能扫描大量数据，集成到宿主时应放到 worker 等冷路径，避免阻塞主线程。

### 历史导入与常见问题

仓库提供 DeepSeek 网页备份导入脚本；脚本不在 npm 发布的文件清单中，请在源码仓库根目录执行：

```bash
node components/dsh-lpipe-memory/scripts/import-deepseek-web.mjs --backup "C:/path/to/backup" --dry-run
```

先看 dry-run，备份现有记忆并停止并发写入后再考虑正式导入。网页导出未包含附件字节时，只能保留文件名和缺失说明。

- **没有新增记忆？** 检查主会话绑定、作用域及本轮是否已刷写；工具和系统事件并非全部进入记忆。
- **为何回忆里看不到普通工具输出？** 记忆保留与下游检索使用是两套规则；存储成功不表示它会参与抽星或摘录。
- **能否只重建星图恢复原文？** 不能。星图可重建，原始记忆与媒体必须单独备份。

许可：AGPL-3.0-or-later。

## English

Store selected original DSH session events and media locally for Starmap indexing and Recall reading. Memory preserves text and provenance; it does not generate summaries or concept indexes.

### Install and start

Install and enable `dsh-lpipe-memory` through DSH plugin management. It depends directly on Life Core; the aggregate installer is optional. Core requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`; storage uses Node's zstd support.

Bind the LP main session in **Settings → Lpipe settings**. Only that session is included by default. Enable **all sessions** in Memory settings to extend Memory, Starmap and Recall to other sessions. This does not change Chat, Wake or Bilibili and does not delete history. Complete a turn and inspect the memory statistics. Enable Starmap and Recall separately for retrieval; Memory registers no model-facing search tool.

Configuration is `{"allSessions":false}` in `~/.dsh/life-memory/config.json`.

### Stored events and disk layout

Memory stores user messages, assistant messages including reasoning, tool calls and tool results. Text and reasoning have separate fields; structural parts retain media and file references without duplicating text. System/developer messages, streaming intermediates, runtime context, generated recall-like injections and `recall_*` / `assoc_*` / `imagine_*` tool traffic are excluded. Ordinary tool events are stored, but downstream retrieval applies additional filtering.

Turns normally flush at `turn/end`, with a 60-second fallback. Unflushed buffers are not durable backups.

Data lives in `~/.dsh/life-memory`, or under `DSH_HOME`. Each session has a directory with day volumes, using a local 04:00 day boundary. Compressed event volumes have row/frame indexes; daily media packs have content-hash indexes. Session metadata and the root state track writing. Global `seq` values and a `prev`/`hash` chain detect tampering across files. Verification does not restore missing data or encrypt it. Back up the complete directory while writes are stopped, including media, indexes and state.

### Read and import

The JavaScript example above uses the public `dsh-lpipe-memory/reader` export. `read` accepts a numeric sequence ID. `verify()` returns an array of issues; an empty array means no issues were found by that check. Call `reload()` after storage changes. Substring search and full verification can scan substantial data; run such operations off the host's main thread.

The source repository includes a DeepSeek web-backup importer, not shipped in the npm package. Run the dry-run command above from the checkout, inspect its result, back up data and stop concurrent writers before a real import. Missing attachment bytes cannot be recovered from names alone.

If no new memory appears, check the session binding, scope and flush state. Stored ordinary tool output need not participate in Starmap or Recall. A rebuildable concept index is not a backup of the original text or media.

License: AGPL-3.0-or-later.
