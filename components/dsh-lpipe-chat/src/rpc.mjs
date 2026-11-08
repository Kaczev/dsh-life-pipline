import { parseBytes, DEFAULT_OUTPUT_BYTES, DEFAULT_DOWNLOAD_BYTES } from './content.mjs';
import QRCode from './qrcode.mjs';

import { clampQuiet, clampWindow } from './config.mjs';
import { readSessionTitle } from './session-title.mjs';

export const CHAT_RPC_ENDPOINT = 'dsh-lpipe-chat';

const METHODS = new Set([
  'chat.status',
  'chat.config.save',
  'chat.session.title',
  'chat.connect',
  'chat.login.begin',
  'chat.login.state',
  'chat.login.code',
  'chat.login.cancel',
]);

function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } };
}

function channelOf(value) {
  return value === 'weixin' || value === 'qq' ? value : null;
}

/** Live channel state, or null when the channel is not wired yet. */
function liveOf(channels, name) {
  try {
    return channels?.[name]?.status ?? null;
  } catch {
    return null;
  }
}

/**
 * Everything the settings page may learn about a channel; never a secret.
 *
 * `configured` means credentials exist, `connected` means the channel really
 * is up right now. Keeping them apart is what lets the page offer "reconnect"
 * after a token was revoked server-side while the config still holds it.
 */
function publicConfig(config, channels) {
  const weixin = config.weixin ?? {};
  const qq = config.qq ?? {};
  const weixinLive = liveOf(channels, 'weixin');
  const qqLive = liveOf(channels, 'qq');
  const weixinConfigured = Boolean(String(weixin.botToken ?? '').trim());
  const qqConfigured = Boolean(String(qq.appId ?? '').trim() && String(qq.appSecret ?? '').trim());
  return {
    mainSessionId: String(config.mainSessionId ?? ''),
    quietSeconds: clampQuiet(config.quietSeconds),
    windowSeconds: clampWindow(config.windowSeconds),
    outputBytes: config.outputBytes ?? DEFAULT_OUTPUT_BYTES,
    downloadBytes: config.downloadBytes ?? DEFAULT_DOWNLOAD_BYTES,
    downloadRetentionDays: config.downloadRetentionDays ?? 7,
    ownerOnly: config.ownerOnly !== false,
    ownerName: String(config.ownerName ?? ''),
    weixin: {
      enabled: weixin.enabled !== false,
      configured: weixinConfigured,
      connected: weixinConfigured && Boolean(weixinLive?.connected),
      lastError: String(weixinLive?.lastError ?? ''),
      ownerUserId: String(weixin.ownerUserId ?? ''),
      accountId: String(weixin.accountId ?? ''),
    },
    qq: {
      enabled: qq.enabled !== false,
      configured: qqConfigured,
      connected: qqConfigured && Boolean(qqLive?.connected),
      lastError: String(qqLive?.lastError ?? ''),
      ownerOpenId: String(qq.ownerOpenId ?? ''),
      appId: String(qq.appId ?? ''),
    },
  };
}

/**
 * Peek only: the page polls this, and consuming would eat a finished login.
 * QQ hands its QR URL to a callback, so the image is rendered here on demand
 * instead of being available once at `chat.login.begin` time.
 */
async function loginSnapshot(channel) {
  let state = null;
  try {
    state = channel.peekLoginState?.() ?? channel.loginState?.() ?? null;
  } catch {
    state = null;
  }
  if (!state) return { state: 'idle' };
  const { credentials, ...rest } = state;
  const qrDataUrl = await qrImageCached(String(rest.qrUrl ?? ''));
  return qrDataUrl ? { ...rest, qrDataUrl } : rest;
}

/**
 * One pure dispatcher so the settings page and `node --test` exercise the same
 * code. `channels` are the component's live channel instances.
 */
export function createChatRpcHandler({ getConfig, update, channels, sessions }) {
  const status = async () => {
    // Ask a channel to double-check itself before reporting. QQ keeps its
    // socket open after the bot is deregistered, so the only honest answer
    // comes from the credential check inside verify().
    try {
      await channels.qq?.verify?.();
    } catch {
      // The probe is advisory: a broken probe never hides the page.
    }
    return {
      config: publicConfig(getConfig(), channels),
      channels: {
        weixin: { login: await loginSnapshot(channels.weixin) },
        qq: { login: await loginSnapshot(channels.qq) },
      },
    };
  };

  return async function handle(method, payload) {
    if (!METHODS.has(method)) return failure('chat/unknown-method', `Unknown method: ${method}`);
    const input = payload && typeof payload === 'object' ? payload : {};

    if (method === 'chat.status') return { ok: true, value: await status() };

    if (method === 'chat.session.title') {
      return { ok: true, value: readSessionTitle(sessions, input.sessionId) };
    }

    if (method === 'chat.config.save') {
      const patch = {};
      if (Object.hasOwn(input, 'windowSeconds')) {
        const seconds = Number(input.windowSeconds);
        if (!Number.isFinite(seconds) || seconds < 3 || seconds > 120) {
          return failure('chat/bad-request', '收集窗口必须在 3 到 120 秒之间。');
        }
        patch.windowSeconds = Math.round(seconds);
      }
      if (Object.hasOwn(input, 'quietSeconds')) {
        const seconds = Number(input.quietSeconds);
        if (!Number.isFinite(seconds) || seconds < 0.2 || seconds > 60) {
          return failure('chat/bad-request', '合并间隔必须在 0.2 到 60 秒之间。');
        }
        patch.quietSeconds = Math.round(seconds * 10) / 10;
      }
      try {
        for (const key of ['outputBytes', 'downloadBytes']) {
          if (Object.hasOwn(input, key)) patch[key] = parseBytes(input[key]);
        }
        if (patch.outputBytes !== undefined && patch.outputBytes < 1024) throw new Error('通知／历史上限不能小于 1KB。');
      } catch (error) { return failure('chat/bad-request', error.message); }
      if (Object.hasOwn(input, 'downloadRetentionDays')) {
        const days = Number(input.downloadRetentionDays);
        if (!Number.isSafeInteger(days) || days < 1 || days > 36500) return failure('chat/bad-request', '下载保留天数必须是 1 到 36500 的整数。');
        patch.downloadRetentionDays = days;
      }
      if (Object.keys(patch).length === 0) return failure('chat/bad-request', '没有可保存的字段。');
      update((current) => ({ ...current, ...patch }));
      return { ok: true, value: await status() };
    }

    const channelName = channelOf(input.channel);
    if (!channelName) return failure('chat/bad-request', 'channel 必须是 weixin 或 qq。');
    const channel = channels[channelName];
    if (!channel) return failure('chat/unavailable', `${channelName} 通道不可用。`);

    if (method === 'chat.connect') {
      // Reconnect with the credentials already on disk. A scan is only needed
      // when the server side revoked them, which is exactly when this fails
      // and the page falls back to "扫码接入".
      try {
        const started = await channel.connect();
        if (started === false) {
          return failure('chat/not-configured', '这个通道还没有凭据，请先扫码接入。');
        }
      } catch (error) {
        // The channel already turned the SDK's wording into one actionable
        // line; fall back to the raw message only when it has nothing better.
        const detail = String(channel.status?.lastError || error?.message || error).split('\n')[0];
        return failure('chat/connect-failed', detail);
      }
      return { ok: true, value: await status() };
    }

    if (method === 'chat.login.begin') {
      try {
        const started = await channel.startLogin();
        const login = await loginSnapshot(channel);
        const qrUrl = String(started?.qrUrl || login.qrUrl || '');
        return {
          ok: true,
          value: { ...started, qrUrl, qrDataUrl: login.qrDataUrl ?? (await qrImage(qrUrl)), login },
        };
      } catch (error) {
        return failure('chat/login-failed', String(error?.message ?? error));
      }
    }

    if (method === 'chat.login.state') {
      // Consume exactly once: loginState() drops a finished attempt, so the
      // credentials must be adopted in this same call or they are lost.
      let state = null;
      try {
        state = channel.loginState?.() ?? null;
      } catch {
        state = null;
      }
      if (!state) return { ok: true, value: { login: { state: 'idle' } } };
      if (state.state !== 'connected' || !state.credentials) {
        const { credentials, ...login } = state;
        const qrDataUrl = await qrImageCached(String(login.qrUrl ?? ''));
        return { ok: true, value: { login: qrDataUrl ? { ...login, qrDataUrl } : login } };
      }
      update((current) => adoptCredentials(channelName, current, state.credentials));
      // Adopting credentials is not the same as being online: report what the
      // channel actually managed, so a scan that cannot connect says why.
      //
      // WeChat needs a moment after the scan before the new bot answers the
      // handshake; one immediate attempt used to read as "the scan failed",
      // which is why people had to scan twice. Retrying is cheap for WeChat and
      // wrong for QQ (a dead appid fails fast and honestly).
      const attempts = channelName === 'weixin' ? 3 : 1;
      let connected = false;
      let reason = '';
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        try {
          connected = (await channel.connect()) === true;
        } catch (error) {
          const detail = String(channel.status?.lastError || error?.message || error);
          reason = detail.split('\n')[0];
        }
        if (connected) {
          reason = '';
          break;
        }
        if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 800));
      }
      return {
        ok: true,
        value: {
          login: reason ? { state: 'connected', error: reason } : { state: 'connected' },
          connected,
        },
      };
    }

    if (method === 'chat.login.code') {
      const accepted = channel.submitVerifyCode?.(String(input.code ?? '')) === true;
      return accepted
        ? { ok: true, value: { login: await loginSnapshot(channel) } }
        : failure('chat/bad-request', '当前不需要配对码，或配对码已被拒绝。');
    }

    const cancelled = channel.cancelLogin?.() === true;
    return { ok: true, value: { cancelled, login: await loginSnapshot(channel) } };
  };
}

/** QR images are rendered once per URL: the page polls the state every second. */
const qrCache = { url: '', data: '' };

async function qrImageCached(url) {
  if (!url) return '';
  if (qrCache.url === url) return qrCache.data;
  const data = await qrImage(url);
  if (data) {
    qrCache.url = url;
    qrCache.data = data;
  }
  return data;
}

/** The page shows the QR inline, so the Host renders it once into a data URL. */
async function qrImage(url) {
  if (!url) return '';
  try {
    return await QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' });
  } catch {
    return '';
  }
}

function adoptCredentials(channelName, config, credentials) {
  if (channelName === 'weixin') {
    return {
      ...config,
      weixin: {
        ...config.weixin,
        botToken: String(credentials.botToken ?? ''),
        accountId: String(credentials.accountId ?? ''),
        ownerUserId: String(credentials.ownerUserId ?? config.weixin?.ownerUserId ?? ''),
        baseUrl: String(credentials.baseUrl ?? config.weixin?.baseUrl ?? ''),
      },
    };
  }
  return {
    ...config,
    qq: {
      ...config.qq,
      appId: String(credentials.appId ?? ''),
      appSecret: String(credentials.appSecret ?? ''),
      // The scan hands us the owner openid; keep an existing one if it does not.
      ownerOpenId: String(credentials.ownerOpenId || config.qq?.ownerOpenId || ''),
    },
  };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Serve the page over the Host's own `/api` carrier, the same way the bundled
 * IM panel does: browser auth and Host/Origin trust are applied before us.
 */
export function registerChatRpc(ctx, handle) {
  const registry = ctx?.connection?.fetch;
  if (typeof registry?.register !== 'function') {
    throw new TypeError('dsh-lpipe-chat needs the Host Connection Fetch registry');
  }
  const path = `/api/${CHAT_RPC_ENDPOINT}`;
  return registry.register({
    path,
    methods: ['POST'],
    requestBody: 'buffered',
    async fetch(request) {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
      if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        return new Response('content type must be application/json', { status: 415 });
      }
      let message;
      try {
        message = await request.json();
      } catch {
        return new Response('body is not JSON', { status: 400 });
      }
      const rpcId = typeof message?.rpcId === 'string' ? message.rpcId : 'invalid-request';
      const call = message?.payload;
      if (!isRecord(message) || message.type !== 'client-request' || typeof message.rpcId !== 'string'
        || message.method !== CHAT_RPC_ENDPOINT || !isRecord(call) || typeof call.method !== 'string'
        || !Object.hasOwn(call, 'payload')) {
        return Response.json({ type: 'server-response', rpcId, result: failure('chat/bad-request', 'Invalid request.') });
      }
      let result;
      try {
        result = await handle(call.method, call.payload, request.signal);
      } catch (error) {
        result = failure('chat/failed', String(error?.message ?? error));
      }
      return Response.json({ type: 'server-response', rpcId, result });
    },
  });
}
