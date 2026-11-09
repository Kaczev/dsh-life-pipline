# 栖所管线

仅向 LP 主会话注入英文 `## Personal home folder` section，不增加模型工具。默认 `location: "none"`，不注入，也不报目录错误。

## 设置

设置页里的「Lpipe Home」块只暴露两项：栖所位置（未选择／工作区／自定义）、自定义绝对路径；自定义路径只在选中「自定义」时出现。

- 未选择时状态行是灰色的「未选择栖所，管线停用，不注入提示词」。
- 选择后目录校验不通过时标红，并显示后端返回的原因；路径只用于展示，截断显示。
- 保存成功不等于栖所生效：保存后仍会按返回的 `status` 再显示一次结果，`valid` 为 false 时额外提示「已保存，但栖所尚未生效」。
- `home.config` 返回 `config: null` 表示配置文件读不出来，界面显示读取失败和「重试」，不会退回成空白默认值当成功。
- 草稿改动经过防抖调用 `home.validate`；保存与校验都不改变工作目录，也不创建目录。

## 配置桥

客户端调用 `ctx.connection.rpc.call('/api', 'dsh-lpipe-home', { method, payload }, signal)`。

- `home.config`：读取 `{config,status}`。
- `home.config.save`：提交一个或多个配置字段，返回保存后的 `{config,status}`。
- `home.validate`：提交完整草稿配置，只验证，不保存；返回 `{config,status}`。

`config` 为 `{location: "none" | "workspace" | "custom", customPath: string}`。默认未选择、路径空白。Owner 名字由聊天管线配置和注入；旧名字由 Chat 在首次读取时兼容迁移，不覆盖 Chat 已有名字。工作区来自公共配置指定主会话的有效工作目录，不来自设置页会话。不配置微信号或 QQ 号。

`status` 为 `{state: "disabled" | "invalid" | "active", valid: boolean, path: string, resolvedPath: string, error: string}`。未选择显示停用；选了位置但目录无效时显示红色错误。保存无效目录仍会成功保存配置，但 `valid` 为 false，不表示管线已生效。配置文件损坏时 `config` 为 null，状态为 invalid；界面应显示错误，不能伪装成空白默认值。

配置保存在 `DSH_HOME/life-home/config.json`（未设置 DSH_HOME 时使用 `~/.dsh`）。保存保留未知键，拒绝覆盖损坏配置。路径必须是存在、可读写及进入的目录；不自动创建栖所，不更改工作目录，不回退目录。每次生成 section 时重新验证。

## 文件权限

提示词允许自主创建、覆盖和删除解析后的栖所内文件，不逐次询问主人；授权不越过目录或符号链接边界，仍受宿主权限约束。这是提示词授权，不是文件系统沙箱或发送拦截器。栖所文件只能发给已验证的主人私聊，不能发到群聊；名字仅作称呼，身份使用聊天管线的验证信息。

## 客户端资源

`client/panel.js` 注册到公共 `lpipe.settings.panel` 槽位（`id: 'home'`、`order: 70`）。构建：`node components/dsh-lpipe-home/scripts/build-client.mjs` 生成 `lib/client.js`；`assets/icon.png` 是 512² 透明图标，随 `package.json` 的 `icon`／`exports`／`files` 一起发布。

回归命令：`node --test components/dsh-lpipe-home/test/*.test.mjs`（仓库根目录运行）。
