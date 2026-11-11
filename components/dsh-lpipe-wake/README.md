# dsh-lpipe-wake · 唤醒管线

[中文](#中文) · [English](#english)

## 中文

让 DeepSeek Harness 的 LP 主对话在闲置一段时间后自然醒来，也允许模型安排稍后继续某件事，并在醒来时带上当时写下的缘由。两种唤醒可以分别开关。

### 安装与开始使用

在 DSH 插件管理中安装并启用 `dsh-lpipe-wake`。插件需要生命核心，无需先装整合包。要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 打开 **设置 → Lpipe 设置**，绑定 LP 主对话。
2. 在唤醒设置中检查自然 / 主动开关，调整自然间隔与检查频率。
3. 使用「现在醒来一次」检查唤醒是否送达。

自然间隔默认 2 小时，检查频率默认 30 秒。每次唤醒可能产生新的模型用量，请先确认主对话的模型和预算。

### 两种唤醒的区别

自然唤醒从主对话最近一次活动开始计时，新活动会推迟下一次唤醒。主动安排则会保留，普通聊天不会取消它。

到点时，如果主对话正在工作，唤醒会等待会话空闲。临时锁定只暂停自然唤醒，不影响主动安排；设置页可以解除锁定，也可以查看、取消已有安排。主动安排最多保留 20 项。

### 使用注意

DSH 必须保持运行，主对话也必须能够恢复。电脑休眠、宿主关闭或会话忙碌都可能延迟唤醒；恢复运行后会继续检查到期安排。检查频率不代表保证送达时间，插件也不能启动已经关闭的 DSH。

设置页支持 1 分钟至 24 小时的自然间隔，以及 1 秒至 60 分钟的检查频率。关闭某类唤醒只停止投递，不会清空已有安排。

时间到了却没有醒来时，请检查主对话绑定、宿主运行状态、对应开关和自然唤醒锁定状态。

许可：AGPL-3.0-or-later。

## English

Wake the LP main conversation in DeepSeek Harness after inactivity, or let the model arrange a later return with a note explaining why. Natural and planned wake-ups have separate switches.

### Install and start

Install and enable `dsh-lpipe-wake` through DSH plugin management. It requires Life Core, not the aggregate package. Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main conversation in **Settings → Lpipe settings**, review both switches and adjust the natural interval and checking frequency. Use the immediate-wake button to check delivery.

Defaults are 2 hours between natural wakes and a 30-second check interval. Waking may start a new model turn and incur usage; check the main conversation's model and budget first.

### How waking works

Natural wake-ups count from the latest conversation activity, so new activity moves the deadline forward. Planned wake-ups survive ordinary conversation. Both wait while the session is busy.

A temporary lock silences natural wake-ups only. The settings page can lift the lock, show plans and cancel them. Up to 20 plans are retained.

### Things to know

DSH must be running and the conversation must be recoverable. Sleep, shutdown or a busy session can delay delivery; later checks handle due plans after recovery. The check interval is not a delivery guarantee, and the plugin cannot start a closed host.

Settings allow a natural interval of 1 minute–24 hours and a check interval of 1 second–60 minutes. Turning a switch off retains its plans and state.

If a wake is missing, check the main-conversation binding, host availability, switches and natural-wake lock.

License: AGPL-3.0-or-later.
