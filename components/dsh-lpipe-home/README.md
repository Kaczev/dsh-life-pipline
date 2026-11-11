# dsh-lpipe-home · 栖所管线

[中文](#中文) · [English](#english)

## 中文

为 DeepSeek Harness 的 LP 主对话指定一个个人文件夹，并注入英文 `Personal home folder` 提示词。栖所不增加模型工具，也不改变会话工作目录。

### 安装与快速开始

在 DSH 插件管理中安装并启用 `dsh-lpipe-home`。本包直接依赖 `dsh-life-core`，无需先装 `dsh-life-pipline`。公共核心要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 在 **设置 → Lpipe 设置** 绑定 LP 主对话。
2. 准备一个已经存在、可读写并可进入的目录。
3. 在栖所块选择「工作区」或「自定义」。工作区使用主对话的有效工作目录；自定义必须填写绝对路径。
4. 保存并检查状态为有效。保存配置成功不代表目录校验通过。

默认「未选择」时停用，不注入提示词，也不报缺少目录。可以随时改回未选择。

### 配置

配置位于 `~/.dsh/life-home/config.json`，可用 `DSH_HOME` 替换默认基目录：

```json
{
  "location": "custom",
  "customPath": "C:/Users/your-name/Documents/lpipe-home"
}
```

`location` 可取 `none`、`workspace`、`custom`，默认是 `none`。`customPath` 默认空字符串，仅自定义模式使用。插件不自动创建目录，不回退到其他目录；每次生成提示词时重新校验。保存保留未知字段，配置损坏时会报错并拒绝覆盖。

Owner 称呼与平台身份由聊天管线管理，不在本包配置中设置。

### 授权边界

提示词允许模型在解析后的栖所内自主创建、覆盖和删除文件，不逐次询问。授权不越过目录及符号链接边界，仍受宿主权限约束。**这是提示词授权，不是文件系统沙箱。**

栖所文件只能发送给经验证的 Owner 私聊，不能发送到群聊。若没有聊天管线提供的身份验证，不能仅凭名字认定 Owner。

### 常见问题

- **保存了但未生效？** 查看后端返回的目录错误，确认路径存在且权限满足要求。
- **选择工作区后找不到目录？** 检查 LP 主对话及其有效工作目录；设置页当前打开哪个会话不决定栖所位置。
- **能否让模型借此操作任意目录？** 栖所只声明指定目录的使用规则，不扩张宿主权限。
- **为什么没有栖所工具？** 本包提供提示词与配置；实际文件操作使用宿主已有工具。

许可：AGPL-3.0-or-later。

## English

Assign a personal folder to the LP main session in DeepSeek Harness. This package injects an English `Personal home folder` prompt section. It adds no tools and does not change the session's working directory.

### Install and start

Install and enable `dsh-lpipe-home` through DSH plugin management. It depends directly on `dsh-life-core`, not the aggregate package. Core requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main session in **Settings → Lpipe settings**. Prepare an existing directory with read, write and traversal access, then choose **workspace** or **custom** in Home settings. Workspace means the main session's effective working directory; custom requires an absolute path. Save and check that the directory is valid. A successful save alone does not make an invalid folder active. The default **none** mode injects no prompt.

### Configuration and boundaries

The JSON example above configures a custom folder. `location` accepts `none` (default), `workspace` and `custom`; `customPath` defaults to an empty string. Configuration is stored in `~/.dsh/life-home/config.json`, with `DSH_HOME` as an optional replacement base.

The plugin does not create folders or fall back to a different path. It validates the folder whenever it generates the prompt. Saves retain unknown fields and refuse to overwrite corrupted configuration. Owner names and platform identity belong to Chat settings.

The prompt allows autonomous creation, replacement and deletion inside the resolved Home folder, without crossing directory or symlink boundaries. This is prompt authorization, not a filesystem sandbox, and host permissions still apply. Home files may be sent only to a verified Owner in private chat, never to groups; a display name alone does not establish that identity.

### Troubleshooting

If a saved folder remains inactive, inspect the validation error and directory permissions. If workspace mode cannot resolve a path, check the bound main session rather than the session currently open in settings. File operations use existing host tools; no Home-specific tool is registered.

License: AGPL-3.0-or-later.
