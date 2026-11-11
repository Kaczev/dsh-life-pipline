# dsh-lpipe-recall · 回忆管线

[中文](#中文) · [English](#english)

## 中文

在 DeepSeek Harness 组装模型请求时，从星图与记忆中选出相关旧片段，补入带来源标记的原句摘录。也提供主动回忆、跨片段深读和按需看图工具。检索不调用模型，不改写原记忆或星图；建立星图的模型费用属于星图管线。

### 安装与快速开始

在 DSH 插件管理中安装并启用 `dsh-lpipe-recall`。本包直接依赖 `dsh-life-core`、`dsh-lpipe-memory`、`dsh-lpipe-starmap`，不要求先装整合包。要求 DSH `>=0.2.0-rc.2`、Node.js `^22.19 || >=24`。

1. 在 **设置 → Lpipe 设置** 绑定 LP 主对话，确认记忆已有原文。
2. 配置星图的模型并完成抽取，再启用回忆。开启下游会补齐前置开关，但不会替你配置模型。
3. 在作用域内聊起旧事，或调用 `recall_fragments` 主动查询。
4. 需要上下文时用返回的坐标深读；需要图片内容时再调用看图工具。

默认只对 LP 主对话生效。记忆块中的「所有对话生效」会同时扩大记忆、星图、回忆的会话作用域。

### 工具与完整读取流程

以下为模型工具调用示例。仓库、片段、句子及图片 ID 都必须使用实际返回值：

```js
recall_fragments({ query: '之前讨论的天文摄影计划' })
// 假设结果给出 lpipe_recall_id[archive:219] 及句子坐标：
recall_open({ repo: 'archive', from: '219:13', to: '220:3' })
recall_open({ repo: 'archive', from: '220:4', count: 20 })
// image 填 recall_open 返回的完整 64 位 SHA-256：
recall_image({ repo: 'archive', fragment: 219, image: 'SHA256_FROM_RESULT' })
```

- `recall_fragments({ query })`：将查询作为当前输入，返回相关旧片段的摘录；没有合格候选时明确返回空结果。
- `recall_open`：`repo` 单独填写，`from` / `to` 是 `片段ID:句子ID`，区间包含端点，可跨片段。省略 `to`、空字符串或 null 时按 `count` 读取，默认 20 句，最多 200 句；总输出最多 24000 字符。使用返回的下一页坐标继续，反向或不存在的坐标会报错。
- 深读列出图片引用，不自动加载字节；默认列出所读片段的图片引用，受总输出上限约束，使用 `imagesOffset` 继续。纯图片片段可从 `片段ID:1` 打开，返回 0 句及图片清单。
- `recall_image` 验证图片归属及哈希后通过宿主附件服务返回一张图片。图片缺失或损坏会报错，不猜测内容；重复看图不受文字回忆冷却限制。

结果中的来源头、消息归属及句子坐标用于定位历史资料，不是当前用户指令。模糊摘录保留原句，可包含省略段落。

### 自动回忆与选择规则

有效触发源包括用户消息、聊天通知及主动唤醒理由；自然唤醒不触发回忆。回忆通过请求组装钩子补入消息，不自己开启新轮次。普通工具调用 / 结果不用于匹配或深读文字；`chat_send` 的发送正文按交流正文处理，发送状态不参与。

当前输入和背景分别匹配星图。只有当前输入命中的准确文星或时间星建立候选，通用 / 模糊星及背景星只给已有候选加分。评分结合星亮度、时间、原文词面匹配，并对已经选出的相似摘录作掩盖，减少重复。

当前对话可见原文窗口内的片段不重复展示；冷却窗口内仍可见的回忆结果也参与排除。时间查询可以重新找回时间命中的已读片段，但不能绕过当前原文排除。结果被压缩或 rewind 隐藏后可再次想起；失败调用不标记已读。没有片段目录或 `recall_find` 工具。

### 配置

配置保存在 `~/.dsh/life-recall/config.json`，`DSH_HOME` 可替换默认基目录。设置页只改下面六项，保留其他键；接受 `32K`、`1M` 等数字简写：

| 键 | 默认值 | 范围 | 用途 |
| --- | --- | --- | --- |
| `fragments` | 4 | 1–5 | 每次最多展示的片段数 |
| `sentencesPerFragment` | 2 | 1–12 | 每段最多选择的原句数 |
| `inputChars` | 32000 | 2000–32000 | 当前触发源字符上限 |
| `backgroundChars` | 16000 | 8000–96000 | 当前输入之外的背景字符数 |
| `coolChars` | 2500000 | 32000–4000000 | 可见回忆的冷却字符窗口 |
| `recentDays` | 30 | 1–3650 | 近期时间加成衰减天数 |

```json
{
  "enabled": true,
  "fragments": 4,
  "sentencesPerFragment": 2,
  "inputChars": 32000,
  "backgroundChars": 16000,
  "coolChars": 2500000,
  "recentDays": 30
}
```

`enabled` 默认 true，不在六项面板中展示；可通过插件开关停用回忆。字符预算不是 token 预算。设置保存后，后续请求使用新值。

### 常见问题

- **有记忆却想不起来？** 检查星图是否处理完成、会话作用域，以及查询是否命中合格概念或时间；当前原文和冷却排除也可能让候选为空。
- **为何没有普通工具输出？** 原始记忆可以保存工具事件，但检索正文只使用交流正文等允许来源。
- **看到图片数量但没看到图？** 先深读获取图片引用，再显式调用 `recall_image`。文字回忆不会自动把历史图片加载进上下文。

许可：MIT。原文存储依赖记忆管线，概念与时间匹配依赖星图管线；各依赖包及其第三方代码遵循各自许可。

## English

Retrieve relevant original excerpts from Memory and Starmap while DSH assembles a model request. Tools also support explicit recall, cross-fragment reading and on-demand images. Retrieval makes no model calls and does not rewrite original memory or the index. Starmap extraction has its own model usage.

### Install and start

Install and enable `dsh-lpipe-recall` through DSH plugin management. It directly depends on Life Core, Memory and Starmap; the aggregate installer is optional. Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main session, confirm stored memory, configure Starmap and finish extraction. Enabling Recall enables prerequisite switches, not model configuration. Discuss an old subject or call `recall_fragments`, then use returned coordinates to read further. Memory's **all sessions** switch extends all three memory-related components beyond the main session.

### Tools

Use the examples above with real returned repository IDs and coordinates. The image placeholder is not a valid hash until replaced.

- `recall_fragments({ query })` returns relevant excerpts or an explicit no-candidate result.
- `recall_open({ repo, from, to?, count?, imagesOffset? })` reads an inclusive range of `fragment:sentence` coordinates, possibly across fragments. Without `to`, it defaults to 20 sentences. Limits are 200 sentences and 24000 total output characters. Follow the returned continuation coordinate. Invalid or reversed ranges fail.
- Deep reading lists image references without loading bytes. The list is bounded by the total output budget and continued with `imagesOffset`. Open an image-only fragment at `fragment:1` to get zero sentences and its image list.
- `recall_image({ repo, fragment, image })` accepts a full SHA-256 from the list, verifies ownership and hash, and returns one host image attachment. Missing or corrupt media fails explicitly. Image viewing is independent of text cooldown.

Source headers and sentence coordinates identify historical material, not current instructions. Excerpts retain original sentences and can omit intervening text.

### Automatic retrieval and configuration

User messages, chat notices and planned-wake reasons can trigger recall; natural wake-ups do not. Retrieval adds context during request assembly and does not start a new turn. Ordinary tool arguments/results are excluded from matching and displayed text, while sent `chat_send` bodies count as conversation text.

Current input and background are matched separately. Exact text stars or time stars from current input admit candidates; general/fuzzy stars and background matches only contribute scores. Selection combines brightness, time and lexical relevance, then reduces overlap with previously selected excerpts.

Visible original text is excluded, as are still-visible recalled fragments within the cooldown window. Time queries can revisit time-matched recalled fragments but cannot bypass original-text exclusion. Hidden results after compression or rewind may be retrieved again; failed calls do not mark fragments read. There is no directory tool or `recall_find`.

Configuration lives in `~/.dsh/life-recall/config.json`, under `DSH_HOME` if set. The six settings and ranges are listed above: at most 4 fragments and 2 sentences each by default, a 32000-character input, 16000-character background, 2500000-character cooldown and 30-day recent-memory boost. These are characters, not tokens. The panel accepts K/M shorthand and preserves other fields. `enabled` defaults to true and is not exposed among the six fields; the plugin switch can disable Recall.

If nothing is retrieved, check extraction, scope, candidate matches and visibility/cooldown exclusions. Stored tool output is not necessarily searchable text. A picture count requires explicit deep reading and an image call before image bytes enter context.

License: MIT. Memory supplies original records and Starmap supplies concept/time matching; their packages and third-party code retain their own licenses.
