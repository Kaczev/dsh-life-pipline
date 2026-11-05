import { randomUUID } from 'node:crypto';
import { stampFor } from 'dsh-life-pipline/clock';
import { MAX_IMAGES_PER_MESSAGE } from './images.mjs';

/**
 * Debounced inbound notices: a burst is held until the owner stops sending.
 * Every new message restarts the quiet count, so one notice carries the whole
 * burst instead of one notice per message.
 */
export class InboundGateway {
  #getConfig;
  #log;
  #deliver;
  #saveImages;
  #buffer = [];
  #timer = null;
  // Absolute instant the burst goes quiet, compared against the clock rather
  // than counted down, so a timer that fires early or late cannot drift.
  #quietUntil = 0;
  #sending = false;
  #disposed = false;
  // Timestamp of the newest message already spoken for, so a restart does not
  // re-announce a stamp the owner has already seen.
  #lastAt = null;

  constructor({ getConfig, log, deliver, saveImages = null, lastAt = null }) {
    this.#getConfig = getConfig;
    this.#log = log;
    this.#deliver = deliver;
    this.#saveImages = saveImages;
    this.#lastAt = Number.isFinite(Number(lastAt)) ? Number(lastAt) : null;
  }

  accept(event) {
    if (this.#disposed) return;
    this.#buffer.push(event);
    // Every message moves the deadline: the burst ends only once nothing new
    // has arrived for the whole quiet period.
    this.#quietUntil = Date.now() + this.#quietMs();
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
    // A delivery in flight reschedules itself once it finishes.
    if (this.#sending) return;
    this.#schedule();
  }

  #quietMs() {
    const { quietSeconds } = this.#getConfig();
    return Math.min(60, Math.max(0.2, Number(quietSeconds) || 1)) * 1000;
  }

  /** The timer is only a wake-up call; the clock decides whether to flush. */
  #schedule() {
    if (this.#disposed || this.#timer) return;
    const wait = Math.max(0, this.#quietUntil - Date.now());
    this.#timer = setTimeout(() => {
      this.#timer = null;
      if (this.#disposed) return;
      if (Date.now() < this.#quietUntil) {
        this.#schedule();
        return;
      }
      void this.#flush();
    }, wait);
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
      const { refs, note } = await this.#persistImages(batch);
      // Rendered once: the stamp baseline moves as it is rendered.
      const body = this.#render(batch);
      const publish = (extra, images) => {
        const text = [body, note, extra].filter(Boolean).join('\n');
        const content = [{ type: 'text', text }];
        for (const ref of images) content.push({ type: 'image', attachment: ref });
        return Object.freeze({
          id: randomUUID(),
          role: 'user',
          content: Object.freeze(content.map((part) => Object.freeze(part))),
          source: Object.freeze({
            kind: 'dsh-lpipe-chat', form: 'notice',
            summary: `微信 / QQ 入站消息 · ${batch.length} 条`, channels,
          }),
        });
      };
      try {
        await this.#deliver({ sessionId: mainSessionId, message: publish('', refs) });
      } catch (error) {
        // A model without vision rejects the whole request. The words still
        // matter, so the pictures are what gets dropped, once.
        if (refs.length === 0) throw error;
        const reason = String(error?.message ?? error).split('\n')[0];
        this.#log.warn?.(`[life-chat] notice with images refused: ${reason}`);
        const extra = `（图片没能随这条消息进入：${reason}）`;
        await this.#deliver({ sessionId: mainSessionId, message: publish(extra, []) });
      }
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

  /**
   * Turn the pictures in this batch into durable attachments. A batch is one
   * message, so the cap applies across all of it, not per channel message.
   * Failing to store them never blocks the words around them.
   */
  async #persistImages(batch) {
    const wanted = [];
    for (const row of batch) {
      for (const image of row.images ?? []) {
        if (wanted.length >= MAX_IMAGES_PER_MESSAGE) break;
        wanted.push(image);
      }
    }
    if (wanted.length === 0) return { refs: [], note: '' };
    if (typeof this.#saveImages !== 'function') {
      return { refs: [], note: `（有 ${wanted.length} 张图片，但这个宿主没有附件服务，看图看不到。）` };
    }
    try {
      const refs = await this.#saveImages(wanted.map((image) => ({
        data: image.data,
        mediaType: image.mediaType,
        name: image.name,
      })));
      return { refs: Array.isArray(refs) ? refs : [], note: '' };
    } catch (error) {
      const reason = String(error?.message ?? error).split('\n')[0];
      this.#log.warn?.(`[life-chat] inbound image refused: ${reason}`);
      return { refs: [], note: `（${wanted.length} 张图片没能取过来：${reason}）` };
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
      return { head, text: row.text, at: row.at, images: row.images ?? [] };
    }).reduce((lines, row) => {
      // WeChat shows a time only when the conversation paused; a burst reads as
      // one block. The stamp sits on its own line so the notice keeps its shape.
      const stamp = stampFor(row.at, this.#lastAt);
      if (stamp) lines.push(stamp);
      const count = row.images?.length ?? 0;
      // The pictures travel as image parts; the line still has to read like a
      // message when there are no words around them.
      const body = row.text || (count > 0 ? `（${count} 张图片）` : '');
      lines.push(`[${row.head}] ${body}`);
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
