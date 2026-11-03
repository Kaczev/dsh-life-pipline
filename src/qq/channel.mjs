import { randomUUID } from 'node:crypto';
import { QQBot } from '@tencent-connect/qqbot-nodejs';
import { startQrConnect } from '@tencent-connect/qqbot-connector';

/**
 * The QQ half of the channel layer: QQ Open Platform bot through the official
 * SDK. Scan-to-connect is delegated to the connector package.
 */
export class QqChannel {
  #config;
  #log;
  #onInbound;
  #bot = null;
  #login = null;
  #status = { connected: false, appId: '', lastError: '' };

  constructor({ config, onInbound, log }) {
    this.#config = config;
    this.#log = log;
    this.#onInbound = onInbound;
  }

  get status() {
    return { ...this.#status, channel: 'qq' };
  }

  get configured() {
    const qq = this.#config().qq ?? {};
    return Boolean(qq.appId && qq.appSecret);
  }

  async connect() {
    if (!this.configured) return false;
    if (this.#bot) return true;
    const qq = this.#config().qq;
    const bot = new QQBot({ appId: qq.appId, appSecret: qq.appSecret });
    bot.on('ready', () => {
      this.#status = { ...this.#status, connected: true, appId: qq.appId };
    });
    bot.on('error', (error) => {
      this.#log.warn?.(`[life-chat] qq error: ${error?.message ?? error}`);
      this.#status = { ...this.#status, lastError: String(error?.message ?? error) };
    });
    bot.on('message', (_ctx, message) => {
      try {
        this.#accept(message);
      } catch (error) {
        this.#log.warn?.(`[life-chat] qq inbound failed: ${error?.message ?? error}`);
      }
    });
    this.#bot = bot;
    this.#status = { ...this.#status, appId: qq.appId, lastError: '' };
    await bot.start();
    return true;
  }

  #accept(message) {
    if (!message) return;
    const text = String(message.content ?? '').trim();
    const senderId = String(message.senderId ?? '').trim();
    if (!text || !senderId || message.senderIsBot) return;
    const qq = this.#config().qq ?? {};
    const group = message.kind === 'group';
    // Only the owner gets through. Groups stay closed unless the owner speaks there.
    if (this.#config().ownerOnly && qq.ownerOpenId && senderId !== qq.ownerOpenId) return;
    const conversationId = group
      ? String(message.groupOpenid ?? message.channelId ?? senderId)
      : senderId;
    this.#onInbound({
      channel: 'qq',
      channelLabel: 'QQ',
      conversationKind: group ? 'group' : 'dm',
      conversationId,
      senderId,
      senderName: String(message.senderName ?? ''),
      text,
      at: new Date(message.timestamp ?? Date.now()).toISOString(),
      messageId: String(message.messageId ?? ''),
      replyTarget: {
        scope: group ? 'group' : 'c2c',
        targetId: conversationId,
        msgId: String(message.messageId ?? '') || undefined,
      },
    });
  }

  async sendText(text, { scope = 'c2c', targetId, msgId } = {}) {
    const bot = this.#bot;
    if (!bot) throw new Error('QQ is not connected yet');
    const qq = this.#config().qq ?? {};
    const target = targetId || qq.ownerOpenId;
    if (!target) throw new Error('QQ has no target: set the owner openid on the config page');
    const sent = await bot.sendText({ scope, targetId: target, ...(msgId ? { msgId } : {}) }, String(text));
    return { messageId: sent?.id ?? '', scope, targetId: target };
  }

  /** Show the QQ mobile scan-to-connect flow; resolves with the QR URL. */
  startLogin() {
    if (this.#login) throw new Error('a QQ login attempt is already running');
    const attempt = {
      id: randomUUID(),
      qrUrl: '',
      state: 'pending',
      error: '',
      credentials: null,
    };
    this.#login = attempt;
    const stop = startQrConnect({
      onQrDisplayed: (url) => {
        attempt.qrUrl = String(url ?? '');
      },
      onQrExpired: () => {
        attempt.state = 'expired';
        attempt.error = '二维码已过期，请重新生成。';
      },
      onFailure: (error) => {
        attempt.state = 'failed';
        attempt.error = String(error?.message ?? error);
        attempt.stop = null;
      },
      onSuccess: (credentials) => {
        const first = Array.isArray(credentials) ? credentials[0] : credentials;
        if (!first?.appId || !first?.appSecret) {
          attempt.state = 'failed';
          attempt.error = '扫码成功，但没有拿到 AppID/AppSecret。';
          return;
        }
        attempt.state = 'connected';
        attempt.credentials = { appId: first.appId, appSecret: first.appSecret };
      },
    }, { displayQrCodeToConsole: false, source: 'dsh-life-chat' });
    attempt.stop = stop;
    return { attemptId: attempt.id, expiresAt: Date.now() + 5 * 60_000 };
  }

  loginState() {
    const attempt = this.#login;
    if (!attempt) return null;
    const snapshot = {
      attemptId: attempt.id,
      state: attempt.state,
      qrUrl: attempt.qrUrl,
      error: attempt.error,
    };
    if (attempt.state === 'connected') {
      this.#login = null;
      snapshot.credentials = attempt.credentials;
    } else if (['failed', 'expired', 'cancelled'].includes(attempt.state)) {
      this.#login = null;
    }
    return snapshot;
  }

  cancelLogin() {
    const attempt = this.#login;
    if (!attempt) return false;
    try {
      attempt.stop?.();
    } catch {
      // The connector may already have disposed itself.
    }
    if (attempt.state !== 'connected') attempt.state = 'cancelled';
    this.#login = null;
    return true;
  }

  async stop() {
    this.cancelLogin();
    const bot = this.#bot;
    this.#bot = null;
    this.#status = { ...this.#status, connected: false };
    if (bot?.stop) {
      try {
        await bot.stop();
      } catch {
        // Already stopped.
      }
    }
  }
}
