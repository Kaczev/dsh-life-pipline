// 客户端半边：回忆设置块。除了注册形状，还要真的渲染一遍——引用顺序错（TDZ）
// 会让整块面板直接消失，只有渲染才看得出来。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { PANEL_FIELDS } from '../src/config.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const code = readFileSync(resolve(here, '../lib/client.js'), 'utf8')

function loadBundle() {
  let captured = null
  const sandbox = {
    window: { __ModuleLoader__: { load: (entry) => { captured = entry } } },
    module: { exports: {} },
    exports: {},
    console,
    setTimeout: () => ({ unref() {} }),
    clearTimeout: () => {},
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
  if (typeof node.type === 'function') return textOf(node.type(node.props))
  return textOf(node.children)
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

test('回忆设置块注册到 lpipe.settings.panel，排在星图后面', () => {
  const { id, exported } = loadBundle()
  assert.equal(id, 'dsh-lpipe-recall')
  const testApi = exported.__test__
  assert.equal(testApi.PANEL_SLOT, 'lpipe.settings.panel')
  assert.equal(testApi.PANEL_ID, 'recall')

  let injected = null
  let registered = null
  const ctx = {
    slots: {
      inject: (slot, register) => { injected = { slot, register } },
      register: (options, component) => { registered = { options, component }; return options },
    },
    connection: { rpc: { call: (...args) => ({ args }) } },
  }
  exported.apply(ctx)
  assert.equal(injected.slot, 'lpipe.settings.panel')
  const options = injected.register()
  assert.equal(options.name, 'lpipe.settings.panel')
  assert.equal(options.id, 'recall')
  assert.equal(options.order, 50)
  assert.equal(options.label(), '回忆管线')
  assert.equal(registered.component, testApi.RecallPanel)

  const props = options.inject()
  const reply = props.rpcCall('recall.config', {})
  assert.equal(reply.args[0], '/api')
  assert.equal(reply.args[1], 'dsh-lpipe-recall')
  assert.deepEqual(plain(reply.args[2]), { method: 'recall.config', payload: {} })
})

test('面板能渲染第一屏（引用顺序错会在这里当场抛错）', () => {
  const { exported } = loadBundle()
  const element = exported.__test__.RecallPanel({ rpcCall: async () => ({ ok: true, value: {} }) })
  const text = textOf(element)
  assert.match(text, /Lpipe Recall/)
  assert.match(text, /回忆管线/)
  assert.match(text, /正在读取回忆管线配置/)
})

test('表单只出现六个输入项，默认值用 K/M 简写', () => {
  const { exported } = loadBundle()
  const testApi = exported.__test__
  const form = testApi.displayValues(testApi.DEFAULT_VALUES)
  assert.equal(form.inputChars, '32K')
  assert.equal(form.backgroundChars, '16K')
  assert.equal(form.coolChars, '2.5M')
  const element = testApi.RecallForm({
    form,
    errors: {},
    saving: false,
    dirty: false,
    statusText: '只改这六项。',
    statusTone: 'muted',
    onChange: () => {},
    onSave: () => {},
    onRevert: () => {},
  })
  const text = textOf(element)
  for (const label of ['每轮片段', '每段句数', '真文上限', '背景窗口', '冷却窗口', '近期记忆天数']) {
    assert.match(text, new RegExp(label))
  }
  assert.match(text, /2K–32K/)
  for (const item of testApi.FIELDS) {
    assert.ok(text.includes(`${item.label}（默认：${testApi.compactValue(item.fallback)}）`))
  }
  const changed = testApi.RecallForm({
    form: { ...form, coolChars: '32K' }, errors: {}, saving: false, dirty: true,
    onChange() {}, onSave() {}, onRevert() {},
  })
  assert.match(textOf(changed), /冷却窗口（默认：2\.5M）/)
  assert.match(text, /8K–96K/)
  assert.match(text, /32K–4M/)
  assert.match(text, /保存/)
  assert.doesNotMatch(text, /enabled|minStrength|minStars|secondEvery/)
})

test('六个输入项的范围与宿主配置表完全一致', () => {
  const { exported } = loadBundle()
  const fields = exported.__test__.FIELDS
  assert.deepEqual(
    plain(fields.map(({ key, min, max, fallback }) => ({ key, min, max, fallback }))),
    PANEL_FIELDS.map(({ key, min, max, fallback }) => ({ key, min, max, fallback })),
  )
})

test('K/M 简写能读回来，非整数和越界仍然挡住', () => {
  const { exported } = loadBundle()
  const { parseAmount, validateDraft, compactValue } = exported.__test__

  assert.equal(parseAmount('32K'), 32000)
  assert.equal(parseAmount('32k'), 32000)
  assert.equal(parseAmount('1M'), 1000000)
  assert.equal(parseAmount('1.5M'), 1500000)
  assert.equal(parseAmount('2,000'), 2000)
  assert.ok(Number.isNaN(parseAmount('32KK')))
  assert.ok(Number.isNaN(parseAmount('2.5')))
  assert.ok(Number.isNaN(parseAmount('')))

  assert.ok(validateDraft({}).errors.fragments)
  assert.match(validateDraft({ ...exported.__test__.DEFAULT_VALUES, inputChars: '320000' }).errors.inputChars, /2K–32K/)
  assert.match(validateDraft({ ...exported.__test__.DEFAULT_VALUES, fragments: '2.5' }).errors.fragments, /整数/)
  assert.equal(validateDraft({ ...exported.__test__.DEFAULT_VALUES, inputChars: '32K' }).values.inputChars, 32000)

  assert.equal(compactValue(4000000), '4M')
  assert.equal(compactValue(32000), '32K')
  assert.equal(compactValue(1500), '1.5K')
  assert.equal(compactValue(1234), '1234')
  assert.equal(compactValue(2), '2')
})
