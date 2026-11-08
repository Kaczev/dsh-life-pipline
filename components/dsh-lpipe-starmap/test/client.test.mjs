// 客户端半边：星图设置块。除了注册形状，还要真的把它渲染一遍——
// 引用顺序错了（TDZ）会让整块面板直接消失，只有渲染才看得出来。
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
    setTimeout: () => ({ unref() {} }),
    clearTimeout: () => {},
    setInterval: () => ({ unref() {} }),
    clearInterval: () => {},
    Date,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Error,
  }
  sandbox.globalThis = sandbox
  vm.runInNewContext(code, sandbox, { filename: 'lib/client.js' })
  assert.ok(captured, 'the bundle registers itself with the host loader')
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (initial) => ({ current: initial }),
  }
  const exported = captured.factory((name) => {
    if (name === 'react') return react
    throw new Error(`unexpected require: ${name}`)
  })
  return { id: captured.id, exported }
}

function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  return textOf(node.children)
}

test('星图设置块注册到 lpipe.settings.panel，自己的 id 与排序固定', () => {
  const { id, exported } = loadBundle()
  assert.equal(id, 'dsh-lpipe-starmap')
  assert.equal(exported.__test__.PANEL_SLOT, 'lpipe.settings.panel')
  assert.equal(exported.__test__.PANEL_ID, 'starmap')
})

test('面板能渲染出第一屏（引用顺序错会在这里当场抛错）', () => {
  const { exported } = loadBundle()
  const element = exported.__test__.StarmapPanel({ rpcCall: async () => ({ ok: true, value: {} }) })
  const text = textOf(element)
  assert.match(text, /现在抽星/)
  assert.match(text, /Lpipe Starmap/)
})

test('刚点下暂停、宿主还没回话：按钮写「正在暂停」', () => {
  const { exported } = loadBundle()
  const now = Date.now()
  const state = exported.__test__.runState('stopping', { running: true, stopping: true, updatedAt: now - 1000 }, now)
  assert.equal(state.buttonLabel, '正在暂停')
  assert.equal(state.stopping, true)
})

test('宿主内部的 stopping 标志不再左右按钮：它挂着也不显示「正在暂停」', () => {
  const { exported } = loadBundle()
  const now = Date.now()
  const state = exported.__test__.runState('', { running: true, stopping: true, updatedAt: now - 1000 }, now)
  assert.equal(state.buttonLabel, '暂时停止', '还能点停止，但不说「正在暂停」')
  assert.equal(state.stopping, false)
})

test('宿主心跳断了：不再显示「正在暂停」，按钮回到「现在抽星」', () => {
  const { exported } = loadBundle()
  const now = Date.now()
  const state = exported.__test__.runState('stopping', { running: true, stopping: true, updatedAt: now - 10 * 60 * 1000 }, now)
  assert.equal(state.stale, true)
  assert.equal(state.alive, false)
  assert.equal(state.buttonLabel, '现在抽星')
})

test('安静的时候点下去立刻变「暂时停止」，不等宿主回话', () => {
  const { exported } = loadBundle()
  const now = Date.now()
  const started = exported.__test__.runState('starting', { running: false }, now)
  assert.equal(started.buttonLabel, '暂时停止')
  const idle = exported.__test__.runState('', { running: false, updatedAt: now }, now)
  assert.equal(idle.buttonLabel, '现在抽星')
})

test('星数整体可悬浮，显示宿主总数与四类明细，包括空库', () => {
  const { exported } = loadBundle()
  const value = { stars: 13480, text: 13280, exact: 10000, fuzzy: 2454, common: 826, time: 200 }
  const count = exported.__test__.StarCount({ value })
  assert.equal(textOf(count), '13480颗星')
  assert.equal(count.props.title, '10000 颗准确星，2454 颗模糊星，826 颗通用星，200 颗时间星')
  const empty = exported.__test__.StarCount({ value: null })
  assert.equal(textOf(empty), '0颗星')
  assert.equal(empty.props.title, '0 颗准确星，0 颗模糊星，0 颗通用星，0 颗时间星')
})