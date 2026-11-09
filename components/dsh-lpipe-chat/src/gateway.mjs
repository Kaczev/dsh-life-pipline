import { inboundHead } from './identity.mjs';
import { randomUUID } from 'node:crypto';
import { stampFor } from 'dsh-life-core/clock';
import { MAX_IMAGES_PER_MESSAGE } from './images.mjs';
import { messageBody, outputLimit, utf8Head } from './content.mjs';

/**
 * Two holders in front of one notice.
 *
 * The small one waits for quiet: every message moves the deadline back, so a
 * burst of quick messages becomes one notice. The big one starts after a
 * notice goes out and collects whatever follows, so a long run is delivered in
 * as few notices as possible. Both are decided by comparing the clock with a
 * deadline, never by counting down.
 */
export class InboundGateway {
  #getConfig;
  #log;
  #deliver;
  #saveImages;
  #buffer = [];
  #timer = null;
  // Absolute instants, compared against the clock rather than counted down,
  // so a timer that fires early or late cannot drift.
  #quietUntil = 0;
  #windowUntil = 0;
  #sending = false;
  #disposed = false;
  // Timestamp of the newest message already spoken for, so a restart does not
  // re-announce a stamp the owner has already seen.
  #lastAt = null;
  #origins = [];
  #imageOrigins = [];

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
    return Math.min(60, Math.max(0.2, Number(quietSeconds) || 8)) * 1000;
  }

  #windowMs() {
    const { windowSeconds } = this.#getConfig();
    return Math.min(120, Math.max(3, Number(windowSeconds) || 14)) * 1000;
  }

  /** Both deadlines must pass: the burst is closed and the window is over. */
  #dueAt() {
    return Math.max(this.#quietUntil, this.#windowUntil);
  }

  /** The timer is only a wake-up call; the clock decides whether to flush. */
  #schedule() {
    if (this.#disposed || this.#timer) return;
    const wait = Math.max(0, this.#dueAt() - Date.now());
    this.#timer = setTimeout(() => {
      this.#timer = null;
      if (this.#disposed) return;
      if (Date.now() < this.#dueAt()) {
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
      const budget = outputLimit(this.#getConfig());
      let shown = batch.slice();
      const baseline = this.#lastAt;
      let body;
      do {
        this.#lastAt = baseline;
        body = this.#render(shown);
        if (Buffer.byteLength(body) <= budget - 512 || shown.length <= 1) break;
        shown.shift();
      } while (shown.length);
      const omitted = batch.length - shown.length;
      const prefix = omitted ? `〔前面 ${omitted} 条未展示；用 chat_history 查看〕\n` : '';
      const tail = `\n〔正文未完；用 chat_history(messageId="${shown[0]?.id || shown[0]?.messageId || ''}") 续读〕`;
      const visibleBody = Buffer.byteLength(body) > budget - 512 ? utf8Head(body, budget - 512 - Buffer.byteLength(tail)) : body;
       body = visibleBody + (visibleBody.length < body.length ? tail : '');
      const { refs, note } = await this.#persistImages(shown);
      body = prefix + body;
      const publish = (extra, images) => {
        const text = utf8Head([body, note, extra].filter(Boolean).join('\n'), budget);
        const content = [{ type: 'text', text }];
        for (const ref of images) content.push({ type: 'image', attachment: ref });
        return Object.freeze({
          id: randomUUID(),
          role: 'user',
          content: Object.freeze(content.map((part) => Object.freeze(part))),
          source: Object.freeze({
            kind: 'dsh-lpipe-chat', form: 'notice',
            summary: `微信 / QQ 入站消息 · ${batch.length} 条`, channels,
             recallOrigins: Object.freeze(this.#origins.filter(s => s.start < visibleBody.length).map(s => Object.freeze({ ...s, start: s.start + prefix.length, end: Math.min(s.end, visibleBody.length) + prefix.length }))),
             recallImages: Object.freeze(this.#imageOrigins.slice(0, images.length).map(origin => Object.freeze(origin))),
          }),
        });
      };
      try {
        await this.#deliver({ sessionId: mainSessionId, message: publish('', refs) });
        // The big holder opens only once a notice has actually gone out.
        this.#windowUntil = Date.now() + this.#windowMs();
      } catch (error) {
        // A model without vision rejects the whole request. The words still
        // matter, so the pictures are what gets dropped, once.
        if (refs.length === 0) throw error;
        const reason = String(error?.message ?? error).split('\n')[0];
        this.#log.warn?.(`[life-chat] notice with images refused: ${reason}`);
        const extra = `（图片没能随这条消息进入：${reason}）`;
        await this.#deliver({ sessionId: mainSessionId, message: publish(extra, []) });
        this.#windowUntil = Date.now() + this.#windowMs();
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
    this.#imageOrigins = [];
    let imageBytes = 0; let omitted = 0;
    for (const row of batch) {
      for (const image of row.images ?? []) {
        const size = image.data?.byteLength ?? 0;
        if (wanted.length >= MAX_IMAGES_PER_MESSAGE || imageBytes + size > 16 * 1024 * 1024) { omitted++; continue; }
        imageBytes += size;
        wanted.push(image);
        this.#imageOrigins.push({ channel: row.channel, senderName: row.senderName || '', senderId: row.senderId || '', conversationKind: row.conversationKind, conversationId: row.conversationId || '' });
      }
    }
    const omittedNote = omitted ? `（另有 ${omitted} 张图片超过本批 4 张／16MB 预算，未附加。）` : '';
    if (wanted.length === 0) return { refs: [], note: omittedNote };
    if (typeof this.#saveImages !== 'function') {
      return { refs: [], note: `（有 ${wanted.length} 张图片，但这个宿主没有附件服务，看图看不到。）` };
    }
    try {
      const refs = await this.#saveImages(wanted.map((image) => ({
        data: image.data,
        mediaType: image.mediaType,
        name: image.name,
      })));
      return { refs: Array.isArray(refs) ? refs : [], note: omittedNote };
    } catch (error) {
      const reason = String(error?.message ?? error).split('\n')[0];
      this.#log.warn?.(`[life-chat] inbound image refused: ${reason}`);
      return { refs: [], note: `（${wanted.length} 张图片没能取过来：${reason}）` };
    }
  }

  #render(batch) {
    this.#origins = [];
    const config = this.#getConfig();
    return batch.map((row) => {
      const { head, ownerMatch } = inboundHead(row, config);
      return { head, ownerMatch, text: messageBody(row), at: row.at, images: row.images ?? [] };
    }).reduce((lines, row) => {
      // WeChat shows a time only when the conversation paused; a burst reads as
      // one block. The stamp sits on its own line so the notice keeps its shape.
      const stamp = stampFor(row.at, this.#lastAt);
      if (stamp) lines.push(stamp);
      const count = row.images?.length ?? 0;
      // The pictures travel as image parts; the line still has to read like a
      // message when there are no words around them.
      const body = row.text || (count > 0 ? `（${count} 张图片）` : '');
      const start = lines.join('\n').length + (lines.length ? 1 : 0) + `${row.ownerMatch ? '(Owner)' : ''}[${row.head}] `.length;
       lines.push(`${row.ownerMatch ? '(Owner)' : ''}[${row.head}] ${body}`);
       const original = batch[this.#origins.length];
       this.#origins.push({ start, end: lines.join('\n').length, channel: original.channel, senderName: original.senderName || '', senderId: original.senderId || '', conversationKind: original.conversationKind, conversationId: original.conversationId || '' });
      const parsed = Date.parse(row.at);
      if (Number.isFinite(parsed)) this.#lastAt = parsed;
      return lines;
    }, []).join('\n');
  }

  dispose() {
    this.#disposed = true;
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = null;
    this.#buffer = [];
  }
}
