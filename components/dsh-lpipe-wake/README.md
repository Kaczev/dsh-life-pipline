# dsh-lpipe-wake · 唤醒管线

[中文](#中文) · [English](#english)

## 中文

在 DeepSeek Harness 的 LP 主对话中提供两种唤醒：停止活动一段时间后的自然唤醒，以及模型自己安排、带有缘由的主动唤醒。两种唤醒各有独立开关。

### 安装与快速开始

在 DSH 插件管理中安装并启用 `dsh-lpipe-wake`；本包直接依赖 `dsh-life-core`，不要求先安装整合包。公共核心要求 DSH `>=0.2.0-rc.2`、Node.js `^22.19 || >=24`。

1. 打开 **设置 → Lpipe 设置**，绑定 LP 主对话。
2. 在唤醒块检查自然 / 主动开关、默认间隔和心跳。自然间隔默认 2 小时，心跳默认 30 秒。
3. 在主对话调用 `wake_check({})`，或用「现在醒来一次」检查投递。
4. 使用前确认主对话的模型和预算：每次唤醒可能开始一个新的模型轮次。宿主必须运行，主会话必须可恢复；本包不能启动已关闭的 DSH。

### 触发规则

自然唤醒以主会话日志中的最新活动为基准。新活动会将截止时间向后推；到点且会话空闲时投递一次，再重新起算。主动安排独立保存，普通对话活动不会取消；到点但会话忙时等待后续心跳。

引擎比较实际时间戳，不累加倒计时。休眠或停机期间无法准时投递，恢复后的心跳再处理到期任务；不能把 30 秒心跳理解为任何情况下都能保证 30 秒内送达。关闭某类开关只停止投递，不清空该类状态。主动列表最多保留 20 项。

### 工具示例

以下是模型工具调用，不是终端命令：

```js
wake_check({})
wake_set({ in: '45m', reason: '回来检查下载是否完成' })
wake_set({ at: '2026-12-01T20:30:00+08:00', reason: '查看当天的记录' })
wake_set({ lock: '3h' })
wake_set({ unlock: true })
wake_set({ cancel: 'PLAN_ID' })
wake_set({ cancel: true })
```

`in` 支持 `s`、`m`、`h`、`d` 等时长单位；不带单位的数字按分钟处理。`at` 建议填写带时区的 ISO 时间。`reason` 随唤醒通知送入主会话。`lock` 只临时压住自然唤醒，到期自动解除，不影响主动安排；设置页提供解除锁定。`wake_check` 只读，报告两类下次唤醒、缘由、开关和锁状态。

### 设置与数据

设置页可调整两类开关、自然间隔、心跳，查看最近安排并取消。自然间隔编辑范围为 1 分钟至 24 小时，心跳为 1 秒至 60 分钟。以下是状态文件的部分字段，优先通过设置页和工具修改，不要用此片段覆盖完整状态：

```json
{
  "naturalEnabled": true,
  "manualEnabled": true,
  "defaultIntervalMs": 7200000,
  "heartbeatMs": 30000
}
```

状态保存在 `~/.dsh/life-wake/state.json`，公共主会话绑定在 `~/.dsh/life-pipline/config.json`；`DSH_HOME` 可替换默认基目录。

### 常见问题

- **时间到了却没醒？** 检查主会话绑定、宿主运行状态、会话是否忙、对应开关，以及自然唤醒是否被锁定。
- **刚聊天，主动安排还在？** 主动安排不随活动取消；用 `wake_set({ cancel: ... })` 显式取消。
- **通知轮次里无法弹出问答？** 后台唤醒轮次避免阻塞的人类问答工具；需要沟通时使用文本或已配置的聊天渠道。

许可：AGPL-3.0-or-later。

## English

Wake the LP main session in DeepSeek Harness after inactivity, or at a time chosen by the model with a note explaining why. Natural and planned wake-ups have independent switches.

### Install and start

Install and enable `dsh-lpipe-wake` through DSH plugin management. It depends directly on `dsh-life-core`; the aggregate installer is optional. Core requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main session in **Settings → Lpipe settings**, then check both switches, the natural interval and heartbeat. Defaults are 2 hours and 30 seconds. Call `wake_check({})` in the main session or use the immediate-wake button. A wake can start a model turn and incur usage. DSH must be running and the session must be recoverable; this plugin cannot start a closed host.

### Scheduling and tools

Natural wake-ups use the latest main-session activity as their baseline. Activity moves the deadline forward. Once due and idle, the session receives one notice and the interval starts again. Planned wake-ups survive ordinary activity and wait while the session is busy. The list holds at most 20 plans.

The examples above show all common tool operations. `in` accepts duration units; a bare number means minutes. Prefer an ISO timestamp with a time-zone offset for `at`. The reason is included in the notice. `lock` temporarily silences natural wake-ups only and expires automatically; `unlock` removes it. Cancel one plan by ID or all with `cancel: true`. `wake_check` is read-only.

The engine compares timestamps. A heartbeat is a checking interval, not a delivery guarantee: shutdown, sleep, a busy session or unavailable services can delay delivery. On recovery, later heartbeats handle due work. Disabling a switch retains its state and plans.

### Settings, storage and troubleshooting

The settings page controls both switches, a natural interval of 1 minute–24 hours, a heartbeat of 1 second–60 minutes, cancellation and unlock actions. The JSON fragment above shows the default timing fields; do not overwrite the full state with that fragment.

State is in `~/.dsh/life-wake/state.json`; the shared binding is in `~/.dsh/life-pipline/config.json`. `DSH_HOME` replaces the default base. If a wake is missing, check the binding, host availability, busy state, switch and natural lock. Planned wakes are cancelled explicitly, not by chatting. Background wake turns avoid blocking human-question tools; communicate through text or configured chat channels instead.

License: AGPL-3.0-or-later.
