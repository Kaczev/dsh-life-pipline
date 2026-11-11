# dsh-lpipe-bili · B 站管线

[中文](#中文) · [English](#english)

## 中文

让 DeepSeek Harness 的 LP 主对话浏览 B 站推荐、搜索视频、查看 UP 主投稿和评论，并读取字幕或观看指定区间的视频分镜。站内操作只读，不发评论、私信，不点赞或投币。

### 安装与登录

在 DSH 插件管理中安装并启用 `dsh-lpipe-bili`。插件需要生命核心，无需先装整合包。要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 打开 **设置 → Lpipe 设置**，绑定 LP 主对话。
2. 在 B 站设置中扫码登录，等待页面确认成功。
3. 回到主对话，直接请模型搜索感兴趣的内容，或发送 B 站视频链接。

观看分镜还需要另外安装 ffmpeg、ffprobe 和 yt-dlp，并让程序能够被系统找到。npm 包不包含这些外部程序。能搜索和浏览，不代表分镜环境也已经准备好。

### 字幕与观看

视频观看默认读取开头 3 分钟的分镜，单次最多 10 分钟，可以指定其他时间区间。分镜是按时间排列的画面，下载完成不代表模型看过整部视频，也不能把音量分析当作听懂了声音。

字幕每次最多读取 10 分钟、300 条。视频没有字幕时会明确告知，不会自动启用付费转写。账号权限、平台风控、视频可访问性和外部程序故障都可能影响结果。

### 数据与常见问题

设置页可以调整下载保留时间，默认 7 天。过期且没有运行中的临时任务会定期清理。账号凭据由宿主保管；临时下载中也可能包含受保护的登录文件，请勿公开任务目录。

- **扫码了却还没登录？** 等待页面确认成功，二维码或扫码动作本身不代表登录完成。
- **推荐页无法打开？** 检查登录与账号权限；插件不会用搜索结果冒充推荐。
- **能浏览但无法看分镜？** 检查三个外部程序是否可用，以及视频和指定区间是否能访问。

### 致谢与许可

感谢 dsh-video-storyboard、dsh-bili-subagent、dsh-bili-whale 的作者与贡献者。分镜内置 [dsh-video-storyboard](https://github.com/SAOS-3624/dsh-video-storyboard) `0.7.1` 的源码；扫码与部分接口适配参考 [dsh-bili-whale](https://github.com/Alterssss/dsh-bili-whale)。来源及 Apache-2.0 / MIT 声明见 [第三方声明](https://github.com/Kaczev/dsh-life-pipline/blob/main/components/dsh-lpipe-bili/THIRD-PARTY-NOTICES.md)。本包采用 AGPL-3.0-or-later，上游版权与许可随包保留。

## English

Let the LP main conversation in DeepSeek Harness browse Bilibili recommendations, search videos, read uploader pages and comments, fetch subtitles and view storyboards for a selected interval. Site operations are read-only: no posting, private messages, likes or coins.

### Install and sign in

Install and enable `dsh-lpipe-bili` through DSH plugin management. It requires Life Core, not the aggregate package. Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main conversation in **Settings → Lpipe settings**, scan the Bilibili login code and wait for confirmed success. Return to the conversation and ask for a search or share a video link.

Storyboards additionally require discoverable ffmpeg, ffprobe and yt-dlp executables. These programs are not bundled in the npm package. Successful browsing alone does not confirm that storyboard prerequisites are ready.

### Subtitles and viewing

Viewing defaults to the first 3 minutes and supports up to 10 minutes at a time, with other intervals available. Storyboards contain time-ordered frames; downloading a video does not mean the model watched the whole thing, and audio-level analysis does not establish speech comprehension.

Subtitles are limited to 10 minutes and 300 entries per request. Missing subtitles are reported without automatically using paid transcription. Account access, platform restrictions, video availability and external-program failures can affect results.

### Data and troubleshooting

Download retention is configurable and defaults to 7 days. Expired inactive temporary jobs are cleaned periodically. The host stores account credentials; protected temporary login files may also appear during downloads. Do not publish task folders.

A QR code or scan alone does not confirm login. If recommendations fail, check account access; searches are not substituted for recommendations. If browsing works but storyboards fail, check the three external programs, video access and selected interval.

### Credits and license

Thanks to dsh-video-storyboard, dsh-bili-subagent and dsh-bili-whale. Storyboard source comes from dsh-video-storyboard `0.7.1`; QR login and some adaptations reference dsh-bili-whale. See the linked third-party notices for provenance and Apache-2.0 / MIT terms. This package uses AGPL-3.0-or-later and includes upstream copyright and license notices.
