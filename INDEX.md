# 导航

bundle 包 `dsh-life-pipline` 只有清单，组件各自是独立包、独立元信息与图标。

- [README.md](README.md)：结构、显示名与图标、组件说明、安装与配置。
- [cordis.patch.yml](cordis.patch.yml)：组件挂载清单，一行一个组件包（行名必须是裸包名）。
- [assets/icon.png](assets/icon.png)：bundle 图标（心形带子，512² 透明 PNG）。
- [locale/en.json](locale/en.json) / [locale/zh.json](locale/zh.json)：bundle 的显示名「Life Pipline」与简介。
- [scripts/install-local.mjs](scripts/install-local.mjs)：把 bundle 与 `components/*` 以 link 方式装进本机 profile。
- [components/dsh-lpipe-chat/](components/dsh-lpipe-chat/)：社交通道组件包（微信 / QQ）。

## components/dsh-lpipe-chat

- [components/dsh-lpipe-chat/package.json](components/dsh-lpipe-chat/package.json)：包名、`icon`、`exports`、`dsh.client` 注入点。
- [components/dsh-lpipe-chat/assets/icon.png](components/dsh-lpipe-chat/assets/icon.png)：组件图标（两个气泡合流，512² 透明 PNG）。
- [components/dsh-lpipe-chat/locale/en.json](components/dsh-lpipe-chat/locale/en.json) / [zh.json](components/dsh-lpipe-chat/locale/zh.json)：组件显示名「Life Chat」与简介。
- [components/dsh-lpipe-chat/src/index.js](components/dsh-lpipe-chat/src/index.js)：组件装配、服务注入与清理。
- [components/dsh-lpipe-chat/src/gateway.mjs](components/dsh-lpipe-chat/src/gateway.mjs)：入站窗口合并、通知消息构造与重试。
- [components/dsh-lpipe-chat/src/notice.mjs](components/dsh-lpipe-chat/src/notice.mjs)：主会话恢复、忙时注入与空闲唤醒。
- [components/dsh-lpipe-chat/client/panel.js](components/dsh-lpipe-chat/client/panel.js)：配置页与主会话 📌 标记，构建到 `lib/client.js`。
- [components/dsh-lpipe-chat/test/](components/dsh-lpipe-chat/test/)：窗口合并、投递、接收过滤、客户端与主题回归。
