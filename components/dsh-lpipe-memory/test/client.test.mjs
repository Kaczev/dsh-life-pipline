// 客户端半边：只往「Lpipe 设置」的子槽里注册一块记忆显示。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const here = dirname(fileURLToPath(import.meta.url))
const bundlePath = resolve(here, '../lib/client.js')
const code = readFileSync(bundlePath, 'utf8')

function loadBundle() {
  let captured = null
  const sandbox = {
    window: { __ModuleLoader__: { load: (entry) => { captured = entry } } },
    module: { exports: {} },
    exports: {},
    console,
    setInterval: () => ({ unref() {} }),
    clearInterval: () => {},
    Date,
    JSON,
    Math,
    Number,
    String,
    Object,
    Array,
    Error,
  }
  sandbox.globalThis = sandbox
  vm.runInNewContext(code, sandbox, { filename: 'lib/client.js' })
  assert.ok(captured, 'the bundle registers itself with the host loader')
  const factory = captured.factory
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
  }
  const exported = factory((name) => {
    if (name === 'react') return react
    throw new Error(`unexpected require: ${name}`)
  })
  return { id: captured.id, exported }
}

test('the bundle registers one block in the panel slot', () => {
  const { id, exported } = loadBundle()
  assert.equal(id, 'dsh-lpipe-memory')
  assert.equal(exported.name, 'dsh-lpipe-memory-settings')
  assert.deepEqual([...exported.inject], ['slots', 'connection'])
  assert.equal(exported.__test__.PANEL_SLOT, 'lpipe.settings.panel')
  assert.equal(exported.__test__.TURNS, 30)
})

test('apply only claims the memory block, never the page itself', () => {
  const { exported } = loadBundle()
  const registered = []
  const ctx = {
    connection: { rpc: { call: () => ({ ok: true, value: {} }) } },
    slots: {
      inject: (key, callback) => { registered.push({ key, entry: callback() }) },
      register: (options, component) => ({ options, component }),
    },
  }
  exported.apply(ctx)
  assert.deepEqual(registered.map((item) => item.key), ['lpipe.settings.panel'])
  const entry = registered[0].entry
  assert.equal(entry.options.name, 'lpipe.settings.panel')
  assert.equal(entry.options.id, 'memory')
  assert.equal(entry.options.order, 30)
  assert.equal(entry.options.label(), '记忆管线')
  assert.equal(typeof entry.options.inject, 'function')
})

test('sizes are printed human-first', () => {
  const { formatBytes, plotOf, formatClock } = loadBundle().exported.__test__
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(812 * 1024), '812 KB')
  assert.equal(formatBytes(15 * 1024 * 1024), '15.00 MB')
  assert.equal(formatClock(NaN), '—')

  const plot = plotOf([
    { total: 1000, diskTotal: 400 },
    { total: 2000, diskTotal: 800 },
    { total: 4000, diskTotal: 1600 },
  ])
  const points = plot.line.split(' ')
  assert.equal(points.length, 3)
  assert.deepEqual(points[0].split(',')[0], '0.00')
  assert.deepEqual(points[2].split(',')[0], '100.00')
  // 纵轴跟着两条线一起走：最小的点（落盘的起点）落在下缘，最大的点落在上缘。
  const first = Number(points[0].split(',')[1])
  const last = Number(points[2].split(',')[1])
  assert.ok(first > 40 && first < 80, `original starts in the middle band, got ${first}`)
  assert.ok(last > 4 && last < 20, `max point sits near the ceiling, got ${last}`)
  // 落盘线在同一张图上，永远在原文档下面（y 更大）。
  assert.ok(plot.disk, 'a disk line is drawn when every turn has a disk total')
  const diskPoints = plot.disk.split(' ')
  assert.equal(diskPoints.length, 3)
  const diskFirst = Number(diskPoints[0].split(',')[1])
  assert.ok(diskFirst > 80 && diskFirst < 96, `disk starts near the floor, got ${diskFirst}`)
  assert.ok(Number(diskPoints[2].split(',')[1]) > last + 20, 'disk sits well below the original line')
  // 没有落盘数字时只画原文一条线。
  assert.equal(plotOf([{ total: 1000 }]).disk, null)
  assert.equal(plotOf([]), null)
})
