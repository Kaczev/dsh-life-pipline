# 语气管线 · dsh-lpipe-tone

在 **设置 → Lpipe 设置 → 语气管线** 中，填写一句希望模型在回复时常用的话，然后点击「保存」。输入框默认留空，「呜……」是占位示例。如果填入 `呜……` 并保存，宿主会在下次组装系统提示词时加入以下两行。

```text
## Tone
You like saying “呜……” when replying to the user.
```

## 设置与生效范围

「习惯用语」接受单行文字，上限为 32000 个 UTF-16 码元。生成提示词时会去掉用语两端的空白。留空或只填空白字符时，宿主会跳过整个 `## Tone` 段落。要停用已保存的用语，删掉输入框里的文字，再点击「保存」。「撤回」会把未提交的草稿还原为上次保存的内容。

默认只有绑定的 LP 主对话会收到这段提示词。打开「所有顶层对话生效」后，所有顶层对话共用这句习惯用语，子智能体仍在作用范围之外。开关即时保存，输入框中的草稿可以继续编辑。关闭开关后，习惯用语再次只对 LP 主对话生效。改绑 LP 主对话时沿用已保存的习惯用语。

## 升级旧配置

旧版 `prompt`、`diction`、`syntax`、`rhythm`、`expression` 以及更早的 `description`、`examples` 会留在本地配置中。宿主只用 `phrase` 生成语气提示词。旧配置缺少 `phrase` 时，习惯用语为空。如果还想用以前的某个词或短句，在「习惯用语」框中填入并保存即可。

## 配置与接口

配置位于 `DSH_HOME/life-tone/config.json`。未设置 `DSH_HOME` 时使用 `~/.dsh/life-tone/config.json`。保存使用临时文件及原子替换，保留磁盘未知键。损坏文件会报错。

使用宿主现有认证连接发送 `POST /api/dsh-lpipe-tone`，`Content-Type: application/json`。以下请求只清空习惯用语。

```json
{
  "type": "client-request",
  "rpcId": "caller-generated-id",
  "method": "dsh-lpipe-tone",
  "payload": {
    "method": "tone.config.save",
    "payload": { "phrase": "" }
  }
}
```

`tone.config` 使用空 payload 读取 `phrase`、`allSessions` 和宿主默认值，成功返回 `{ ok: true, value: { config, defaults } }`。`tone.config.save` 接受至少一个已知字段，例如 `{ "allSessions": true }` 只保存生效范围。`allSessions` 必须是布尔值，旧配置缺少此字段时按 `false` 读取。未知字段、非法类型、换行、非法控制字符和超限输入均会报错。保存成功返回 `{ ok: true, value: { config } }`。失败返回 `{ ok: false, error: { code, message, details } }`，封装于 `{ type: 'server-response', rpcId, result }`。

## 构建与测试

```bash
node components/dsh-lpipe-tone/scripts/build-client.mjs
node --test "components/dsh-lpipe-tone/test/*.test.mjs"
```

客户端源文件 `client/panel.js` 构建为 `lib/client.js`。回归测试覆盖配置读写、旧字段保留、提示词生成与空白输入、顶层对话与子智能体的区分，以及开关和文字草稿的独立保存。本包只依赖生命核心。
