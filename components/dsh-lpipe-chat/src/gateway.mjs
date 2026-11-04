import { randomUUID } from 'node:crypto';

/** First message immediately; later messages coalesce within the window. */
export class InboundGateway {
  #getConfig;
  #log;
  #deliver;
  #buffer = [];
  #timer = null;
  #sending = false;
  #disposed = false;

  constructor({ getConfig, log, deliver }) {
    this.#getConfig = getConfig;
    this.#log = log;
    this.#deliver = deliver;
  }

  accept(event) {
    if (this.#disposed) return;
    this.#buffer.push(event);
    if (this.#timer || this.#sending) return;
    void this.#flush();
    this.#schedule();
  }

  #schedule() {
    if (this.#disposed || this.#timer) return;
    const { windowSeconds } = this.#getConfig();
    const windowMs = Math.min(120, Math.max(3, Number(windowSeconds) || 5)) * 1000;
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#flush();
    }, windowMs);
  }

  get pending() { return this.#buffer.length; }

  async #flush() {
    if (this.#disposed || this.#sending || this.#buffer.length === 0) return;
    const { mainSessionId } = this.#getConfig();
    if (!mainSessionId) {
      this.#log.warn?.('[life-chat] main session is not configured yet; messages are held in memory');
      this.#schedule();
      return;
    }
    const batch = this.#buffer.splice(0);
    this.#sending = true;
    try {
      // Public UserMessage contract: notice provenance, not human prompt input
      // and not a fabricated tool result. Freeze before publication.
      const channels = Object.freeze([...new Set(batch.map((row) => row.channel))]);
      const message = Object.freeze({
        id: randomUUID(),
        role: 'user',
        content: Object.freeze([Object.freeze({ type: 'text', text: this.#render(batch) })]),
        source: Object.freeze({
          kind: 'dsh-lpipe-chat', form: 'notice',
          summary: `微信 / QQ 入站消息 · ${batch.length} 条`, channels,
        }),
      });
      await this.#deliver({ sessionId: mainSessionId, message });
    } catch (error) {
      if (!this.#disposed) {
        this.#buffer.unshift(...batch);
        this.#log.warn?.(`[life-chat] injection failed: ${error?.message ?? error}`);
      }
    } finally {
      this.#sending = false;
      if (this.#buffer.length > 0) this.#schedule();
    }
  }

  #render(batch) {
    const { ownerName } = this.#getConfig();
    return batch.map((row) => {
      const who = row.senderName
        || (row.senderId && ownerName && row.senderId === this.#ownerId(row.channel) ? ownerName : '')
        || shortId(row.senderId);
      const head = row.conversationKind === 'group'
        ? `${row.channelLabel} · ${shortId(row.conversationId)} · ${who}`
        : `${row.channelLabel} · ${who}`;
      return `[${head}] ${row.text}`;
    }).join('\n');
  }

  #ownerId(channel) {
    const config = this.#getConfig();
    if (channel === 'weixin') return config.weixin?.ownerUserId ?? '';
    if (channel === 'qq') return config.qq?.ownerOpenId ?? '';
    return '';
  }

  dispose() {
    this.#disposed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#buffer = [];
  }
}

function shortId(value) {
  const text = String(value ?? '');
  return text.length > 8 ? text.slice(-6) : text;
}
