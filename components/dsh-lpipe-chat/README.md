# dsh-lpipe-chat · 聊天管线

[中文](#中文) · [English](#english)

## 中文

在 DeepSeek Harness（DSH）中接入微信 iLink 与 QQ 开放平台机器人。收到的消息经过合并后进入 LP 主对话；模型使用工具发送回复，也可读取历史、查看图片和下载附件。

### 安装与接入

在 DSH 插件管理中安装并启用 `dsh-lpipe-chat`。本包直接依赖 `dsh-life-core`，无需先装整合包；也可安装 `dsh-life-pipline` 获得整套管线。要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 打开 **设置 → Lpipe 设置**，绑定 LP 主对话。
2. 在聊天块中填写 Owner 称呼，按需修改消息合并参数，再扫码连接微信或 QQ。需要配对码时按页面提示提交。
3. 等待状态显示已连接，再从对应平台发送一条测试消息。二维码显示出来不代表登录成功。
4. 在主对话调用 `chat_status` 检查通道，再根据通知中的完整收件人 ID 回复。

「重新连接」复用已存凭据；凭据失效或需要换号时使用「重新扫码」。扫码换号后，运行中的连接会切换到新凭据。

### 消息与身份

- 默认 `quietSeconds: 8`：一段消息安静满 8 秒后才算说完；`windowSeconds: 14`：每次送出后的 14 秒内继续收集消息。两项截止时间都到达才投递。
- 默认 `ownerOnly: false`，并非只接收主人。启用该选项才按配置的平台 Owner ID 过滤。
- Owner 名字只作称呼；插件根据平台 ID 添加的 `(Owner)` 才是身份标记。完整用户 ID 和群 ID 用于路由，不应从昵称推断收件人。
- 主会话忙时，消息进入后续步骤；空闲时，通知可唤醒会话。后台聊天轮次中应通过聊天工具沟通，不使用阻塞的人类问答工具。
- 自主主动消息仅限已验证 Owner 私聊；其他参与者可在已有对话中回复。这是系统提示词规则，不是额外的发送权限拦截器，宿主及平台限制仍然适用。

### 工具与示例

以下是模型工具调用示例，不是终端命令。ID 必须替换为通知或历史返回的真实完整值。

```js
chat_status({})
chat_login({ channel: 'weixin', action: 'begin' })
chat_login({ channel: 'weixin', action: 'status' })
chat_history({ channel: 'qq', limit: 20 })
chat_send({ channel: 'qq', scope: 'c2c', targetId: 'FULL_USER_OPENID', text: '收到了。' })
chat_send({ channel: 'qq', scope: 'group', targetId: 'FULL_GROUP_OPENID', text: '这是文件。',
  media: [{ kind: 'file', path: 'C:/example/report.pdf' }] })
chat_download({ id: 'ATTACHMENT_ID', action: 'inspect' })
chat_download({ id: 'ATTACHMENT_ID', action: 'download' })
```

- `chat_send` 必填 `channel`、`targetId`，没有默认收件人。支持文字及图片 / 文件组合；`media` 最多 8 项。微信不支持这里的群聊发送，`sticker` 会明确拒绝。部分发送成功时应读取逐项结果，不要整批重发。
- `completed: true` 可在发送成功后结束当前轮次，避免在宿主回复中重复已经发出的文字。
- `chat_history` 默认每页 20 条，最多 200 条，还受字节预算限制；用返回的 `cursor` 继续，`messageId` 打开单条消息或转发记录，`image` 按需查看归档图片。
- `chat_download` 默认只检查元数据；`action: 'download'` 才下载文件，不会打开、解压或执行。可用 `directory` 指定目录。
- `chat_login` 支持 `begin`、`status`、`code`、`cancel`；微信要求配对码时提交 `code`。

### 配置与数据

配置保存在 `~/.dsh/life-chat/config.json`。以下为可合并的非凭据字段示例；不要用它覆盖已有账号配置：

```json
{
  "quietSeconds": 8,
  "windowSeconds": 14,
  "ownerOnly": false,
  "ownerName": "",
  "outputBytes": 50331648,
  "downloadBytes": 536870912,
  "downloadRetentionDays": 7
}
```

`outputBytes` 是输出预算，`downloadBytes` 是附件下载限额。默认下载目录是 `life-chat/downloads`，过期清理针对该目录直属文件，默认保留 7 天；自定义下载目录不在这项清理范围内。消息进出记录追加到 `life-chat/messages.jsonl`，媒体保留稳定引用。渠道凭据只在 Host 侧保存，切勿公开配置或归档。`DSH_HOME` 可替代默认 `~/.dsh`。

### 常见问题

- **能看到消息但没有平台回复？** 模型必须实际调用 `chat_send`；宿主中的普通回复不会自动发送到微信或 QQ。
- **收件人缺失？** 从通知或 `chat_history` 读取完整 ID，不会自动发给 Owner。
- **扫码后仍未连接？** 继续查询登录状态；令牌失效时重新扫码，并检查是否有其他插件同时轮询同一账号。
- **图片取不到？** 通过历史中的图片 ID 按需读取。远端资源过期时会明确报错，归档引用不保证远端字节永久可用。

### 致谢与许可

感谢 dsh-im 的作者与贡献者。微信协议实现、二维码加载方式及部分 QQ 回复策略沿用或参考了 dsh-im；来源、适配和 MIT 许可见 [第三方来源清单](https://github.com/Kaczev/dsh-life-pipline/blob/main/components/dsh-lpipe-chat/THIRD_PARTY/MANIFEST.md)。本包采用 AGPL-3.0-or-later，上游版权与许可随包保留。

## English

Connect WeChat iLink and QQ Open Platform bots to DeepSeek Harness. Incoming messages are batched into the LP main session. The model can send replies, read history, inspect images and download attachments.

### Install and connect

Install and enable `dsh-lpipe-chat` through DSH plugin management. It depends directly on `dsh-life-core`; the aggregate installer is optional. Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main session in **Settings → Lpipe settings**, enter an optional Owner display name, then connect a channel by QR login. Submit a pairing code if requested. Wait for a connected status before sending a test message. Reconnect reuses saved credentials; rescan replaces invalid credentials or switches accounts.

### Delivery and tools

The default quiet interval is 8 seconds and the post-delivery collection window is 14 seconds. Both deadlines must pass before delivery. `ownerOnly` defaults to **false**. Names are display labels; only platform-ID verification establishes Owner identity. Busy sessions read notices at a later step; idle sessions can be woken by incoming messages.

The tool examples above apply to both languages. Replace all placeholder IDs and paths before use.

- `chat_send` requires `channel` and a full `targetId`; there is no default recipient. QQ uses `scope: 'c2c'` or `'group'`. WeChat group delivery is unsupported. Text may be combined with up to eight image/file items. Stickers are rejected. Inspect partial results before retrying to avoid duplicates.
- Set `completed: true` to conclude the turn after a successful send. A normal Harness reply is not a message sent to the platform.
- `chat_history` defaults to 20 rows, at most 200, within an output-byte budget. Continue with `cursor`, open a message or forwarded record with `messageId`, and request an archived picture with `image`.
- `chat_download` defaults to metadata inspection. `action: 'download'` saves bytes subject to limits; it does not open or execute the file. `directory` selects an optional destination.
- `chat_login` supports `begin`, `status`, `code` and `cancel`; `chat_status` reports channel state.

The main-session prompt permits proactive messages only to a verified Owner in private chat, and replies to other participants in existing conversations. This is a prompt rule, not a separate send interceptor. Host permissions and platform restrictions still apply. Background IM turns should communicate through chat tools rather than blocking on the host's human-question tool.

### Configuration, storage and troubleshooting

Configuration lives in `~/.dsh/life-chat/config.json`; the JSON example above lists non-credential defaults. Merge fields rather than replacing an account configuration. Default output and download budgets are 48 MiB and 512 MiB. Direct files in the default `life-chat/downloads` directory expire after 7 days; custom destinations are not cleaned by that policy. Incoming and outgoing records append to `messages.jsonl`. Credentials remain on the Host. Protect both configuration and archives. `DSH_HOME` replaces the default base.

If replies do not reach the platform, check for an actual `chat_send` call. For missing targets, read the full ID from a notice or history. For failed login, poll status, rescan if credentials expired, and check for competing pollers. Archived image IDs can retrieve pictures on demand, but expired remote media may no longer be available.

### Credits and license

Thanks to dsh-im's authors and contributors for the WeChat protocol, QR-loading approach and QQ reply strategies. See the third-party manifest linked above for provenance and MIT notices. This package is AGPL-3.0-or-later; upstream notices are included.
