import { randomUUID } from 'node:crypto';

/**
 * The "兜": the first message of a burst goes in immediately, everything that
 * arrives within the next window is collected and handed over in one piece.
 * Injection uses followup semantics, so it lands after the running turn instead
 * of cutting into it.
 */
export class InboundGateway {
  #getConfig;
  #log;
  #prompt;
  #buffer = [];
  #timer = null;
  #sending = false;

  constructor({ getConfig, log, prompt }) {
    this.#getConfig = getConfig;
    this.#log = log;
    this.#prompt = prompt;
  }

  accept(event) {
    this.#buffer.push(event);
    if (this.#timer) return;
    const { windowSeconds } = this.#getConfig();
    const windowMs = Math.min(120, Math.max(3, Number(windowSeconds) || 5)) * 1000;
    void this.#flush('immediate');
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#flush('window').finally(() => {
        if (this.#buffer.length > 0) this.accept(this.#buffer.splice(0)[0]);
      });
    }, windowMs);
  }

  get pending() {
    return this.#buffer.length;
  }

  async #flush(reason) {
    if (this.#sending || this.#buffer.length === 0) return;
    const { mainSessionId } = this.#getConfig();
    if (!mainSessionId) {
      this.#log.warn?.('[life-chat] main session is not configured yet; messages are held in memory');
      return;
    }
    const batch = this.#buffer.splice(0, this.#buffer.length);
    this.#sending = true;
    try {
      const text = this.#render(batch);
      await this.#prompt({
        sessionId: mainSessionId,
        requestId: randomUUID(),
        mode: 'queue',
        content: [{ type: 'text', text }],
      }, { kind: 'im', channels: batch.map((row) => row.channel), reason });
    } catch (error) {
      // Put the batch back at the front so nothing is lost when injection fails.
      this.#buffer.unshift(...batch);
      this.#log.warn?.(`[life-chat] injection failed: ${error?.message ?? error}`);
    } finally {
      this.#sending = false;
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
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#buffer = [];
  }
}

function shortId(value) {
  const text = String(value ?? '');
  return text.length > 8 ? text.slice(-6) : text;
}
