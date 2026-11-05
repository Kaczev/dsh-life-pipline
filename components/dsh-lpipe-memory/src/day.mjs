// 天界：凌晨 4 点换天，按本地时间算。
export const DAY_BOUNDARY_HOURS = 4

/**
 * `at` 落在哪一天。先把时间往回拨 4 小时，再取本地日期——
 * 于是 04:00 到次日 03:59 之间发生的一切都归到同一天。
 */
export function dayOf(at) {
  if (!Number.isFinite(at)) throw new TypeError('dayOf 需要一个毫秒时间戳')
  const shifted = new Date(at - DAY_BOUNDARY_HOURS * 3600_000)
  const year = shifted.getFullYear()
  const month = String(shifted.getMonth() + 1).padStart(2, '0')
  const day = String(shifted.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
