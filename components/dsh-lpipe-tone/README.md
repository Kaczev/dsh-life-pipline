# 语气管线 · dsh-lpipe-tone

手动配置主会话回复的语气描述和对话示例，作为系统提示词的一部分。设置页里的「语气管线」块提供两个可选的多行输入框，保存、清空都在本地完成，不做自动学习或定期模型判断。

两个字段 `description`、`examples` 默认空，可独立填写。正文原样保存，每项最多 32000 个 JavaScript 字符（UTF-16 code units）；允许多行及制表符，不允许其他控制字符。空白字段不产生提示词，两个字段均空白时不注入任何内容。非空时使用 `## Reply tone` 和 `## Reply tone examples` 固定标题，并说明表达风格不改变事实和工具准确性、示例不代表当前事件或有效承诺。

仅当前绑定的 LP 主会话可见，不扩展到子 agent 或其他会话。保存后的下次系统提示词组装读取新配置，不改历史、不做自动学习或模型调用。不添加每轮时间戳，也不插值正文。这里保证内容确定性，不保证提供方实际缓存命中率。

## 设置页

「Lpipe 设置」页的最后一块是语气管线，排在其他管线之后：

- 两个多行输入框：语气描述、对话示例；框右上角是当前字符数与上限。
- 读取中、读取失败（带重试）、保存中、保存失败都有独立状态；读取失败不会显示成“空白配置”。
- 「保存」只在有有效未保存改动时亮起，改回原值或保存成功后禁用；保存失败保留草稿。
- 「撤回」只放弃当前草稿；「清空」把两项都置空并立即保存，之后不再注入任何语气内容。
- 清空与保存都使用返回的 `config` 作为新的已保存基线；保存期间晚返回的旧响应不会覆盖之后新打的草稿。
- 输入框里的文字不会被 trim，前后空格和换行都会原样保存。

输入框只做与宿主一致的前置校验（字符上限、控制字符），注入规则仍只在宿主侧实现，不在 UI 里重复。

## 配置与接口

数据文件位于 `DSH_HOME/life-tone/config.json`；没有 `DSH_HOME` 时使用用户主目录下的 `.dsh/life-tone/config.json`。原子保存，部分更新保留其他字段与磁盘未知键。文件损坏时读取与保存报错，不静默清空或覆盖；应先检查并修复文件。

通过宿主现有认证连接发送 `POST /api/dsh-lpipe-tone`，`Content-Type: application/json`：

```json
{
  "type": "client-request",
  "rpcId": "caller-generated-id",
  "method": "dsh-lpipe-tone",
  "payload": {
    "method": "tone.config.save",
    "payload": { "description": "用括号描述状态。", "examples": "" }
  }
}
```

- `tone.config`：payload 使用 `{}`，读取 `{ config: { description, examples } }`。
- `tone.config.save`：payload 是至少含一个已知字段的对象，支持部分更新；传空字符串清空。成功返回相同的 config 结构。未知字段、错误类型或超限均拒绝。

响应为 `{ type: 'server-response', rpcId, result }`，成功 `result = { ok: true, value: { config } }`，失败 `result = { ok: false, error: { code, message, details } }`。前端应在成功后使用返回值作为已保存基线，失败保留草稿并显示错误。

## 构建与测试

客户端半边由 `client/panel.js` 打包成 `lib/client.js`（宿主的客户端模块壳，没有额外打包器）：

```bash
node components/dsh-lpipe-tone/scripts/build-client.mjs
node --test "components/dsh-lpipe-tone/test/*.test.mjs"
```

在仓库根跑全部客户端构建用 `node scripts/build-clients.mjs`。测试覆盖宿主注入与 RPC，以及设置块的读取、失败重试、校验、保存、清空、失败与晚返回。

本包只依赖生命核心。图标在 `assets/icon.png`（512² 透明 PNG）。
