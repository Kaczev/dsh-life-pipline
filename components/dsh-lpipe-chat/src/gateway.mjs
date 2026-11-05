import { randomUUID } from 'node:crypto';
import { stampFor } from 'dsh-life-pipline/clock';

/** First message immediately; later messages coalesce within the window. */
export class InboundGateway {
  #getConfig;
  #log;
  #deliver;
  #buffer = [];
  #timer = null;
  #sending = false;
  #disposed = false;
  // Timestamp of the newest message already spoken for, so a restart does not
  // re-announce a stamp the owner has already seen.
  #lastAt = null;

  constructor({ getConfig, log, deliver, lastAt = null }) {
    this.#getConfig = getConfig;
    this.#log = log;
    this.#deliver = deliver;
    this.#lastAt = Number.isFinite(Number(lastAt)) ? Number(lastAt) : null;
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
      return { head, text: row.text, at: row.at };
    }).reduce((lines, row) => {
      // WeChat shows a time only when the conversation paused; a burst reads as
      // one block. The stamp sits on its own line so the notice keeps its shape.
      const stamp = stampFor(row.at, this.#lastAt);
      if (stamp) lines.push(stamp);
      lines.push(`[${row.head}] ${row.text}`);
      const parsed = Date.parse(row.at);
      if (Number.isFinite(parsed)) this.#lastAt = parsed;
      return lines;
    }, []).join('\n');
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
