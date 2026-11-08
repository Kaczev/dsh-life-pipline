# B 站管线

本组件让当前会话浏览 B 站真实首页推荐、搜索、视频详情、相关推荐、UP 主投稿和评论，并读取字幕、观看指定区间的分镜。所有站内内容操作均为只读，不发送评论、私信、点赞或投币。

## 登录与配置

调用 `bili_login`，以 `action=begin` 获取二维码；扫码后调用 `action=status`，直到返回 `success`。登录凭据保存在宿主 credentials 服务中，不写进插件配置。`bili_status` 查看账号、依赖和临时文件保留天数。未登录的首页推荐实测返回 `-101`，不会退化成关键词搜索。

唯一普通配置为 `downloadRetentionDays`，默认 7 天，范围 1–36500。设置页提供扫码登录与保留天数两项，注册在「Lpipe 设置」的 `lpipe.settings.panel` 槽中；图标在 `assets/icon.png`。后端已提供 `/api/dsh-lpipe-bili`，支持 `bili.status`、`bili.login`、`bili.config`、`bili.config.save`，使用同系列 RPC 信封。登录接口的二维码为 PNG data URL；模型工具则返回宿主图像附件。

## 设置页

设置页块在 [`client/panel.js`](client/panel.js)，由 [`scripts/build-client.mjs`](scripts/build-client.mjs) 构建到 `lib/client.js`，注册进公共页的 `lpipe.settings.panel`（id `bili`，order 60）。它只做两件事：

- 扫码登录：调用 `bili.login` 的 `begin` / `status` / `cancel`。只有轮询 `status` 返回 `success` 才显示登录成功；二维码本身不代表已登录。登录页展示等待扫码、已扫码、成功、过期、取消和失败状态，二维码图片直接使用宿主返回的 PNG data URL。
- 下载保留天数：只接受 1–36500 的整数，保存走 `bili.config.save`；保存中、保存失败和取消编辑都有对应状态。

页面只显示账号名和公开登录状态，不显示 Cookie、`SESSDATA`、`bili_jct` 或任何凭据值。登录凭据仍只保存在宿主 credentials 中。

## 观看与存储

`bili_watch` 默认从 0 秒观看 180 秒，单次最多 600 秒，按时间返回分镜图片；下载视频不等于看完视频。`bili_subtitles` 单次最多读取 600 秒、300 条字幕，没有字幕时直接说明，不自动调用付费转写。分镜只提供画面及音量、切镜等分析，不代表已经听懂声音。

临时视频和隔离的分镜缓存位于 `~/.dsh/life-bili/downloads/watch-UUID/`。每小时清理过期任务目录，活动任务不清理。下载器需要的临时 Cookie 文件只在下载阶段保留；Windows 在写入前关闭任务目录的继承权限，仅允许当前用户访问，其他平台使用 0700 目录、0600 文件。异常终止仍可能留下受保护的文件；后续清理按保留时间删除。

媒体程序优先从 `~/.dsh/life-bili/tools/` 查找，随后使用分镜库支持的系统路径。当前机器复用了本机已有 ffmpeg/ffprobe 6.1.1；不会将程序打进 npm 包。yt-dlp 由上游公开发现接口定位。

## 上游边界

固定依赖 `dsh-video-storyboard@0.7.1` 的公开子路径，仅调用分镜库，不挂载它的 bundle、不注册它的工具和配置页。工作线程隔离缓存环境；升级依赖时应复验抽帧、图片附件、临时文件和取消路径。扫码登录参考 MIT 许可的 dsh-bili-whale，见第三方声明。

## 验证

在本目录执行 `npm test`；改动设置页后先运行 `npm run build-client`，再用 `npm pack --dry-run --json` 检查发布内容。验收还应包括宿主工具注册、设置页实际渲染、二维码登录、真实首页推荐和真实视频分镜。设置页的扫码成功只能在真人扫码并完成 `status` 轮询后确认；没有真实扫码时必须如实说明。超时或取消会终止工作线程，但上游启动的 ffmpeg 子进程取消行为仍需进一步核验。
