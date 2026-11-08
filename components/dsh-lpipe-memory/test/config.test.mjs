import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { loadConfig, saveConfig, configFile } from '../src/config.mjs'
import { isMemorySession, registerMemoryTool, registerMemorySection } from '../src/scope.mjs'
import { createMemoryRpcHandler, registerMemoryRpc } from '../src/rpc.mjs'
import { isMainSession } from 'dsh-life-pipline/main-session'

const home = mkdtempSync(join(tmpdir(), 'memory-config-'))
process.env.DSH_HOME = home
mkdirSync(join(home, 'life-pipline'))
writeFileSync(join(home, 'life-pipline', 'config.json'), JSON.stringify({ mainSessionId: 'main' }))
const root = join(home, 'life-memory')

test('scope defaults closed, switches live, and leaves other pipelines main-only', async () => {
  assert.deepEqual(loadConfig(), { allSessions: false })
  assert.equal(isMemorySession('main'), true)
  assert.equal(isMemorySession('other'), false)
  let tool, condition, section
  const ctx = { tools: { register(t, o) { tool=t; condition=o.when } }, systemPrompt: { section(s) { section=s } } }
  registerMemoryTool(ctx, { execute: async () => 'ok' })
  registerMemorySection(ctx, { text: 'memory' })
  assert.equal(condition({ agent: { id: 'other' } }), false)
  assert.equal(section.text({ scope: { id: 'other' } }), '')
  saveConfig({ allSessions: true })
  assert.equal(isMemorySession('other'), true)
  assert.equal(isMemorySession({ id: 'child' }), true)
  assert.equal(isMemorySession({}), false)
  assert.equal(isMainSession('other'), false)
  assert.equal(condition({ agent: { id: 'other' } }), true)
  assert.equal(await tool.execute({}, { agent: { id: 'other' } }), 'ok')
  assert.equal(section.text({ scope: { id: 'other' } }), 'memory')
  saveConfig({ allSessions: false })
  assert.throws(() => tool.execute({}, { agent: { id: 'other' } }))
  assert.equal(section.text({ scope: { id: 'other' } }), '')
})

test('saving preserves unknown keys and rejects malformed values without overwriting', () => {
  writeFileSync(configFile(root), JSON.stringify({ unknown: { kept: 1 } }))
  saveConfig({ allSessions: true })
  assert.deepEqual(JSON.parse(readFileSync(configFile(root))), { unknown: { kept: 1 }, allSessions: true })
  for (const patch of [{}, { allSessions: 'true' }, { allSessions: 1 }, { allSessions: true, other: 1 }]) assert.throws(() => saveConfig(patch))
  writeFileSync(configFile(root), '{broken')
  assert.deepEqual(loadConfig(), { allSessions: false })
  assert.throws(() => saveConfig({ allSessions: true }))
  assert.equal(readFileSync(configFile(root), 'utf8'), '{broken')
  writeFileSync(configFile(root), '{}')
})

test('memory RPC exposes config in existing HTTP envelope and validates writes', async () => {
  const handle = createMemoryRpcHandler({ stats: () => ({ rows: 0 }), getConfig: loadConfig, saveConfig })
  assert.deepEqual(await handle('memory.config', {}), { ok: true, value: { allSessions: false } })
  assert.equal((await handle('memory.config.save', { allSessions: 'false' })).error.code, 'memory/bad-request')
  let route
  registerMemoryRpc({ connection: { fetch: { register(r) { route=r } } } }, handle)
  const response = await route.fetch(new Request('http://localhost/api/dsh-lpipe-memory', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type:'client-request', rpcId:'scope', method:'dsh-lpipe-memory', payload:{ method:'memory.config.save', payload:{ allSessions:true } } }) }))
  const message = await response.json()
  assert.deepEqual(message, { type:'server-response', rpcId:'scope', result:{ ok:true, value:{ allSessions:true } } })
  await handle('memory.config.save', { allSessions:false })
})
