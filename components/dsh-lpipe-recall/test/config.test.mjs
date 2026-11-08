import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  DEFAULT_CONFIG,
  PANEL_FIELDS,
  panelConfigOf,
  readRawConfig,
  savePanelConfig,
} from '../src/config.mjs'

function tempRoot() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-recall-config-'))
  return { root, done: () => rmSync(root, { recursive: true, force: true }) }
}

function writeConfig(root, value) {
  writeFileSync(join(root, 'config.json'), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

test('面板只开放六项，默认值与范围跟实现一致', () => {
  assert.deepEqual(
    PANEL_FIELDS.map(({ key, min, max, fallback }) => ({ key, min, max, fallback })),
    [
      { key: 'fragments', min: 1, max: 5, fallback: 4 },
      { key: 'sentencesPerFragment', min: 1, max: 12, fallback: 2 },
      { key: 'inputChars', min: 2000, max: 32000, fallback: 32000 },
      { key: 'backgroundChars', min: 8000, max: 96000, fallback: 16000 },
      { key: 'coolChars', min: 32000, max: 4000000, fallback: 2500000 },
      { key: 'recentDays', min: 1, max: 3650, fallback: 30 },
    ],
  )
  assert.deepEqual(panelConfigOf({}), {
    fragments: DEFAULT_CONFIG.fragments,
    sentencesPerFragment: DEFAULT_CONFIG.sentencesPerFragment,
    inputChars: DEFAULT_CONFIG.inputChars,
    backgroundChars: DEFAULT_CONFIG.backgroundChars,
    coolChars: DEFAULT_CONFIG.coolChars,
    recentDays: 30,
  })
})

test('保存六项时保留 enabled、minStrength、minStars、secondEvery 与未知字段', () => {
  const { root, done } = tempRoot()
  try {
    writeConfig(root, {
      enabled: false,
      fragments: 3,
      sentencesPerFragment: 2,
      inputChars: 12000,
      backgroundChars: 9000,
      coolChars: 50000,
      minStrength: 7,
      minStars: 2,
      secondEvery: 5,
      futureKnob: 'keep-me',
    })

    const saved = savePanelConfig(root, {
      fragments: 4,
      sentencesPerFragment: 6,
      inputChars: 20000,
      backgroundChars: 24000,
      coolChars: 250000,
      recentDays: 30,
    })
    assert.deepEqual(saved, {
      fragments: 4,
      sentencesPerFragment: 6,
      inputChars: 20000,
      backgroundChars: 24000,
      coolChars: 250000,
      recentDays: 30,
    })

    const raw = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'))
    assert.equal(raw.enabled, false)
    assert.equal(raw.minStrength, 7)
    assert.equal(raw.minStars, 2)
    assert.equal(raw.secondEvery, 5)
    assert.equal(raw.futureKnob, 'keep-me')
    assert.equal(raw.fragments, 4)
    assert.equal(raw.sentencesPerFragment, 6)
    assert.equal(raw.inputChars, 20000)
    assert.equal(raw.backgroundChars, 24000)
    assert.equal(raw.coolChars, 250000)
  } finally {
    done()
  }
})

test('只改传入的字段，没传的保持原样（哪怕是越界的旧值）', () => {
  const { root, done } = tempRoot()
  try {
    writeConfig(root, { fragments: 2, inputChars: 999999, enabled: true })
    const saved = savePanelConfig(root, { fragments: 5 })
    assert.equal(saved.fragments, 5)
    assert.equal(saved.inputChars, DEFAULT_CONFIG.inputChars, '返回给客户端的是归一化后的值')
    const raw = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'))
    assert.equal(raw.inputChars, 999999, '没碰的旧值原样留在文件里')
    assert.equal(raw.enabled, true)
  } finally {
    done()
  }
})

test('非整数、越界的值拒绝落盘，文件保持原样', () => {
  const { root, done } = tempRoot()
  try {
    writeConfig(root, { enabled: false, fragments: 2 })
    const file = join(root, 'config.json')
    const before = readFileSync(file, 'utf8')

    for (const patch of [{ fragments: '3' }, { fragments: 2.5 }, { fragments: 9 }, { inputChars: 1 }]) {
      assert.throws(
        () => savePanelConfig(root, patch),
        (error) => error?.code === 'recall/bad-request',
        JSON.stringify(patch),
      )
      assert.equal(readFileSync(file, 'utf8'), before, '抛出后一个字节都不该写')
    }

    assert.throws(
      () => savePanelConfig(root, { fragments: 4, inputChars: 1 }),
      (error) => error?.code === 'recall/bad-request',
    )
    assert.equal(readFileSync(file, 'utf8'), before, '同一批里后面的坏值也不该留下前一项')
  } finally {
    done()
  }
})

test('近期记忆天数可单独保存，非法值不落盘', () => {
  const { root, done } = tempRoot()
  try {
    writeConfig(root, { fragments: 3, futureKnob: 'keep' })
    assert.equal(savePanelConfig(root, { recentDays: 60 }).recentDays, 60)
    assert.equal(readRawConfig(root).fragments, 3)
    assert.equal(readRawConfig(root).futureKnob, 'keep')
    const before = readFileSync(join(root, 'config.json'), 'utf8')
    for (const value of [0, -1, 3651, 1.5, '30']) {
      assert.throws(() => savePanelConfig(root, { recentDays: value }), /近期记忆天数/)
      assert.equal(readFileSync(join(root, 'config.json'), 'utf8'), before)
    }
  } finally { done() }
})

test('配置缺失或读不懂时，面板读到默认值而不是打不开', () => {
  const { root, done } = tempRoot()
  try {
    assert.deepEqual(readRawConfig(root), {})
    writeFileSync(join(root, 'config.json'), '{not json', 'utf8')
    assert.deepEqual(readRawConfig(root), {})
    assert.deepEqual(panelConfigOf(readRawConfig(root)), panelConfigOf({}))
  } finally {
    done()
  }
})
