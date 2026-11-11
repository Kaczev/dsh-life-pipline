# dsh-lpipe-bili · B 站管线

[中文](#中文) · [English](#english)

## 中文

在 DeepSeek Harness 的 LP 主对话中浏览 B 站首页推荐、搜索、视频详情、相关推荐、UP 主投稿及评论，读取字幕，或观看指定区间的视频分镜。站内内容操作均为只读：不发评论、私信，不点赞或投币。

### 安装与快速开始

在 DSH 插件管理中安装并启用 `dsh-lpipe-bili`。本包直接依赖 `dsh-life-core`，无需先装整合包。公共核心要求 DSH `>=0.2.0-rc.2`、Node.js `^22.19 || >=24`。

1. 在 **设置 → Lpipe 设置** 绑定 LP 主对话。
2. 在 B 站块扫码登录，等待状态确认成功。也可由主对话调用 `bili_login`，见下方示例。
3. 调用 `bili_status` 检查登录及媒体程序依赖，再搜索或查看视频。
4. 要生成分镜，需另外准备可被发现的 ffmpeg、ffprobe 和 yt-dlp。npm 包包含分镜代码，不包含这些外部程序。

### 工具示例

以下是模型工具调用，`BV...` 和用户 ID 必须替换为实际值：

```js
bili_login({ action: 'begin' })
bili_login({ action: 'status' })
bili_status({})
bili_feed({ page: 1, limit: 10 })
bili_search({ query: '天文摄影', page: 1 })
bili_video({ video: 'BV...' })
bili_related({ video: 'BV...' })
bili_uploader({ mid: '123456', page: 1 })
bili_comments({ video: 'BV...', page: 1 })
bili_subtitles({ video: 'BV...', part: 1, from: 0, to: 180 })
bili_watch({ video: 'BV...', part: 1, from: 30, to: 120 })
```

`video` 接受 BV 号或 B 站链接，`part` 从 1 开始。评论工具可用返回的评论 ID 作为 `root` 查看回复。扫码后必须继续调用 `status`，直到返回 `success` 才完成凭据保存；`cancel` 取消本次登录。

### 观看范围与限制

- 首页推荐需要相应登录权限；未登录失败时不会偷偷改成关键词搜索。
- `bili_watch` 默认从 0 秒开始观看 180 秒，单次最多 600 秒，返回按时间排列的分镜图片。下载完成不等于看完整片。
- `bili_subtitles` 单次最多 600 秒、300 条字幕。无字幕会明确返回，不自动使用付费转写。
- 分镜提供画面及音量、切镜等分析，不代表模型已听懂声音。平台风控、账号权限和外部程序失败仍可能导致工具报错。

### 配置与存储

设置页提供扫码登录及 `downloadRetentionDays`，默认 7 天，接受 1–36500 的整数。该项通过宿主插件配置保存，例如：

```json
{
  "downloadRetentionDays": 7
}
```

登录 Cookie 等凭据保存在宿主 credentials 服务，不写进普通插件配置，也不显示在页面。临时视频与隔离分镜缓存位于 `~/.dsh/life-bili/downloads/watch-UUID/`；每小时清理过期任务目录，活动任务不清理。`DSH_HOME` 可替换默认基目录。

下载阶段可能生成临时 Cookie 文件。Windows 写入前限制任务目录 ACL，其他平台使用私有目录和文件权限；异常终止仍可能留下受保护文件，随后按保留策略清理。不要公开任务目录。

媒体工具优先从 `life-bili/tools/` 发现 ffmpeg / ffprobe，再使用内置分镜库支持的系统路径；yt-dlp 由该库的发现逻辑定位。

### 常见问题

- **二维码有了但没登录？** 扫码后继续查询状态；仅 `success` 表示已完成登录和保存。
- **浏览正常但无法分镜？** 用 `bili_status` 检查外部程序，再确认视频可访问及所选时间区间有效。
- **没有字幕？** 这是有效结果，不会自动付费转写；可按需查看分镜，但不能据此声称听懂了音频。

### 致谢与许可

感谢 dsh-video-storyboard、dsh-bili-subagent、dsh-bili-whale 的作者与贡献者。分镜内置 [dsh-video-storyboard](https://github.com/SAOS-3624/dsh-video-storyboard) `0.7.1` 的源码；扫码与部分 API 适配参考 [dsh-bili-whale](https://github.com/Alterssss/dsh-bili-whale)。没有额外挂载这些项目的 bundle 或工具。来源及 Apache-2.0 / MIT 声明见 [第三方声明](https://github.com/Kaczev/dsh-life-pipline/blob/main/components/dsh-lpipe-bili/THIRD-PARTY-NOTICES.md)。本包采用 AGPL-3.0-or-later，上游许可随包保留。

## English

Browse Bilibili in the LP main session of DeepSeek Harness: home recommendations, search, video details, related videos, uploader submissions, comments, subtitles and storyboards for a selected interval. Site-content operations are read-only; the plugin does not post comments or private messages, like videos or spend coins.

### Install and start

Install and enable `dsh-lpipe-bili` through DSH plugin management. It depends directly on Life Core; the aggregate installer is optional. Core requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main session in **Settings → Lpipe settings**, scan the Bilibili login QR code and wait for confirmed success. Run `bili_status` to check login and media prerequisites. Storyboards require discoverable ffmpeg, ffprobe and yt-dlp executables; these are not bundled in the npm package.

### Tools and limits

The tool examples above apply to both languages. Replace placeholder BV IDs, user IDs and queries. `video` accepts a BV ID or URL, `part` starts at 1, and `bili_comments` accepts a returned comment ID as `root` for replies. After QR login, keep calling `bili_login({ action: 'status' })` until `success` confirms credential storage. `cancel` aborts login.

Home recommendations require the relevant account access; failures are not replaced with keyword searches. `bili_watch` defaults to 180 seconds from the start and allows at most 600 seconds per call. It returns time-ordered storyboard images, not proof that the whole video was watched. Subtitles are limited to 600 seconds and 300 entries per call; missing subtitles do not trigger paid transcription. Visual frames and audio-level analysis do not establish speech comprehension. Platform restrictions and external-tool errors can still prevent access.

### Configuration and data

`downloadRetentionDays` is stored in host plugin configuration, defaults to 7 and accepts integers from 1 to 36500. The settings page exposes this value and QR login. Credentials use the host credentials service, not ordinary plugin configuration.

Temporary video and isolated storyboard caches live in `~/.dsh/life-bili/downloads/watch-UUID/`. Expired inactive job directories are cleaned hourly. `DSH_HOME` replaces the default base. Temporary Cookie files are restricted with Windows ACLs or private Unix permissions, but abnormal termination can leave protected files until cleanup; do not publish job directories.

ffmpeg/ffprobe discovery checks `life-bili/tools/` before supported system locations. yt-dlp uses the bundled storyboard library's discovery logic. If browsing works but viewing fails, check `bili_status`, video access and the requested time range. A displayed QR code alone does not mean login succeeded.

### Credits and license

Thanks to dsh-video-storyboard, dsh-bili-subagent and dsh-bili-whale. Storyboard source is vendored from dsh-video-storyboard `0.7.1`; QR login and API adaptations reference dsh-bili-whale. Their separate bundles and tools are not mounted. See the linked third-party notices for provenance and Apache-2.0 / MIT terms. This package is AGPL-3.0-or-later.
