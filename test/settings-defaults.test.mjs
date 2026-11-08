import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { defaultConfig } from '../components/dsh-lpipe-chat/src/config.mjs'
import { DEFAULT_CONFIG as starmap } from '../components/dsh-lpipe-starmap/src/config.mjs'
import { DEFAULT_INTERVAL_MS, TICK_MS } from '../components/dsh-lpipe-wake/src/engine.mjs'
import { retentionDays } from '../components/dsh-lpipe-bili/src/storage.mjs'

const source = component => readFileSync(new URL(`../components/dsh-lpipe-${component}/client/panel.js`, import.meta.url), 'utf8')

test('配置标题的固定默认值与宿主一致，空白模型选择不冒充默认值', () => {
 const chat = defaultConfig()
 for (const label of [
  `合并间隔（秒）（默认：${chat.quietSeconds}）`,
  `收集窗口（秒）（默认：${chat.windowSeconds}）`,
  `通知／历史上限（默认：${chat.outputBytes / 1024}KB）`,
  `文件下载上限（默认：${chat.downloadBytes / 1024 ** 2}MB）`,
  `下载保留天数（天）（默认：${chat.downloadRetentionDays}）`,
 ]) assert.ok(source('chat').includes(label), label)
 assert.ok(source('wake').includes(`默认唤醒间隔（默认：${DEFAULT_INTERVAL_MS / 3600000} 小时）`))
 assert.ok(source('wake').includes(`心跳间隔（默认：${TICK_MS / 1000} 秒）`))
 assert.ok(source('starmap').includes(`并发路数（默认：${starmap.concurrency} 路）`))
 assert.ok(source('starmap').includes(`输出上限（默认：${starmap.maxTokens}）`))
 assert.ok(source('bili').includes(`下载保留天数（天）（默认：${retentionDays()}）`))
 for (const label of ['提供者', '模型', '思考强度']) assert.ok(!source('starmap').includes(`${label}（默认：`))
})
