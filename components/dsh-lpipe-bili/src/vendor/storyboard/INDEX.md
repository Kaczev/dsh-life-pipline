# 内置分镜导航

来自 dsh-video-storyboard v0.7.1（Apache-2.0）的源码快照；不挂载上游插件，不注册工具或配置页。仅保留三个入口的传递依赖，文件内容不作修改。转写等可选模块因静态依赖保留，B 站调用仍使用 `transcript: 'none'`。

- [upstream.json](upstream.json)：来源提交、入口及逐文件 SHA-256；升级时人工核对。
- [lib/pipeline.js](lib/pipeline.js)：分镜主流程与清单；由 B 站隔离工作线程调用。
- [lib/ytdlp.js](lib/ytdlp.js) / [lib/probe.js](lib/probe.js)：下载器发现与媒体探测。
- [ocr_bridge.py](ocr_bridge.py)：保留上游相对路径所需的可选 OCR 侧车。
- [LICENSE](LICENSE)、[NOTICE](NOTICE)、[CREDITS.md](CREDITS.md)：上游许可、版权与贡献说明，原样保留。
- [更新脚本](../../../scripts/vendor-storyboard.mjs)：只接受干净的 v0.7.1 检出；不联网、不覆盖既有快照。更新前须明确审查和移除旧快照，再调整脚本的固定版本并复验。
- [回归测试](../../../test/storyboard-vendor.test.mjs)：快照完整性、相对依赖闭包与无上游 npm 依赖检查。

ffmpeg、ffprobe、yt-dlp 和可选引擎仍由本机提供，不随快照分发。
