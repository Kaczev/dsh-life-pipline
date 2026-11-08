# 收编清单

本包不依赖 dsh-im，直接把两条通道的协议层拿过来自己驱动。

| 文件 | 来源 | 说明 |
| --- | --- | --- |
| `src/weixin/vendor/weixin-api.mjs` | `dsh-im` 5.9.1 · `src/channels/weixin/weixin-api.mjs`（MIT） | 原样复制，只把 `../shared/image-prompt.mjs` 改为本地 `fetchImageBuffer`，避免引入私有目录。iLink 官方机器人协议（getupdates / sendmessage / 扫码登录）全在这一层。 |
| `src/qrcode.mjs`、`test/qrcode-loading.test.mjs` | `dsh-im` · `fc2ceab217309f8973afa03c58cdd8ff3e900130`（MIT，#537） | 原生 CommonJS 加载与重复清缓存测试，调整本地路径。 |
| `src/qq/channel.mjs` | 自写，基于官方 SDK；回复窗口策略参考 `dsh-im` · `b9baa78bf5750df9a2b340982e672c56c76e68e1`（MIT，#464） | 不复制桥接层；适配为按目标自动选消息、预算预留和明确拒绝后的单次主动降级。 |

## 跟进方式

1. 上游发新版时，diff `src/channels/weixin/weixin-api.mjs` 与 `vendor/weixin-api.mjs`。
2. 协议没变就不用动；变了就整文件替换，再跑一次上面的本地替身改动。
3. QQ 侧只跟 SDK 版本，`package.json` 里固定 `@tencent-connect/*` 的版本号。

## 为什么不用 dsh-im 当传输

- `exclusive-text-consumer` 在 5.9.1 只对飞书开放，QQ/微信没有外部入站入口。
- 装插件走 pnpm，生命周期脚本被 `~/.npmrc` 的 `allow-scripts` 拦死，补丁不会随安装生效。
- `patchedDependencies` 只认 profile 根目录，插件无权改。

结论：要么 fork，要么自己收通道。选了后者——保留 MIT 声明，协议层照抄，业务层自己写。
