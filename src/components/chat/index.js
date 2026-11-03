import { loadConfig, saveConfig, updateConfig } from '../../config.mjs';
import { appendMessage, queryMessages, lastContextToken } from '../../store.mjs';
import { InboundGateway } from '../../gateway.mjs';
import { createChatTools } from '../../tools.mjs';
import { WeixinChannel } from '../../weixin/channel.mjs';
import { QqChannel } from '../../qq/channel.mjs';

export const name = 'dsh-life-chat';

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

  let prompt = null;
  const gateway = new InboundGateway({ getConfig, log, prompt: (request, source) => prompt(request, source) });

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
    prompt = async (request, source) => {
      const controller = sessionCtx.sessionController;
      if (typeof controller?.prompt !== 'function') throw new Error('sessionController.prompt is unavailable');
      return controller.prompt(request, source);
    };
    void startChannels();
  });

  ctx.inject(['tools'], (toolsCtx) => {
    const tools = createChatTools({ getConfig, update, channels, store });
    for (const tool of tools) {
      toolsCtx.tools.register(tool);
    }
  });

  ctx.inject(['systemPrompt'], (promptCtx) => {
    promptCtx.systemPrompt.context({
      name: 'dsh-life-chat',
      order: 120,
      text: 'Messages from WeChat or QQ arrive as a user message with lines shaped like `[微信 · Kaczev] ...`; a burst is bundled into one message. Answer with chat_send when a reply is warranted, and stay silent otherwise. Never claim a message was sent before chat_send returns.',
    });
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
  }, 'dsh-life-chat: channel teardown');
}
