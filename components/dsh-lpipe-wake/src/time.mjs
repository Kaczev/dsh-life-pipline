const SCALES = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** Positive durations: bare minutes, single units, or compounds such as 3h30m. */
export function parseDuration(text) {
  const value = String(text ?? '').trim().toLowerCase();
  if (!value) return null;
  let total = 0;
  if (/^\d+(?:\.\d+)?$/.test(value)) total = Number(value) * SCALES.m;
  else {
    const token = /(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)/gy;
    let position = 0;
    while (position < value.length) {
      token.lastIndex = position;
      const match = token.exec(value);
      if (!match) return null;
      total += Number(match[1]) * SCALES[match[2]];
      position = token.lastIndex;
      while (/\s/.test(value[position] ?? '') && position < value.length) position++;
    }
  }
  const ms = Math.round(total);
  return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
}

function validParts(year, month, day, hour, minute, second) {
  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function localDate(year, month, day, hour, minute, second, ms = 0) {
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, second, ms);
  // Reject impossible local times (including DST gaps), rather than normalize.
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day
    || date.getHours() !== hour || date.getMinutes() !== minute || date.getSeconds() !== second) return null;
  return date.getTime();
}

/** Strict future instant. Unqualified dates and clocks use the computer's timezone. */
export function parseWakeTime(text, now = Date.now()) {
  const value = String(text ?? '').trim();
  if (!Number.isFinite(now)) return null;
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (clock) {
    const [, h, m, s = '0'] = clock;
    const hour = Number(h), minute = Number(m), second = Number(s);
    if (!validParts(2000, 1, 1, hour, minute, second)) return null;
    const date = new Date(now);
    let at = localDate(date.getFullYear(), date.getMonth() + 1, date.getDate(), hour, minute, second);
    if (at === null) return null;
    if (at <= now) {
      date.setDate(date.getDate() + 1);
      at = localDate(date.getFullYear(), date.getMonth() + 1, date.getDate(), hour, minute, second);
    }
    return at !== null && at > now ? at : null;
  }
  const full = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (!full) return null;
  const [, y, mo, d, h, mi, s = '0', fraction = '', zone] = full;
  const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, s].map(Number);
  if (!validParts(year, month, day, hour, minute, second)) return null;
  const ms = Number(fraction.padEnd(3, '0').slice(0, 3));
  let at;
  if (!zone) at = localDate(year, month, day, hour, minute, second, ms);
  else {
    let offset = 0;
    if (zone !== 'Z') {
      const digits = zone.slice(1).replace(':', '');
      const hours = Number(digits.slice(0, 2)), minutes = Number(digits.slice(2));
      if (hours > 23 || minutes > 59) return null;
      offset = (hours * 60 + minutes) * 60_000 * (zone[0] === '+' ? 1 : -1);
    }
    const utc = new Date(0);
    utc.setUTCFullYear(year, month - 1, day);
    utc.setUTCHours(hour, minute, second, ms);
    at = utc.getTime() - offset;
  }
  return at !== null && Number.isFinite(at) && at > now ? at : null;
}
