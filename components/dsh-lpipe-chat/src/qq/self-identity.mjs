// Per-connection identity cache. Only official responses can identify this bot.
const SUCCESS_MS = 60 * 60_000;
const FAILURE_MS = 60_000;
export class QqSelfIdentity {
  #bot;
  #now;
  #entries = new Map();
  #closed = false;
  #name = '';
  #onName;
  constructor(bot, now = Date.now, { name = '', onName = () => {} } = {}) { this.#bot = bot; this.#now = now; this.#name = name; this.#onName = onName; }
  get name() { return this.#closed ? '' : this.#name; }
  close() { this.#closed = true; this.#entries.clear(); this.#name = ''; }
  async #get(path) {
    if (this.#closed || !this.#bot.api?.get) return null;
    const cached = this.#entries.get(path);
    if (cached && cached.until > this.#now()) return cached.promise;
    const entry = { until: Infinity, promise: null };
    entry.promise = (async () => {
      let timer;
      try {
        const value = await Promise.race([
          Promise.resolve().then(() => this.#bot.api.get(path)),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('QQ identity timeout')), 5000); }),
        ]);
        entry.until = this.#now() + SUCCESS_MS;
        return this.#closed ? null : value;
      } catch {
        entry.until = this.#now() + FAILURE_MS;
        return null;
      } finally { clearTimeout(timer); }
    })();
    this.#entries.set(path, entry);
    while (this.#entries.size > 256) this.#entries.delete(this.#entries.keys().next().value);
    return entry.promise;
  }
  async loadName() {
    const me = await this.#get('/users/@me');
    if (!this.#closed && typeof me?.username === 'string' && me.username.trim() && me.username.trim() !== this.#name) {
      this.#name = me.username.trim();
      this.#onName(this.#name);
    }
    return this.name;
  }
  async forGroup(groupId) {
    if (!groupId) return null;
    const [name, state] = await Promise.all([
      this.loadName(), this.#get(`/v2/groups/${encodeURIComponent(groupId)}/bot_state`),
    ]);
    const memberOpenId = typeof state?.member_openid === 'string' ? state.member_openid.trim() : '';
    return !this.#closed && name && memberOpenId ? { name, memberOpenId } : null;
  }
}

export function qqAccountGuidance(name) {
  return name ? `Your QQ bot account is named ${JSON.stringify(name)}. In QQ group messages, mentions of this bot are displayed as @${name}.` : '';
}

export function displaySelfMentions(text, identity) {
  if (!identity?.name || !identity.memberOpenId) return text;
  return String(text).replace(/<@!?([^<>\s]+)>/g, (raw, id) => id === identity.memberOpenId ? `@${identity.name}` : raw);
}
