# 第三方代码

- `src/vendor/auth.mjs`：改编自 ALTERSSSS 的 dsh-bili-whale `lib/auth.js`，MIT，Copyright (c) 2026 ALTERSSSS。保留许可于 `src/vendor/LICENSE`。变更为热重载安全的二维码加载，凭据保存由本组件注入。
- `src/vendor/credentials.js`：参考同项目的 Cookie 校验接口，仅保留输入校验与错误类型，不使用其文件存储。
- `src/api.mjs` 的 WBI 混淆表与签名过程参考同项目 `tools/lib/bili-api.mjs`，MIT，许可同上。
- 上游仓库：https://github.com/Alterssss/dsh-bili-whale 。这些适配代码由本项目人工跟踪升级，不自动同步。
- `dsh-video-storyboard@0.7.1`：Apache-2.0，通过 npm 依赖复用公开分镜 API，不复制其源码或挂载其工具。仓库：https://github.com/SAOS-3624/dsh-video-storyboard 。
- `qrcode@1.5.4`：MIT，通过 npm 依赖使用，其许可随依赖提供。

本机部署复用了已有 ffmpeg/ffprobe 6.1.1 程序；程序不包含在本包分发物中。
