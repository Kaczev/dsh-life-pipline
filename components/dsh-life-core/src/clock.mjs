/**
 * WeChat's timestamp rule, shared by every dsh-lpipe- pipeline.
 *
 * The rule is about gaps, not message counts: a burst of messages gets one
 * stamp at its head, and messages that follow quickly get none. What the stamp
 * says depends on how far back it is:
 *
 *   today       12:08
 *   yesterday   昨天 12:08
 *   this week   周二 12:08
 *   this year   11月1日 12:08
 *   older       2025年11月1日 12:08
 */

/** Below this gap a message continues the previous one; no separator. */
export const STAMP_GAP_MS = 5 * 60 * 1000;

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (value) => String(value).padStart(2, '0');

const asDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

function startOfDay(date) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/**
 * How to write one instant, given today. Separate from `stampFor` because the
 * wake pipeline always shows a time (it speaks after a long silence) while the
 * chat pipeline shows one only when the gap justifies it.
 */
export function formatStamp(at, now = Date.now()) {
  const when = asDate(at);
  const today = asDate(now);
  if (!when || !today) return '';
  const time = `${pad(when.getHours())}:${pad(when.getMinutes())}`;
  const days = Math.round((startOfDay(today) - startOfDay(when)) / DAY_MS);
  if (days <= 0) return time;
  if (days === 1) return `昨天 ${time}`;
  if (days < 7) return `${WEEKDAYS[when.getDay()]} ${time}`;
  if (when.getFullYear() === today.getFullYear()) {
    return `${when.getMonth() + 1}月${when.getDate()}日 ${time}`;
  }
  return `${when.getFullYear()}年${when.getMonth() + 1}月${when.getDate()}日 ${time}`;
}

/**
 * The separator line for one message, or '' when it continues the previous one.
 * `previousAt` may be null (nothing before it), in which case the stamp shows.
 */
export function stampFor(at, previousAt = null, now = Date.now()) {
  const when = asDate(at);
  if (!when) return '';
  const previous = previousAt === null || previousAt === undefined ? null : Number(previousAt);
  if (Number.isFinite(previous) && when.getTime() - previous < STAMP_GAP_MS) return '';
  return formatStamp(when, now);
}
