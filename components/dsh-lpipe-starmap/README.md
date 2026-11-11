# dsh-lpipe-starmap · 星图管线

[中文](#中文) · [English](#english)

## 中文

从生命管线的原始记忆中抽取概念及其原句位置，建立可重建的索引，供回忆匹配。星图不保存第二份完整正文，不生成记忆摘要，也不使用向量数据库；原始记录仍由 `dsh-lpipe-memory` 保存。

### 安装与快速开始

在 DSH 插件管理中安装并启用 `dsh-lpipe-starmap`。直接依赖 `dsh-life-core` 和 `dsh-lpipe-memory`，不要求安装整合包。要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 在 **设置 → Lpipe 设置** 绑定 LP 主对话，确认记忆已经写入。
2. 在星图块选择提供者、模型及思考强度。模型不提供思考强度时允许留空；支持强度的模型需要选择。
3. 按需设置输出 token 上限与并发数，再启动抽星并查看进度。
4. 新增轮次的自动抽取遵循记忆作用域；手动抽取与原文检查可以覆盖库内已有历史。记忆的「所有对话生效」开关不会删除既有数据。

**抽取会调用所选模型并消耗额度。** 未配置好或模型调用失败时，未处理记忆仍保持未处理状态，不以规则猜测代替抽取。

### 配置

配置保存在 `~/.dsh/life-starmap/config.json`。以下为示例，提供者、模型和强度必须替换为宿主实际支持的值：

```json
{
  "provider": "YOUR_PROVIDER",
  "model": "YOUR_MODEL",
  "reasoningEffort": "YOUR_SUPPORTED_EFFORT",
  "effortFree": false,
  "maxTokens": 32000,
  "concurrency": 3
}
```

`maxTokens` 默认 32000，范围 200–32000，包含思考输出预算；`concurrency` 默认 3，范围 1–8。`effortFree: true` 表示所选模型不提供思考强度，不应用来绕过模型能力检查。设置页可按宿主模型元数据处理此情况。

默认数据根为 `~/.dsh/life-starmap`；`DSH_LIFE_STARMAP_ROOT` 可单独指定星图目录；星图根目录不读取 `DSH_HOME`。

### 索引内容

- 从用户、助手正文与思考、聊天发送正文等有效来源提取概念；普通工具输入 / 结果不抽星。聊天身份、渠道包装与自然唤醒文本有专门的来源筛选。
- 文星区分准确、模糊与通用类别。时间定位表达用于查询时的时间星匹配，不应被当成普通准确概念；时间星是由片段时间构建的只读视图。
- 星源保存概念对应的轮次与句子证据；连边在查询时按证据聚合。匹配接口返回星信息、基础亮度与最后命中位置，环境权重由回忆管线处理。
- 写入星表与星源后再推进构建水位。中断后可以重试未完成轮次。重抽会再次调用模型，索引可重建不代表重建免费。

磁盘主要包含 `state.json`、`stars.jsonl`、`lexicon/` 和 `sources/`。修改抽取规则不一定自动清理旧索引；需要重抽时先备份并检查设置，不要为了升级 README 删除数据。

### 查询接口

宿主 RPC 端点为 `/api/dsh-lpipe-starmap`，以下是只读方法的请求体示例：

```json
{
  "method": "starmap.star",
  "payload": { "name": "天文摄影" }
}
```

| 方法 | 参数与用途 |
| --- | --- |
| `starmap.progress` | 构建轮次、待处理轮次和星数等进度 |
| `starmap.star` | `{ "id": "..." }` 或 `{ "name": "..." }`，查来源 |
| `starmap.turn` | `{ "session": "...", "turn": 1 }` 或 `{ "key": "session#1" }`，查该轮星星 |
| `starmap.links` | `{ "id": "...", "min": 0, "limit": 20 }`，查连接及证据 |

这些是宿主管理 RPC，不是模型工具名。JavaScript 集成可使用公开子路径 `dsh-lpipe-starmap/brightness`、`/match`、`/time`、`/query` 等；请按对应源码接口传参。

### 常见问题

- **待处理记忆一直没减少？** 检查提供者、模型、强度、宿主模型服务及抽取错误；输出额度太小也可能截断 JSON。
- **进度为什么包含其他会话历史？** 面板与手动抽取面向已存历史，实时自动抽取才按当前记忆作用域触发。
- **抽完仍没有回忆？** 需要另外启用回忆管线；回忆还应用候选准入、可见原文排除与冷却规则。

许可：AGPL-3.0-or-later。

## English

Build a rebuildable concept index over original Life Pipline memory, preserving sentence-level evidence for Recall. Starmap does not duplicate the complete original text, generate memory summaries or use a vector database. Memory remains the source of record.

### Install and start

Install and enable `dsh-lpipe-starmap` through DSH plugin management. It depends directly on Life Core and Memory; the aggregate package is optional. Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main session, confirm Memory has stored turns, then select a provider, model and applicable reasoning effort in **Settings → Lpipe settings**. Effort may be empty only for models without an exposed effort choice. Set a token budget and concurrency, start extraction and inspect progress. Automatic extraction of new turns follows Memory scope; manual extraction and history checks cover stored history.

Extraction makes model calls and incurs usage. Missing configuration or failed calls leave memory unprocessed rather than replacing extraction with guessed concepts.

### Configuration and indexing

The JSON example above shows `life-starmap/config.json`; replace all routing placeholders with supported host values. `maxTokens` defaults to 32000, range 200–32000, including reasoning output. Concurrency defaults to 3, range 1–8. `effortFree` indicates that the model exposes no reasoning-effort choice.

The default directory is `~/.dsh/life-starmap`. `DSH_LIFE_STARMAP_ROOT` overrides this directory; Starmap does not read `DSH_HOME` for its root. Files include state, stars, lexicon snapshots and sentence sources.

Concepts come from eligible user/assistant text, reasoning and sent chat bodies. Ordinary tool arguments/results do not become concepts. Source projection filters channel wrappers, identity metadata and natural-wake text. Text stars have exact, fuzzy and general categories; time stars are read-only views over fragment timestamps. Links aggregate evidence at query time. Matching exposes base brightness and the last match position; Recall applies environmental weights.

Build watermarks advance after source/index writes, allowing unfinished turns to be retried. Rebuilding can make model calls again. Rule changes do not necessarily purge old indexes automatically; do not delete data merely to update documentation.

### Queries and troubleshooting

The RPC table above lists read-only management methods at `/api/dsh-lpipe-starmap`, not model tools. Public JavaScript exports include `/brightness`, `/match`, `/time` and `/query`; use their source signatures when integrating.

If progress stalls, check routing, effort selection, model-service errors and the output budget. History counts may include sessions outside the current live scope because manual operations cover stored history. For retrieval, enable Recall separately; candidate admission and cooldown can still produce no result after indexing.

License: AGPL-3.0-or-later.
