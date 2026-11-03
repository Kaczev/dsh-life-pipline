/**
 * Inbound timestamps arrive as numbers (WeChat ms), numeric strings, or ISO
 * text depending on the platform. Never let an unparsable value become
 * `Invalid Date` inside the archive.
 */
export function toIso(value) {
  if (value === null || value === undefined || value === '') return new Date().toISOString();
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString();
  const text = String(value).trim();
  if (/^\d+$/.test(text)) {
    const ms = Number(text);
    return new Date(ms < 1e12 ? ms * 1000 : ms).toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}
