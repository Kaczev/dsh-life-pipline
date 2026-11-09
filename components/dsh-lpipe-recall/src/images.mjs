import { createHash } from 'node:crypto'
import { eligibleMessage, sourceLabel } from './provenance.mjs'

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])

/** Stable, fragment-local image references; metadata only, never reads media bytes. */
export function imagesOfRows(rows) {
  const images = new Map()
  for (const row of rows) {
    if (!eligibleMessage(row)) continue
    for (const [partIndex, part] of (row.parts ?? []).entries()) {
      if (part?.type !== 'image' && part?.type !== 'file') continue
      const mediaType = part.mediaType ?? part.attachment?.mediaType
      if (!IMAGE_TYPES.has(mediaType) || !/^[a-f0-9]{64}$/.test(part.sha256 ?? '')) continue
      if (!images.has(part.sha256)) images.set(part.sha256, {
        id: part.sha256, seq: row.seq, turn: row.turn, kind: row.kind, at: row.at, source: sourceLabel(row, row.source?.recallImages?.[partIndex]),
        mediaType, bytes: part.bytes ?? part.attachment?.bytes,
      })
    }
  }
  return [...images.values()]
}

export function imageListing(images, limit = 24) {
  if (!images.length) return ''
  const lines = images.slice(0, limit).map((image) =>
    `图片 ${image.id}｜记忆行 ${image.seq}｜${image.source}｜${image.mediaType}`)
  if (images.length > limit) lines.push(`…另有 ${images.length - limit} 张；用 recall_open 的 imagesOffset 翻页。`)
  return [`含 ${images.length} 张图片（仅引用，未加载；用 recall_image 按需查看）：`, ...lines].join('\n')
}

export async function loadRecallImage({ reader, attachments, rows, image }) {
  const found = imagesOfRows(rows).find((entry) => entry.id === image)
  if (!found) throw new Error('image does not belong to the requested fragment')
  const data = reader.media(found.seq, found.id)
  if (!data) throw new Error('image bytes are missing from the memory media pack')
  if (createHash('sha256').update(data).digest('hex') !== found.id) throw new Error('memory image checksum mismatch')
  if (!attachments?.saveImage) throw new Error('image attachment service is unavailable')
  const attachment = await attachments.saveImage({ data, mediaType: found.mediaType })
  return attachment
}

export function imageReferences(images, { limit = Infinity, continuation = '' } = {}) {
  if (!images.length) return ''
  return '〔图片 ' + images.length + ' 张〕' + images.slice(0, limit).map(image => '（' + image.id + '）').join('|') + (images.length > limit ? continuation : '')
}
