import { randomUUID } from 'node:crypto';
import { QQBot } from '@tencent-connect/qqbot-nodejs';
import { startQrConnect } from '@tencent-connect/qqbot-connector';

import { toIso } from '../time.mjs';

const TERMINAL = new Set(['connected', 'failed', 'expired', 'cancelled']);

/**
 * The SDK's `start()` can wait forever when the socket never comes up, so
 * readiness has its own deadline: past it, the attempt counts as failed and
 * the page gets a reason instead of a spinner.
 */
const READY_TIMEOUT_MS = 20_000;
const PROBE_INTERVAL_MS = 15_000;

/** Ask the platform for a fresh token; only the credential check matters here. */
async function defaultFetchToken(appId, clientSecret) {
  const reply = await fetch('https://bots.qq.com/app/getAppAccessToken', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ appId, clientSecret }),
    signal: AbortSignal.timeout(8_000),
  });
  return reply.json();
}

function disposeAttempt(attempt) {
  const stop = attempt?.stop;
  attempt.stop = null;
  if (typeof stop !== 'function') return;
  try {
    stop();
  } catch {
    // The connector may already have cleaned up after itself.
  }
}

/**
 * The QQ half of the channel layer: QQ Open Platform bot through the official
 * SDK. Scan-to-connect is delegated to the connector package.
 */
/** One line a person can act on; the SDK speaks in access_token codes. */
/**
 * Send failures split in two: the bot itself is gone (a deregistered app keeps
 * the socket open, then rejects everything), or the bot is fine and only the
 * relationship is missing. The first must drop the green light, the second must
 * not - "reconnect" would be the wrong advice for a removed friend.
 */
function classifySendError(error) {
  const text = String(error?.message ?? error);
  const first = text.split(String.fromCharCode(10))[0];
  if (/机器人状态异常|appid invalid|100007|access_token|robot.*invalid/i.test(first)) {
    return { message: 'QQ 机器人已失效（可能已被注销）：请重新扫码接入。', dead: true };
  }
  if (/无好友关系|not friend/i.test(first)) {
    return { message: 'QQ 机器人不在你的好友列表里：先把它加为好友，或重新扫码接入。', dead: false };
  }
  return { message: first.slice(0, 160), dead: false };
}

function describeSendError(error) {
  return classifySendError(error).message;
}

function describeStartError(error) {
  const text = String(error?.message ?? error);
  const first = text.split("\n")[0];
  if (/appid invalid|100007/i.test(first)) return 'QQ 应用已失效（机器人可能已被删除），请重新扫码接入。';
  if (/access_token/i.test(first)) return `QQ 授权失败：${first.slice(0, 80)}`;
  return first.slice(0, 160);
}

export class QqChannel {
  #config;
  #createBot;
  #log;
  #onInbound;
  #bot = null;
  #login = null;
  #status = { connected: false, appId: '', lastError: '' };
  #lastProbeAt = 0;
  #probe = null;

  #readyTimeoutMs;
  #fetchToken;

  constructor({
    config,
    onInbound,
    log,
    createBot = (options) => new QQBot(options),
    readyTimeoutMs = READY_TIMEOUT_MS,
    fetchToken = defaultFetchToken,
  }) {
    this.#createBot = createBot;
    this.#config = config;
    this.#log = log;
    this.#onInbound = onInbound;
    this.#readyTimeoutMs = readyTimeoutMs;
    this.#fetchToken = fetchToken;
  }

  get status() {
    return { ...this.#status, channel: 'qq' };
  }

  /**
   * A deregistered bot keeps its websocket open and only fails when something
   * is actually sent, so "connected" can outlive the account by hours. Asking
   * the token endpoint is cheap and tells the truth: a deleted app answers
   * 100007 immediately. Results are cached so the panel's 5s poll stays quiet.
   */
  async verify({ maxAgeMs = PROBE_INTERVAL_MS } = {}) {
    if (!this.#status.connected) return this.status;
    const now = Date.now();
    if (now - this.#lastProbeAt < maxAgeMs) return this.status;
    if (this.#probe) return this.#probe;
    const qq = this.#config().qq ?? {};
    if (!qq.appId || !qq.appSecret) return this.status;
    this.#lastProbeAt = now;
    this.#probe = (async () => {
      try {
        const reply = await this.#fetchToken(qq.appId, qq.appSecret);
        const code = Number(reply?.code ?? 0);
        if (code === 100007 || /appid invalid/i.test(String(reply?.message ?? ''))) {
          this.#markDead('QQ 机器人已失效（可能已被注销）：请重新扫码接入。');
        }
      } catch (error) {
        // A flaky network is not proof of death; keep the last known state.
        this.#log?.warn?.(`[life-chat] qq: probe failed: ${error?.message ?? error}`);
      } finally {
        this.#probe = null;
      }
      return this.status;
    })();
    return this.#probe;
  }

  #markDead(reason) {
    this.#status = { ...this.#status, connected: false, lastError: reason };
    const current = this.#bot;
    this.#bot = null;
    try {
      current?.stop?.();
    } catch {
      // Already gone.
    }
  }

  get configured() {
    const qq = this.#config().qq ?? {};
    return Boolean(qq.appId && qq.appSecret);
  }

  async connect() {
    if (!this.configured) return false;
    if (this.#bot && this.#status.connected) return true;
    // A bot object that is no longer ready cannot be reused: replacing it is
    // the only way back after the server side dropped the session.
    if (this.#bot) await this.stop();
    const qq = this.#config().qq;
    // Same client shape the proven dsh-im chain used: a synchronous token
    // fetch surfaces a rejected appId at start() instead of after it, and the
    // websocket transport is what the platform's bot gate expects.
    const bot = this.#createBot({
      appId: qq.appId,
      appSecret: qq.appSecret,
      transport: 'websocket',
      tokenPrefetch: 'sync',
      markdownSupport: false,
    });
    // Only the events this SDK actually declares may be subscribed: an unknown
    // name throws inside `on()`, which would fail the whole connect.
    const on = (event, handler) => {
      try {
        bot.on(event, handler);
      } catch {
        // Not every SDK build knows this event.
      }
    };

    let settle = () => {};
    const ready = new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (error) reject(error);
        else resolve();
      };
      const timer = setTimeout(() => {
        const seconds = Math.round(this.#readyTimeoutMs / 1000);
        finish(new Error(`QQ 连接超时：${seconds} 秒内没有就绪，请重试或重新扫码。`));
      }, this.#readyTimeoutMs);
      if (typeof timer?.unref === 'function') timer.unref();
      settle = finish;
    });

    const markUp = () => {
      if (this.#bot !== bot) return;
      this.#status = { ...this.#status, connected: true, appId: qq.appId, lastError: '' };
      settle();
    };
    on('ready', markUp);
    on('resumed', markUp);
    on('error', (error) => {
      const reason = describeStartError(error);
      this.#log.warn?.(`[life-chat] qq error: ${reason}`);
      if (this.#bot !== bot) return;
      this.#status = { ...this.#status, connected: false, lastError: reason };
      settle(new Error(reason));
    });
    on('message', (_ctx, message) => {
      try {
        this.#accept(message);
      } catch (error) {
        this.#log.warn?.(`[life-chat] qq inbound failed: ${error?.message ?? error}`);
      }
    });

    this.#bot = bot;
    this.#status = { ...this.#status, appId: qq.appId, lastError: '' };
    // `start()` may never settle when the socket cannot come up, so readiness —
    // not the start promise — decides whether this connect succeeded.
    Promise.resolve()
      .then(() => bot.start())
      .then(
        () => {},
        (error) => settle(new Error(describeStartError(error))),
      );

    try {
      await ready;
    } catch (error) {
      const reason = String(error?.message ?? error);
      if (this.#bot === bot) this.#bot = null;
      this.#status = { ...this.#status, connected: false, lastError: reason };
      try {
        bot.stop?.();
      } catch {
        // The bot never came up; there is nothing to tear down.
      }
      throw new Error(reason);
    }
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
    // Without a known owner openid there is no way to tell, so nothing gets through.
    if (this.#config().ownerOnly) {
      if (!qq.ownerOpenId) {
        this.#log.warn?.('[life-chat] qq: ownerOnly is on but no owner openid is set; message dropped');
        return;
      }
      if (senderId !== qq.ownerOpenId) return;
    }
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
      at: toIso(message.timestamp),
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
    let sent;
    try {
      sent = await bot.sendText({ scope, targetId: target, ...(msgId ? { msgId } : {}) }, String(text));
    } catch (error) {
      const { message, dead } = classifySendError(error);
      // The credentials outlived the bot. Keeping "connected" here is why a
      // deregistered account used to show a green light forever.
      if (dead) this.#markDead(message);
      throw new Error(message);
    }
    return { messageId: sent?.id ?? '', scope, targetId: target };
  }

  /** Show the QQ mobile scan-to-connect flow; resolves with the QR URL. */
  startLogin() {
    if (this.#login && !TERMINAL.has(this.#login.state)) {
      throw new Error('a QQ login attempt is already running');
    }
    this.cancelLogin();
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
        disposeAttempt(attempt);
      },
      onFailure: (error) => {
        attempt.state = 'failed';
        attempt.error = String(error?.message ?? error);
        disposeAttempt(attempt);
      },
      onSuccess: (credentials) => {
        const first = Array.isArray(credentials) ? credentials[0] : credentials;
        if (!first?.appId || !first?.appSecret) {
          attempt.state = 'failed';
          attempt.error = '扫码成功，但没有拿到 AppID/AppSecret。';
          disposeAttempt(attempt);
          return;
        }
        attempt.state = 'connected';
        attempt.credentials = {
          appId: first.appId,
          appSecret: first.appSecret,
          ...(first.userOpenid ? { ownerOpenId: String(first.userOpenid) } : {}),
        };
        disposeAttempt(attempt);
      },
    }, {
      displayQrCodeToConsole: false,
      // The scan page reads this as the client product name; keep it identical
      // to the chain that bound bots successfully before.
      source: 'deepseek-harness',
    });
    attempt.stop = stop;
    return { attemptId: attempt.id, expiresAt: Date.now() + 5 * 60_000 };
  }

  /** Read the login state without consuming it. */
  peekLoginState() {
    const attempt = this.#login;
    if (!attempt) return null;
    return { attemptId: attempt.id, state: attempt.state, qrUrl: attempt.qrUrl, error: attempt.error };
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
