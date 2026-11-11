# dsh-lpipe-chat · 聊天管线

[中文](#中文) · [English](#english)

## 中文

把微信 iLink 和 QQ 开放平台机器人接入 DeepSeek Harness。收到的消息会汇入 LP 主对话，模型可以回复、查看历史、读取图片和下载附件。

### 安装与接入

在 DSH 插件管理中安装并启用 `dsh-lpipe-chat`。插件需要生命核心，无需先装整合包。要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 打开 **设置 → Lpipe 设置**，绑定 LP 主对话。
2. 在聊天设置中填写 Owner 称呼，扫码接入微信或 QQ；需要配对码时按页面提示提交。
3. 等待状态显示已连接，再从对应平台发送一条消息进行检查。

「重新连接」使用已保存的账号信息；账号失效或需要换号时，选择「重新扫码」。请避免其他插件同时接收同一账号的消息。

### 日常使用

模型需要实际发送消息，宿主中的普通回复不会自动出现在微信或 QQ。收件人依据平台中的完整身份信息确定，Owner 称呼只用于显示，不能作为身份凭证。

默认会接收其他人的消息；如只想接收主人消息，可开启对应过滤选项。模型的主动消息授权限于已核验的 Owner 私聊，其他参与者可在已有对话中收到回复，平台自身的限制仍然适用。

聊天支持文字、图片和文件，微信群聊发送及贴纸发送不在支持范围内。远端图片或附件过期后，历史记录可能仍在，但原文件未必还能读取。一次发送部分成功时，应先确认结果，避免重复发送。

### 设置与隐私

默认在消息安静 8 秒后合并投递，每次投递后的收集窗口为 14 秒，两项条件都满足才会再次送达。设置页可调整消息合并、输出与下载限额，以及下载保留时间。

默认下载目录中的直属文件保留 7 天，自选目录不在这项自动清理范围内。聊天记录和账号信息保存在宿主侧，可能包含私人内容，请勿公开配置或归档。

主对话忙时，消息会在后续步骤中读取；空闲时，来信可以唤醒主对话。如果平台没有收到回复，请先检查连接状态和模型是否实际发送；扫码画面本身不代表登录完成。

### 致谢与许可

感谢 dsh-im 的作者与贡献者。微信协议实现、二维码加载方式及部分 QQ 回复策略沿用或参考了 dsh-im；来源、适配和 MIT 许可见 [第三方来源清单](https://github.com/Kaczev/dsh-life-pipline/blob/main/components/dsh-lpipe-chat/THIRD_PARTY/MANIFEST.md)。本包采用 AGPL-3.0-or-later，上游版权与许可随包保留。

## English

Connect WeChat iLink and QQ Open Platform bots to DeepSeek Harness. Incoming messages reach the LP main conversation, where the model can reply, read history, view pictures and download attachments.

### Install and connect

Install and enable `dsh-lpipe-chat` through DSH plugin management. It requires Life Core, not the aggregate package. Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main conversation in **Settings → Lpipe settings**, enter an optional Owner display name, then connect WeChat or QQ by QR login. Submit a pairing code if prompted. Wait for a connected status before sending a test message.

Reconnect uses saved account information; rescan when credentials expire or you want to switch accounts. Avoid having another plugin receive messages for the same account at the same time.

### Everyday use

A normal reply inside Harness is not automatically sent to the platform. The model must send it explicitly. Recipients use verified platform identities; an Owner display name alone does not establish identity.

Messages from other people are accepted by default, with an Owner-only option available. Proactive messaging is authorized only to a verified Owner in private chat; other participants may receive replies in existing conversations. Platform restrictions still apply.

Text, pictures and files are supported. WeChat group delivery and stickers are unsupported. Archived references cannot recover remote media that has expired. Check partial delivery results before retrying to avoid duplicates.

### Settings and privacy

The default quiet period is 8 seconds, with a 14-second collection window after delivery. Both conditions must pass before the next delivery. Settings cover batching, output/download limits and download retention.

Direct files in the default download folder expire after 7 days; custom folders are not cleaned by that policy. Account information and message archives remain on the host and may contain private data.

Busy conversations read incoming notices in later steps; idle conversations may be woken. If no reply reaches the platform, check the connection and whether a message was actually sent. A displayed QR code alone does not mean login succeeded.

### Credits and license

Thanks to dsh-im's authors and contributors for the WeChat protocol, QR-loading approach and QQ reply strategies. See the [third-party manifest](https://github.com/Kaczev/dsh-life-pipline/blob/main/components/dsh-lpipe-chat/THIRD_PARTY/MANIFEST.md) for provenance and MIT notices. This package is AGPL-3.0-or-later; upstream notices are included.
