# 聚焦管线 · dsh-lpipe-focus

聚焦管线管理 LP 主会话窗口内的短期工作上下文。多步搜索、读文件和改代码结束后，模型可以单独调用 `focus_conclude`，把已经用完的过程折叠成简短结论追加到结论层末尾，不改动前面的常驻前缀与旧结论，从而保留提供方的提示词前缀缓存（KV Cache）。

只有当窗口总字符达到过线整理阈值，或距离上一次模型交互超过闲置整理时长时，宿主才会用纯程序归并同名键、清理标空作废的键，并按上限裁剪结论层，全程不额外调用模型。所有表层替换均通过 DSH 的 `surfaceOp: replace` 完成，只影响发给模型的消息表层，不会删除聊天界面里的历史记录，也不会生成伪造的用户发言气泡。

## 四层表层与折叠规则

主会话的模型可见表层按顺序分为四层：

1. **最底层**：首条 `system/message` 及首轮对话前的初始 `runtime-context`、`skill-catalog` 与 `developer/message`，折叠与整理时永不遮蔽。
2. **结论层**：连续的 `layer: 'conclusion'` 节点。日常每次折叠只在结论层末尾追加一条新节点；同名 `key` 以最新一条为准，传入 `text: ""` 表示该键作废。
3. **提示层**：紧跟在结论层后面的单条目标节点。模型填写 `objective` 时保存下一步目标；未填写时自动承接被折叠区间内最近一条真实用户、聊天或唤醒消息；区间内没有新触发消息时沿用上一轮提示层。
4. **未转化层**：提示层之后的活跃对话、思考链、工具调用与结果。未转化层累积到提醒线时，宿主会在下一步附带一条不显示窗口百分比的 `<system-reminder>` 提醒；模型若仍在查看原始细节可推迟折叠，折叠后该提醒一并被遮蔽。

`focus_conclude` 不能与其他工具在同一条回复中并发调用。若同一条 `assistant/message` 含有其他工具调用，本次 `focus_conclude` 会直接返回参数错误，下一步不做任何表层替换。会话存在未闭合的宿主 `compaction/start` 锁时，聚焦管线同样跳过改写。

本包只依赖生命核心，默认仅对当前绑定的 LP 主会话生效；打开设置块中的「所有对话生效」后，全部顶层对话均可使用聚焦折叠与整理（子 agent 始终保持隔离）。它不依赖也不读写记忆、星图和回忆管线。

## 作用域与四项设置

在 **设置 → Lpipe 设置** 的聚焦管线块中，顶部提供默认关闭的「**所有对话生效**」（`allSessions`）开关，点击立即保存；下方可调整四项整数参数（字符数支持 `K`、`M` 简写，按约 2 字符折合 1 token 设定默认值）：

| 字段 | 标签 | 默认值 | 范围 | 作用 |
| --- | --- | --- | --- | --- |
| `idleMinutes` | 闲置整理时长 | `60` 分钟 | `5`–`1440` | 距上次完成模型交互超过该时长后，下次请求前由程序归并结论层 |
| `compactChars` | 过线整理阈值 | `512K` 字符 | `32K`–`4M` | 表层字符加上本步待入消息达到此值时，立即归并结论层 |
| `nudgeChars` | 未转化提醒线 | `256K` 字符 | `16K`–`2M` | 未转化层达到此字符数时轻推一次整理提醒；须满足 `<= compactChars` |
| `maxConclusionChars` | 结论层上限 | `64K` 字符 | `4K`–`512K` | 程序大整理后结论层保留的最大字符数，超限时淘汰最早条目；须满足 `< compactChars` |

如果结论层原本只有 1 个节点、无重复键、无标空墓碑且未超过上限，即使达到闲置时长也不会发出无意义的替换。

「恢复默认」只把草稿填回默认值，保存后生效；「撤回」恢复已保存的值；「保存」仅在存在有效未保存改动时启用。

## 配置与接口

配置保存在 `DSH_HOME/life-focus/config.json`（未设置 `DSH_HOME` 时为 `~/.dsh/life-focus/config.json`），诊断日志写入同目录 `focus.jsonl`（2 MiB 自动截尾）。配置文件不存在时使用默认值且不提前建空目录；若文件 JSON 损坏或字段越界，读取直接报错并在设置页提供重试，不会用默认值覆盖原文件。保存采用同目录临时文件原子替换，并保留未知扩展键。

使用宿主认证连接发送 `POST /api/dsh-lpipe-focus`（`Content-Type: application/json`）：

```json
{
  "type": "client-request",
  "rpcId": "caller-generated-id",
  "method": "dsh-lpipe-focus",
  "payload": {
    "method": "focus.config.save",
    "payload": {
      "idleMinutes": 60,
      "compactChars": 512000,
      "nudgeChars": 256000,
      "maxConclusionChars": 64000
    }
  }
}
```

`focus.config` 接收空对象，返回 `{ ok: true, value: { config, defaults } }`；`focus.config.save` 接收至少一个已知整数字段并校验跨字段关系，返回 `{ ok: true, value: { config } }`。错误返回 `{ ok: false, error: { code, message, details } }`，外层封装为 `{ type: 'server-response', rpcId, result }`。

## 构建与测试

```bash
node components/dsh-lpipe-focus/scripts/build-client.mjs
node --test "components/dsh-lpipe-focus/test/*.test.mjs"
```

客户端源码 `client/panel.js` 构建生成 `lib/client.js`。测试覆盖四层折叠与前缀 `seq` 守恒、提示层承接、并发工具拦截、过线与闲置程序归并、提醒防刷屏与自清理、压缩锁避让、主会话隔离、配置文件损坏保护、RPC 信封及客户端状态机。
