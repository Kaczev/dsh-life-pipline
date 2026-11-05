import { randomUUID } from 'node:crypto';
import {
  WEIXIN_QR_BASE_URL,
  createWeixinApi,
  extractWeixinImages,
  extractWeixinText,
  splitWeixinText,
  weixinMessageId,
} from './vendor/weixin-api.mjs';
import { MAX_IMAGES_PER_MESSAGE, MAX_IMAGE_BYTES, toInboundImage } from '../images.mjs';

const defaultApi = createWeixinApi();
const TERMINAL = new Set(['connected', 'failed', 'expired', 'cancelled']);
const LOGIN_POLL_MS = 2_000;
const LOGIN_TTL_MS = 5 * 60_000;

/**
 * The WeChat half of the channel layer: iLink official bot protocol, driven
 * directly instead of through dsh-im. Only text is handled in this version.
 */
export class WeixinChannel {
  #api;
  #fetchImpl;
  #config;
  #log;
  #onInbound;
  #running = null;
  #login = null;
  #status = { connected: false, accountId: '', ownerUserId: '', lastError: '' };
  // iLink carries a per-conversation `context_token` on every inbound message.
  // A send that lacks a live one is accepted by the provider and then dropped,
  // so the newest token seen for a conversation is the only safe one to reuse.
  #contextTokens = new Map();
  #tokenOwner = '';

  constructor({ config, onInbound, log, api = defaultApi, fetchImpl = fetch }) {
    this.#api = api;
    this.#config = config;
    this.#log = log;
    this.#onInbound = onInbound;
    this.#fetchImpl = fetchImpl;
  }

  get status() {
    return { ...this.#status, channel: 'weixin' };
  }

  #credentials() {
    const weixin = this.#config().weixin ?? {};
    return {
      botToken: weixin.botToken ?? '',
      accountId: weixin.accountId ?? '',
      ownerUserId: weixin.ownerUserId ?? '',
      baseUrl: weixin.baseUrl || WEIXIN_QR_BASE_URL,
    };
  }

  /** True once a scan has produced usable credentials. */
  get configured() {
    const { botToken, ownerUserId } = this.#credentials();
    return Boolean(botToken && ownerUserId);
  }

  async connect() {
    if (!this.configured) return false;
    if (this.#running) {
      // Already up: nothing to do. Up but failing to poll means the token is
      // no longer accepted, so start over with a fresh loop and let the status
      // keep saying "not connected" until a poll succeeds again.
      if (this.#status.connected) return true;
      await this.stop();
    }
    const { botToken, baseUrl } = this.#credentials();
    // Credentials that changed mean every captured token belongs to a bot that
    // no longer exists: keeping them would produce silent drops, not errors.
    if (this.#tokenOwner !== botToken) {
      this.#contextTokens.clear();
      this.#tokenOwner = botToken;
    }
    const controller = new AbortController();
    this.#running = controller;
    this.#status = { ...this.#status, connected: false, lastError: '' };
    void this.#loop({ botToken, baseUrl, controller });
    return true;
  }

  async #loop({ botToken, baseUrl, controller }) {
    const signal = controller.signal;
    let cursor = '';
    try {
      // The announce call is the first place a revoked token shows up. Swallow
      // it and the loop below would keep polling happily, so a refused token is
      // reported as "not connected" instead of a green light.
      const startError = await this.#api
        .notifyStart({ baseUrl, token: botToken, signal })
        .then(() => '', (error) => String(error?.message ?? error));
      if (signal.aborted) return;
      if (startError) {
        this.#status = { ...this.#status, connected: false, lastError: startError };
        this.#log.warn?.(`[life-chat] weixin notifyStart failed: ${startError}`);
        return;
      }
      this.#status = { ...this.#status, connected: true, lastError: '' };
      while (!signal.aborted) {
        let update;
        try {
          update = await this.#api.getUpdates({ baseUrl, token: botToken, getUpdatesBuf: cursor, signal });
        } catch (error) {
          if (signal.aborted) break;
          this.#status = { ...this.#status, connected: false, lastError: String(error?.message ?? error) };
          this.#log.warn?.(`[life-chat] weixin getUpdates failed: ${error?.message ?? error}`);
          await sleep(2_000, signal);
          continue;
        }
        if (!this.#status.connected) {
          this.#status = { ...this.#status, connected: true, lastError: '' };
        }
        if (typeof update?.get_updates_buf === 'string' && update.get_updates_buf) {
          cursor = update.get_updates_buf;
        }
        for (const message of update?.msgs ?? []) {
          // Sequential on purpose: two pictures from the same conversation must
          // reach the session in the order he sent them.
          await this.#accept(message, signal);
        }
      }
    } catch (error) {
      if (!signal.aborted) {
        this.#status = { ...this.#status, connected: false, lastError: String(error?.message ?? error) };
        this.#log.warn?.(`[life-chat] weixin loop stopped: ${error?.message ?? error}`);
      }
    } finally {
      // Only the current run may write the final state: a stop() followed by a
      // new connect() must not be clobbered by the loop that is on its way out.
      if (this.#running === controller) {
        this.#running = null;
        this.#status = { ...this.#status, connected: false };
      }
    }
  }

  async #accept(message, signal) {
    if (!message || message.message_type === 2) return;
    const text = (extractWeixinText(message) ?? '').trim();
    const senderId = String(message.from_user_id ?? '').trim();
    // A picture on its own is a message too; only a message with neither is
    // nothing we can act on.
    const images = await this.#imagesOf(message, signal);
    if ((!text && images.length === 0) || !senderId) return;
    const { ownerUserId } = this.#credentials();
    if (this.#config().ownerOnly) {
      // An unknown owner is not permission to accept everyone.
      if (!ownerUserId) {
        this.#log.warn?.('[life-chat] weixin: ownerOnly is on but no owner id is set; message dropped');
        return;
      }
      if (senderId !== ownerUserId) {
        this.#log.info?.(`[life-chat] weixin: dropped a message that is not from the owner`);
        return;
      }
    }
    const contextToken = String(message.context_token ?? '').trim();
    if (contextToken) {
      this.#contextTokens.set(senderId, contextToken);
      if (!this.#tokenOwner) this.#tokenOwner = this.#credentials().botToken;
    }
    this.#onInbound({
      channel: 'weixin',
      channelLabel: '微信',
      conversationKind: 'dm',
      conversationId: senderId,
      senderId,
      senderName: '',
      text,
      images,
      at: new Date(Number(message.create_time_ms) || Date.now()).toISOString(),
      messageId: weixinMessageId(message),
      contextToken: String(message.context_token ?? ''),
    });
  }

  /**
   * Decrypt and bound the pictures in one inbound message. A failure on one
   * image drops that image and is reported, never the message around it.
   */
  #imagesOf(message, signal) {
    return weixinInboundImages(message, { fetchImpl: this.#fetchImpl, log: this.#log, signal });
  }

  async sendText(text, { toUserId, contextToken } = {}) {
    const { botToken, ownerUserId, baseUrl } = this.#credentials();
    const target = toUserId || ownerUserId;
    if (!botToken || !target) throw new Error('WeChat is not connected yet');
    // What this channel heard last beats a caller's stale guess.
    const token = this.#contextTokens.get(target) || contextToken || '';
    const chunks = splitWeixinText(String(text));
    const ids = [];
    for (const chunk of chunks) {
      let sent;
      try {
        sent = await this.#api.sendText({
          baseUrl,
          token: botToken,
          toUserId: target,
          text: chunk,
          contextToken: token,
        });
      } catch (error) {
        // A rejected send is proof the token no longer works: stop claiming
        // "connected" and let the page show the reason.
        const reason = String(error?.message ?? error);
        this.#status = { ...this.#status, connected: false, lastError: reason };
        throw error;
      }
      ids.push(...(sent?.providerMessageIds ?? []));
    }
    return { messageIds: ids, toUserId: target, contextToken: Boolean(token) };
  }

  /** Begin a scan-to-connect attempt; resolves with the QR payload for the UI. */
  async startLogin() {
    if (this.#login && !TERMINAL.has(this.#login.state)) {
      throw new Error('a WeChat login attempt is already running');
    }
    this.cancelLogin();
    const { qrcode, qrcodeUrl } = await this.#api.beginLogin();
    const attempt = {
      id: randomUUID(),
      qrcode,
      qrUrl: qrcodeUrl,
      state: 'pending',
      error: '',
      expiresAt: Date.now() + LOGIN_TTL_MS,
      controller: new AbortController(),
      pendingVerifyCode: null,
    };
    this.#login = attempt;
    void this.#pollLogin(attempt);
    return { attemptId: attempt.id, qrUrl: attempt.qrUrl, expiresAt: attempt.expiresAt };
  }

  async #pollLogin(attempt) {
    const { controller } = attempt;
    try {
      while (!controller.signal.aborted && Date.now() < attempt.expiresAt) {
        if (attempt.state === 'needs_verification' && !attempt.pendingVerifyCode) {
          await new Promise((resolve) => {
            attempt.verifyResolve = resolve;
            controller.signal.addEventListener('abort', resolve, { once: true });
          });
          if (controller.signal.aborted) break;
        }
        let response;
        try {
          response = await this.#api.pollLogin({
            qrcode: attempt.qrcode,
            baseUrl: WEIXIN_QR_BASE_URL,
            verifyCode: attempt.pendingVerifyCode ?? undefined,
            signal: controller.signal,
          });
        } catch (error) {
          if (controller.signal.aborted) break;
          await sleep(LOGIN_POLL_MS, controller.signal);
          continue;
        }
        attempt.pendingVerifyCode = null;
        const status = response?.status;
        if (status === 'wait') attempt.state = 'pending';
        else if (status === 'scaned') attempt.state = 'scanned';
        else if (status === 'need_verifycode') attempt.state = 'needs_verification';
        else if (status === 'verify_code_blocked') {
          attempt.state = 'failed';
          attempt.error = '配对码多次错误，请重新生成二维码。';
          break;
        } else if (status === 'expired') {
          attempt.state = 'expired';
          attempt.error = '二维码已过期，请重新生成。';
          break;
        } else if (status === 'scaned_but_redirect') {
          attempt.state = 'scanned';
        } else if (status === 'binded_redirect') {
          attempt.state = 'failed';
          attempt.error = '该微信账号已绑定过，但本机没有保存凭据。';
          break;
        } else if (status === 'confirmed') {
          const token = String(response.bot_token ?? '').trim();
          const accountId = String(response.ilink_bot_id ?? '').trim();
          const ownerUserId = String(response.ilink_user_id ?? '').trim();
          if (!token || !accountId || !ownerUserId) {
            attempt.state = 'failed';
            attempt.error = '微信授权成功，但返回的账号凭据不完整。';
            break;
          }
          attempt.state = 'connected';
          attempt.credentials = {
            botToken: token,
            accountId,
            ownerUserId,
            baseUrl: normalizeBaseUrl(response.baseurl) ?? WEIXIN_QR_BASE_URL,
          };
          break;
        }
        await sleep(LOGIN_POLL_MS, controller.signal);
      }
      if (attempt.state !== 'connected' && !controller.signal.aborted) {
        attempt.state = 'expired';
        attempt.error = attempt.error || '二维码已过期，请重新生成。';
      }
    } finally {
      attempt.verifyResolve = null;
    }
  }

  submitVerifyCode(code) {
    const attempt = this.#login;
    if (!attempt || attempt.state !== 'needs_verification') return false;
    attempt.pendingVerifyCode = String(code ?? '').trim();
    attempt.verifyResolve?.();
    attempt.verifyResolve = null;
    return true;
  }

  cancelLogin() {
    const attempt = this.#login;
    if (!attempt) return false;
    attempt.controller.abort();
    if (attempt.state !== 'connected') attempt.state = 'cancelled';
    this.#login = null;
    return true;
  }

  /** Read the login state without consuming it; the page polls this often. */
  peekLoginState() {
    const attempt = this.#login;
    if (!attempt) return null;
    return {
      attemptId: attempt.id,
      state: attempt.state,
      qrUrl: attempt.qrUrl,
      error: attempt.error,
      expiresAt: attempt.expiresAt,
    };
  }

  /** Ask the login poller for its current state; clears it once finished. */
  loginState() {
    const attempt = this.#login;
    if (!attempt) return null;
    const snapshot = {
      attemptId: attempt.id,
      state: attempt.state,
      qrUrl: attempt.qrUrl,
      error: attempt.error,
      expiresAt: attempt.expiresAt,
    };
    if (attempt.state === 'connected') {
      this.#login = null;
      snapshot.credentials = attempt.credentials;
    } else if (['failed', 'expired', 'cancelled'].includes(attempt.state)) {
      this.#login = null;
    }
    return snapshot;
  }

  async stop() {
    this.cancelLogin();
    const running = this.#running;
    this.#running = null;
    if (!running) return;
    running.abort();
    const { botToken, baseUrl } = this.#credentials();
    if (botToken) {
      await this.#api.notifyStop({ baseUrl, token: botToken }).catch(() => {});
    }
  }
}

function normalizeBaseUrl(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') return null;
    const href = url.href.endsWith('/') ? url.href : `${url.href}/`;
    return href;
  } catch {
    return null;
  }
}

function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

/**
 * Download and decrypt the pictures of one inbound WeChat message.
 * @param {object} message - one iLink message.
 * @param {{ fetchImpl?: typeof fetch, log?: object, signal?: AbortSignal }} [options]
 * @returns {Promise<Array<{ name: string, mediaType: string, data: Uint8Array }>>} decoded images, in message order.
 */
export async function weixinInboundImages(message, { fetchImpl = fetch, log = null, signal } = {}) {
  const items = extractWeixinImages(message, { fetchImpl });
  const images = [];
  for (const item of items.slice(0, MAX_IMAGES_PER_MESSAGE)) {
    try {
      const bytes = await item.load({ signal, maxBytes: MAX_IMAGE_BYTES });
      const image = toInboundImage(bytes, { name: item.name });
      if (image) images.push(image);
      else log?.warn?.('[life-chat] weixin: dropped an inbound image in an unsupported format');
    } catch (error) {
      log?.warn?.(`[life-chat] weixin: inbound image failed: ${error?.message ?? error}`);
    }
  }
  return images;
}
