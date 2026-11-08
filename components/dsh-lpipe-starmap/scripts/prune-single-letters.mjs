// 只清理单拉丁字母星，不重抽、不改版本、水位或有效星。
// 运行前停用星图写入；默认 dry-run，--apply 才备份并写入。
import { readFileSync, readdirSync, lstatSync, mkdirSync, writeFileSync, renameSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { isSingleLatinStar } from '../src/build.mjs'
import { starmapRoot } from '../src/paths.mjs'

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
export function pruneSingleLetters(root, { apply = false, reject = isSingleLatinStar, backupLabel = 'single-letters' } = {}) {
  root = resolve(root)
  const files = []
  const collect = (dir) => {
    if (lstatSync(dir).isSymbolicLink()) throw Error(`拒绝链接：${dir}`)
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const file = join(dir, name.name)
      if (name.isSymbolicLink()) throw Error(`拒绝链接：${file}`)
      if (name.isDirectory()) collect(file)
      else if (name.name.endsWith('.jsonl')) files.push(file)
    }
  }
  for (let dir = root; ; dir = resolve(dir, '..')) {
    if (lstatSync(dir).isSymbolicLink()) throw Error(`拒绝链接：${dir}`)
    if (resolve(dir, '..') === dir) break
  }
  const starsPath = join(root, 'stars.jsonl')
  if (lstatSync(starsPath).isSymbolicLink()) throw Error(`拒绝链接：${starsPath}`)
  const starsBytes = readFileSync(starsPath)
  const parse = (bytes) => bytes.toString('utf8').split('\n').filter(x => x.trim()).map(JSON.parse)
  const stars = parse(starsBytes)
  const removed = new Set(stars.filter(s => reject(s.name, s)).map(s => s.id))
  const changes = []
  const prepare = (file, before, rows) => {
    const after = Buffer.from(rows.map(x => JSON.stringify(x)).join('\n') + '\n')
    if (!before.equals(after)) changes.push({ file, before, after, sha256: hash(before) })
  }
  if (removed.size) {
    prepare(starsPath, starsBytes, stars.filter(s => !removed.has(s.id)))
    collect(join(root, 'sources'))
    for (const file of files) {
      const before = readFileSync(file)
      let changed = false
      const rows = parse(before).map(record => {
        const lines = (record.lines ?? []).map(line => {
          const ids = (line.stars ?? []).filter(id => !removed.has(id))
          if (ids.length === (line.stars ?? []).length) return line
          changed = true
          return { ...line, stars: ids }
        })
        const pairs = record.pairs?.filter(pair => !pair.some(id => removed.has(id)))
        if (pairs && pairs.length !== record.pairs.length) changed = true
        return { ...record, lines, ...(pairs ? { pairs } : {}) }
      })
      if (changed) prepare(file, before, rows)
    }
  }
  let backup = null
  if (apply && changes.length) {
    backup = join(root, 'maintenance-backups', `${backupLabel}-${new Date().toISOString().replace(/[:.]/g, '-')}`)
    mkdirSync(backup, { recursive: true })
    for (const item of changes) {
      if (hash(readFileSync(item.file)) !== item.sha256) throw Error(`文件已变化：${item.file}`)
      const target = join(backup, relative(root, item.file))
      mkdirSync(resolve(target, '..'), { recursive: true })
      writeFileSync(target, item.before, { flag: 'wx' })
      if (hash(readFileSync(target)) !== item.sha256) throw Error(`备份校验失败：${target}`)
    }
    writeFileSync(join(backup, 'manifest.json'), JSON.stringify(changes.map(x => ({ path: relative(root, x.file), bytes: x.before.length, sha256: x.sha256 })), null, 2))
    for (const item of changes) {
      if (hash(readFileSync(item.file)) !== item.sha256) throw Error(`文件已变化：${item.file}`)
      const temp = `${item.file}.${process.pid}.prune.tmp`
      writeFileSync(temp, item.after, { flag: 'wx' })
      renameSync(temp, item.file)
      if (hash(readFileSync(item.file)) !== hash(item.after)) throw Error(`写入校验失败：${item.file}`)
    }
  }
  return { removed: stars.filter(s => removed.has(s.id)).map(s => ({ id: s.id, name: s.name })), changedFiles: changes.length, applied: apply, backup }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(pruneSingleLetters(starmapRoot(), { apply: process.argv.includes('--apply') }), null, 2))
}
