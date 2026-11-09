# 第三方代码

- `src/vendor/auth.mjs`：改编自 ALTERSSSS 的 dsh-bili-whale `lib/auth.js`，MIT，Copyright (c) 2026 ALTERSSSS。保留许可于 `src/vendor/LICENSE`。变更为热重载安全的二维码加载，凭据保存由本组件注入。
- `src/vendor/credentials.js`：参考同项目的 Cookie 校验接口，仅保留输入校验与错误类型，不使用其文件存储。
- `src/api.mjs` 的 WBI 混淆表与签名过程参考同项目 `tools/lib/bili-api.mjs`，MIT，许可同上。
- 上游仓库：https://github.com/Alterssss/dsh-bili-whale 。这些适配代码由本项目人工跟踪升级，不自动同步。
- `src/vendor/storyboard/`：内置 SAOS-3624 的 `dsh-video-storyboard@0.7.1` 分镜源码传递依赖与 OCR 侧车，Apache-2.0，Copyright 2026 SAOS-3624。来源提交 `60aedccd32b7f28815770e0a283f49ebac2e106a`；源码逐字节保留，仅调用方导入路径改为本地文件，不挂载上游插件。原始 `LICENSE`、`NOTICE`、`CREDITS.md` 与来源校验清单 `upstream.json` 保留在该目录。仓库：https://github.com/SAOS-3624/dsh-video-storyboard 。
- `qrcode@1.5.4`：MIT，通过 npm 依赖使用，其许可随依赖提供。

本机部署复用了已有 ffmpeg/ffprobe 6.1.1 程序；程序不包含在本包分发物中。
