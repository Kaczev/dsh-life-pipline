# dsh-lpipe-memory · 记忆管线

把会话原文逐字投影到长期文件，供星图（索引）与回忆（读取）按 `seq` 回取。

**索引可以重建，原文不能。** 这一层只做一件事：把该留的原文留住，一字不改，永不删除。

## 存什么

| 事件 | 存的内容 |
| --- | --- |
| `user/message` | `text`、`parts`、`source`（注入按 `source.kind` 打标，全部保留） |
| `assistant/message` | `text`、`reasoning`、`parts`、`usage`、`interrupted` |
| `tool/call` | `name`、`arguments`（模型产出的原始 JSON 字符串） |
| `tool/result` | `text`、`parts`、`isError`、`error` |

不存：`system/message`、`developer/message`、`request/header`、`turn/*`、`step/*`、`session/end-seed`、`assistant/attempt`、`assistant/message.stream`。`turn` / `step` 作为字段记在每行上。

## 存在哪

```
~/.dsh/life-memory/
├── sessions/<sessionId>/
│   ├── meta.json                 { id, title, startedAt, lastAt, rows, days:[…] }
│   ├── days/2026-11-05.jsonl.zst 一天一卷，zstd 多帧（8 KB 一帧）
│   ├── days/2026-11-05.idx       偏移表：seq → (帧号, 帧内偏移, 长度)
│   └── days/2026-11-05.frames    帧表：帧号 → (文件偏移, 字节数)
├── media/6e/cb/<sha256>.png      全局内容寻址，跨会话共享同一份字节
└── state.json                    全局游标：最后一条的 seq/hash，以及每个会话写到哪
```

- **一个对话一个文件夹**，互不干扰；文件夹里按天分卷。
- **`seq` 全局单调**，不按会话来——跨会话的时间线要一把统一的尺子；每行另有 `session` 字段。
- **4 点换天**（本地时间）：04:00 到次日 03:59 归同一天。
- **哈希链**：每行 `prev`/`hash` 相连，跨文件跨天不断；改一个字，那一行就断。
- **冷日打包**：正在写的那一天保持小帧追加（只压新写的一段）；已经过完的那一天，启动后会整天重打成一条 zstd 19 流。压缩等级不是关键，一次能看见多少连续文本才是：8 KB 一帧等于每 8 KB 清空一次字典，往小帧上提等级反而会变大。真实库实测 4.31 MB → 2.72 MB。
- **一行只存一次**：正文在 `text`、思考在 `reasoning`，`parts` 只留搬不走的结构块（图片 / 文件 / 工具结果）。早期版本把文本块也复制进 `parts`，占过整库 42% 的体积；`state.json` 的 `version: 2` 标记新格式，宿启动时发现旧版本会自动重建一次（旧库改名成 `life-memory.bak-<时间>` 留着）。

## 读

```js
import { MemoryReader } from 'dsh-lpipe-memory'

const memory = new MemoryReader()
memory.read({ seq: 10421 })                                  // 一行原文（只解一帧）
memory.timeline({ from, to, limit, session })                // 按时间回放
memory.search({ text, session, limit })                      // 子串搜索（冷路径，放 worker）
memory.verify({ from, to })                                  // 哈希链校验，返回问题清单
```

按 `seq` 取一行只解一帧（本机约 35 µs，命中帧缓存为零解压）；不要每次都全扫——全扫是 228 ms/30 MB 的活，交给 worker。

## 安装

先装 `dsh-life-pipline`（公共页与 `clock`、`session` 等共用模块），再装本包，或者在仓库里：

```bash
node scripts/install-local.mjs
```

本包自带 `cordis.patch.yml`，只插自己一行；「Lpipe 设置」那一页仍由 `dsh-life-pipline` 提供。

## 还没有的

- 词表/倒排索引：属于星图（`dsh-lpipe-starmap`），本层只提供 `search` 的全扫兜底。
- 图片字节转存 `media/`：M1 先保留 `parts` 里的附件引用，转存与去重在下一步接上。
- 冷归档与分卷轮转。

许可：AGPL-3.0-or-later。

## 写入时机

一轮说完（`turn/end`）才把这一轮的行压成帧写进去：盘上不会出现半截的轮次。中间的消息、思考、工具调用都先攒在内存里；万一某轮没有 `turn/end`（60 秒保险计时到点）也会落一次，不会一直攒着。

## 从 DeepSeek 网页备份导入历史

`scripts/import-deepseek-web.mjs` 把网页版导出的 `history_messages`（`原始数据/015.json`）投影成记忆行：`REQUEST` → `user/message`，`RESPONSE` + `THINK` → `assistant/message`（正文与思考分开存），`TOOL_SEARCH` / `TOOL_OPEN` → `tool/call` 与 `tool/result`，`TIP` 丢弃。

```bash
node components/dsh-lpipe-memory/scripts/import-deepseek-web.mjs   --backup "C:/path/to/备份/2026-11-05_212359" --dry-run
```

会话名默认 `deepseek-web-<chat_session.id>`，标题取会话标题。重复跑是幂等的（按会话内事件序号去重）。附件只有文件名，字节当年没有导出，所以只能留名字并标注 `mediaError`。
