import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendDiagnostic, DIAGNOSTIC_MAX_BYTES } from '../src/diagnostics.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), '诊断 日志-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return join(root, 'nested', 'log.jsonl')
}
test('诊断日志默认2MiB，按完整UTF-8记录保留最新尾部', t => {
  const file = fixture(t)
  assert.equal(DIAGNOSTIC_MAX_BYTES, 2097152)
  for (let i = 0; i < 50; i++) assert.equal(appendDiagnostic(file, { i, text: '中文🙂'.repeat(3) }, 256), true)
  const text = readFileSync(file, 'utf8')
  const rows = text.trim().split('\n').map(JSON.parse)
  assert.ok(statSync(file).size <= 256)
  assert.equal(rows.at(-1).i, 49)
  assert.ok(rows.length > 1)
  assert.ok(!text.includes('�'))
  assert.ok(rows.every((row, i) => i === 0 || row.i === rows[i - 1].i + 1))
})
test('已超限旧文件只保留有完整边界的尾部；无换行尾部舍弃', t => {
  const file = fixture(t)
  appendDiagnostic(file, { init: true }, 80)
  writeFileSync(file, 'x'.repeat(5000) + '\n' + JSON.stringify({ old: true }) + '\n')
  assert.equal(appendDiagnostic(file, { latest: true }, 80), true)
  assert.deepEqual(readFileSync(file, 'utf8').trim().split('\n').map(JSON.parse), [{ old: true }, { latest: true }])
  writeFileSync(file, '中'.repeat(5000))
  assert.equal(appendDiagnostic(file, { latest: 2 }, 80), true)
  assert.equal(readFileSync(file, 'utf8'), '{"latest":2}\n')
})
test('超大单条、循环引用、无效上限和不可写目标不影响业务且不破坏已有记录', t => {
  const file = fixture(t)
  appendDiagnostic(file, { ok: true }, 64)
  const before = readFileSync(file)
  assert.equal(appendDiagnostic(file, { huge: 'x'.repeat(100) }, 64), false)
  const circular = {}; circular.self = circular
  assert.equal(appendDiagnostic(file, circular, 64), false)
  assert.equal(appendDiagnostic(file, {}, 0), false)
  assert.equal(appendDiagnostic(join(file, 'child'), {}, 64), false)
  assert.deepEqual(readFileSync(file), before)
})
