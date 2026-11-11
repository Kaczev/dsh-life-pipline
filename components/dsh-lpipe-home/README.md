# dsh-lpipe-home · 栖所管线

[中文](#中文) · [English](#english)

## 中文

为 DeepSeek Harness 的 LP 主对话指定一个个人文件夹，让模型在其中保存和整理自己的文件。栖所不会改变主对话原有的工作目录。

### 安装与设置

在 DSH 插件管理中安装并启用 `dsh-lpipe-home`。插件需要生命核心，无需先装整合包。要求 DSH `>=0.2.0-rc.2`，Node.js `^22.19 || >=24`。

1. 打开 **设置 → Lpipe 设置**，绑定 LP 主对话。
2. 准备一个已存在、可读写的文件夹。
3. 在栖所设置中选择「工作区」或「自定义」。工作区使用主对话的工作目录；自定义需要填写完整的绝对路径。
4. 保存后检查目录状态是否有效。

默认「未选择」表示停用，随时可以改回。插件不会自动创建缺失的文件夹，也不会在路径失效时改用其他位置。保存成功但状态无效时，请检查目录是否存在及权限是否足够。

### 授权与隐私

模型可以在指定栖所内自主创建、覆盖和删除文件，无需逐次询问。请选择愿意交给模型管理的目录，并备份重要内容。**栖所通过提示词约定操作范围，不是文件系统沙箱，宿主权限仍然适用。**

栖所文件的发送授权仅限经核验的 Owner 私聊，不包括群聊。Owner 的名字和平台身份由聊天管线管理，不能只凭称呼认定身份。

选择工作区后目录没有生效时，请检查绑定的 LP 主对话及其工作目录；设置页当前打开的会话不决定栖所位置。

许可：AGPL-3.0-or-later。

## English

Give the LP main conversation in DeepSeek Harness a personal folder for saving and organizing its files. Home does not change the conversation's working directory.

### Install and set up

Install and enable `dsh-lpipe-home` through DSH plugin management. It requires Life Core, not the aggregate package. Requires DSH `>=0.2.0-rc.2` and Node.js `^22.19 || >=24`.

Bind the LP main conversation in **Settings → Lpipe settings** and prepare an existing, writable folder. Choose **workspace** to use the main conversation's working directory, or **custom** to enter a full absolute path. Save and check that the folder is valid.

The default **none** option disables Home and can be selected again at any time. Missing folders are not created automatically, and invalid paths do not fall back to another location. If a save succeeds but the folder remains invalid, check its existence and permissions.

### Authorization and privacy

The model is authorized to create, replace and delete files inside the designated Home without asking each time. Choose a folder you are willing to let it manage and back up important files. **This is a prompt-based boundary, not a filesystem sandbox. Host permissions still apply.**

Home files may be sent only to a verified Owner in private chat, never to groups. Owner names and platform identity are managed by Chat; a display name alone does not establish identity.

If workspace mode cannot resolve a folder, check the bound LP main conversation and its working directory, rather than whichever conversation is currently open in settings.

License: AGPL-3.0-or-later.
