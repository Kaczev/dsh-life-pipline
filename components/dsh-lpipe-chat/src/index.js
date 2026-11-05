import { loadConfig, saveConfig, updateConfig } from './config.mjs';
import { appendMessage, queryMessages, lastContextToken } from './store.mjs';
import { InboundGateway } from './gateway.mjs';
import { createNoticeDelivery } from './notice.mjs';
import { createChatTools } from './tools.mjs';
import { createChatRpcHandler, registerChatRpc } from './rpc.mjs';
import { WeixinChannel } from './weixin/channel.mjs';
import { QqChannel } from './qq/channel.mjs';

export const name = 'dsh-lpipe-chat';

const store = {
  appendMessage,
  queryMessages,
  lastContextToken,
};

function loggerFor(ctx) {
  const logger = typeof ctx?.logger === 'function' ? ctx.logger(name) : ctx?.logger;
  return {
    info: (text) => logger?.info?.(text),
    warn: (text) => logger?.warn?.(text),
  };
}

/**
 * One component, two owned channels, one debounce window, one destination
 * session. Everything the user sends from WeChat or QQ ends up in the main
 * session as `[渠道 · 发送者] 正文`, and answering is optional.
 */
export function apply(ctx, config) {
  const log = loggerFor(ctx);

  // A patch-row config is authoritative on first run; afterwards the config
  // page owns the file.
  if (config && typeof config === 'object' && Object.keys(config).length > 0) {
    const current = loadConfig();
    saveConfig({ ...current, ...config });
  }

  const getConfig = () => loadConfig();
  const update = (mutator) => updateConfig(mutator);

  const channels = {
    weixin: new WeixinChannel({
      config: getConfig,
      log,
      onInbound: (event) => acceptInbound(event),
    }),
    qq: new QqChannel({
      config: getConfig,
      log,
      onInbound: (event) => acceptInbound(event),
    }),
  };

  let delivery = null;
  let sessions = null;
  const gateway = new InboundGateway({
    getConfig, log,
    lastAt: lastInboundAt(),
    deliver: (request) => {
      if (!delivery) throw new Error('notice delivery is unavailable');
      return delivery.deliver(request);
    },
  });

  // The registry can resolve after the handler is built; delegate lazily so a
  // late `sessions` service still answers title lookups.
  function currentSessions() {
    return {
      get: (id) => {
        try {
          return sessions?.get?.(id) ?? null;
        } catch {
          return null;
        }
      },
    };
  }

  // Seed the stamp baseline from the archive: a restart must not replay a time
  // the owner has already seen.
  function lastInboundAt() {
    try {
      const rows = store.readMessages();
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        const row = rows[index];
        if (row?.direction !== 'in') continue;
        const parsed = Date.parse(row.at);
        if (Number.isFinite(parsed)) return parsed;
      }
    } catch (error) {
      log.warn(`[life-chat] could not read the last inbound time: ${error?.message ?? error}`);
    }
    return null;
  }

  function acceptInbound(event) {
    try {
      store.appendMessage({
        channel: event.channel,
        direction: 'in',
        conversationKind: event.conversationKind,
        conversationId: event.conversationId,
        senderId: event.senderId,
        senderName: event.senderName,
        text: event.text,
        at: event.at,
        messageId: event.messageId,
        contextToken: event.contextToken,
        replyTarget: event.replyTarget,
      });
    } catch (error) {
      log.warn(`[life-chat] failed to archive inbound message: ${error?.message ?? error}`);
    }
    gateway.accept(event);
  }

  ctx.inject(['sessionController'], (sessionCtx) => {
    const current = createNoticeDelivery(sessionCtx.sessionController);
    delivery = current;
    sessionCtx.effect(() => () => {
      current.dispose();
      if (delivery === current) delivery = null;
    }, 'dsh-lpipe-chat: notice delivery teardown');
    void startChannels();
  });

  ctx.inject(['sessions'], (sessionsCtx) => {
    sessions = sessionsCtx.sessions ?? null;
  });

  ctx.inject(['connection'], (connectionCtx) => {
    const handle = createChatRpcHandler({ getConfig, update, channels, sessions: currentSessions() });
    try {
      registerChatRpc(connectionCtx, handle);
    } catch (error) {
      log.warn(`[life-chat] settings page bridge unavailable: ${error?.message ?? error}`);
    }
  });

  ctx.inject(['tools'], (toolsCtx) => {
    const tools = createChatTools({ getConfig, update, channels, store });
    for (const tool of tools) {
      // A name clash with another plugin must not take the whole bundle down.
      try {
        toolsCtx.tools.register(tool);
      } catch (error) {
        log.warn(`[life-chat] could not register ${tool.name}: ${error?.message ?? error}`);
      }
    }
  });

  ctx.inject(['systemPrompt'], (promptCtx) => {
    try {
      promptCtx.systemPrompt.context({
        name: 'dsh-lpipe-chat',
        order: 120,
        text: 'Messages from WeChat or QQ arrive as dsh-lpipe-chat background notices with lines shaped like `[微信 · Kaczev] ...`; a burst is bundled into one message. Answer with chat_send when a reply is warranted, and stay silent otherwise. Never claim a message was sent before chat_send returns.',
      });
    } catch (error) {
      log.warn(`[life-chat] system prompt guidance unavailable: ${error?.message ?? error}`);
    }
  });

  async function startChannels() {
    const config = getConfig();
    if (config.weixin?.enabled !== false && channels.weixin.configured) {
      await channels.weixin.connect().catch((error) => log.warn(`[life-chat] weixin connect failed: ${error?.message ?? error}`));
    }
    if (config.qq?.enabled !== false && channels.qq.configured) {
      await channels.qq.connect().catch((error) => log.warn(`[life-chat] qq connect failed: ${error?.message ?? error}`));
    }
  }

  ctx.effect(() => () => {
    gateway.dispose();
    void channels.weixin.stop();
    void channels.qq.stop();
  }, 'dsh-lpipe-chat: channel teardown');
}
