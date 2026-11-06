// 抽星：一句话里有哪些概念。
//
// 前四层零猜测：反引号里的代码/路径/包名、书名号与引号里的专名、全大写缩写、驼峰、
// 英文与版本号序列。第五层是词表里的中文词（由 lexicon.mjs 从原文里长出来）。

import { cjkRuns, matchWords } from './lexicon.mjs'

/** 英文功能词：出现在句子里也不当成概念。 */
const EN_STOP = new Set(
  (
    'the a an and or but if then else for of to in on at by with from as is are was were be been being ' +
    'it its this that these those i you he she we they me my your our their his her them us ' +
    'do does did done have has had not no yes ok okay so such than too very can could will would should ' +
    'may might must shall about into over under again just only own same other more most some any all ' +
    'here there when where why how what which who whom whose out up down off now new old ' +
    'e g eg ie etc vs via per via'
  ).split(/\s+/),
)

const EDGE = /^[\s`'"“”‘’《》〈〉「」『』【】()（）\[\]<>.,;:!?。，、；：！？…·—–\-]+|[\s`'"“”‘’《》〈〉「」『』【】()（）\[\]<>.,;:!?。，、；：！？…·—–\-]+$/g

/** 同一个名字永远同一个写法：全角转半角、去首尾标点、英文小写、路径只留最后两段。 */
export function normalizeName(raw) {
  let name = String(raw ?? '').normalize('NFKC')
  name = name.replace(EDGE, '')
  name = name.replace(/\s+/g, ' ').trim()
  if (name.includes('/') && !name.includes(' ')) {
    const segments = name.split('/').filter(Boolean)
    if (segments.length > 2) name = segments.slice(-2).join('/')
  }
  if (name.includes('\\') && !name.includes(' ')) {
    const segments = name.split('\\').filter(Boolean)
    if (segments.length > 2) name = segments.slice(-2).join('\\')
  }
  if (/^[A-Za-z]/.test(name)) name = name.toLowerCase()
  return name.replace(EDGE, '')
}

function isStarName(name) {
  if (!name || name.length > 64) return false
  if (!/[\p{L}\p{N}]/u.test(name)) return false
  if (/^\d+$/.test(name)) return false
  if (/^[a-z]+$/.test(name) && EN_STOP.has(name)) return false
  if (EN_STOP.has(name)) return false
  if (name.length === 1 && !/[\u4e00-\u9fff]/.test(name)) return false
  return true
}

function codeCandidate(inner) {
  const trimmed = inner.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('-')) return null
  const first = trimmed.split(/\s+/)[0]
  if (!first || first.length > 64) return null
  return first
}

/**
 * 抽出一句话里的星（已规范化、去重、保持出现顺序）。
 * @param {string} text
 * @param {{ buckets: Map<number, Set<string>>, longest: number }} matcher
 * @param {{ extra?: string[] }} [options]
 */
export function extractStars(text, matcher, options = {}) {
  const source = String(text ?? '')
  const names = []
  const add = (raw) => {
    const name = normalizeName(raw)
    if (!isStarName(name)) return
    if (!names.includes(name)) names.push(name)
  }

  // 第一层：反引号里的代码、路径、包名、命令
  for (const match of source.matchAll(/`([^`\n]{1,80})`/g)) {
    const candidate = codeCandidate(match[1])
    if (candidate) add(candidate)
  }

  // 第三层：书名号、引号、全大写缩写、驼峰
  for (const match of source.matchAll(/《([^》]{1,40})》/g)) add(match[1])
  for (const match of source.matchAll(/“([^”]{1,40})”/g)) add(match[1])
  for (const match of source.matchAll(/「([^」]{1,40})」/g)) add(match[1])
  for (const match of source.matchAll(/\b[A-Z][A-Z0-9]*(?:[-_][A-Z0-9]+)*\b/g)) add(match[0])
  for (const match of source.matchAll(/\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/g)) add(match[0])

  // 第四层：英文与数字专名、版本号
  for (const match of source.matchAll(/\b[A-Za-z][A-Za-z0-9]*(?:[._-][A-Za-z0-9]+)*\b/g)) add(match[0])
  for (const match of source.matchAll(/\b\d+\.\d+(?:[.-][A-Za-z0-9]+)+\b/g)) add(match[0])

  // 第五层：词表里的中文词，最长优先
  if (matcher) {
    for (const run of cjkRuns(source)) {
      for (const word of matchWords(run, matcher)) add(word)
    }
  }

  for (const raw of options.extra ?? []) add(raw)
  return names
}
