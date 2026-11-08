import { openForwardImageById, withForwardFiles } from './forward.mjs';
import { sendMediaParts } from './media.mjs';
import { join } from 'node:path';
import QRCode from './qrcode.mjs';
import { downloadFile } from './files.mjs';
import { historyPage } from './history.mjs';
import { homeDir, ensureHome } from './paths.mjs';
import { dshImAccounts, ownershipWarning } from './env-info.mjs';

/** Paint the login QR into the component directory so the agent can show it. */
async function renderQr(channel, url) {
  try {
    ensureHome();
    const path = join(homeDir(), `qr-${channel}.png`);
    await QRCode.toFile(path, url, { width: 360, margin: 2 });
    return path;
  } catch {
    return '';
  }
}

const textOutput = (description) => ({
  schema: { type: 'object', additionalProperties: true },
  render: (_args, value) => [{ type: 'text', text: typeof value?.summary === 'string' ? value.summary : description }],
});

/**
 * Tools the agent uses to talk back into WeChat / QQ and to look at what came
 * through. Registration happens from the component, not from here.
 */
export function createChatTools({ getConfig, update, channels, store, getAttachments = () => null }) {
  return [
    {
      name: 'chat_send',
      description: 'Send text, images or files over WeChat or QQ; combinations report partial results without retrying delivered parts. Use when answering an injected IM batch; silence is valid. Do not repeat the sent words in the Harness reply.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          channel: { type: 'string', enum: ['weixin', 'qq'], description: 'Which channel to send on.' },
          text: { type: 'string', description: 'Message body, plain text.' },
          media: { type: 'array', maxItems: 8, items: { type: 'object', additionalProperties: false,
            properties: {
              kind: { type: 'string', enum: ['image', 'file', 'sticker'], description: 'image/file supported; sticker is rejected rather than silently downgraded. GIF image bytes are sent unchanged; platform animation is unverified.' },
              path: { type: 'string', description: 'Local file path. Supply this or attachmentId.' },
              attachmentId: { type: 'string', description: 'Received file attachment ID; explicitly downloads it before sending.' },
            }, required: ['kind'] } },
          scope: { type: 'string', enum: ['c2c', 'group'], description: 'QQ only: private chat (default) or group.' },
          targetId: { type: 'string', description: 'QQ only: user or group openid. Defaults to the owner for private chat; required for group chat.' },
          msgId: { type: 'string', description: 'QQ only: select a known inbound message to reply to. Omit to use the latest eligible message for this target; expired or exhausted routes use proactive delivery.' },
          completed: { type: 'boolean', description: 'Set true when this message is the whole answer for this turn: the turn ends here and nothing more is said in the Harness UI. Leave it out when you still have work to do after sending.' },
        },
        required: ['channel'],
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            sent: { type: 'boolean' },
            channel: { type: 'string' },
            messageIds: { type: 'array', items: { type: 'string' } },
            summary: { type: 'string' },
          },
          required: ['sent', 'channel', 'summary'],
        },
        render: (_args, value) => [{ type: 'text', text: value.summary }],
      },
      execute: async function send(args, exec) {
        if (args.media?.length) return sendMediaParts(args, {
          getConfig, channels, store,
          sendText: send,
        }, exec);
        const text = String(args?.text ?? '');
        if (!text.trim()) throw new Error('text or media is required');
        const channel = args.channel === 'qq' ? 'qq' : 'weixin';
        const config = getConfig();
        const archive = (row) => {
          try { store.appendMessage(row); return ''; }
          catch { return ' 本地归档失败；消息已发送，不要重发。'; }
        };
        if (channel === 'weixin') {
          // The channel reuses the token it last heard on this conversation;
          // passing a stored one here would resurrect a token from an older
          // bot, which the provider accepts and then silently drops.
          const sent = await channels.weixin.sendText(text, {});
          const archiveWarning = archive({
            channel: 'weixin',
            direction: 'out',
            conversationKind: 'dm',
            conversationId: sent.toUserId,
            senderId: 'self',
            senderName: '鲸鲸',
            text,
            messageIds: sent.messageIds,
          });
          const warning = sent.contextToken
            ? ''
            : '还没有这个会话的上下文凭据，若没收到，先在微信里发一条。';
          if (args?.completed === true) exec?.concludeTurn?.();
          return {
            sent: true,
            channel,
            messageIds: sent.messageIds,
            summary: `已通过微信发出 ${text.length} 字${warning ? `（${warning}）` : ''}。${archiveWarning}`,
          };
        }
        const sent = await channels.qq.sendText(text, {
          scope: args?.scope === 'group' ? 'group' : 'c2c',
          targetId: args?.targetId,
          msgId: args?.msgId,
        });
        const archiveWarning = archive({
          channel: 'qq',
          direction: 'out',
          conversationKind: sent.scope === 'group' ? 'group' : 'dm',
          conversationId: sent.targetId,
          senderId: 'self',
          senderName: '鲸鲸',
          text,
          messageIds: sent.messageId ? [sent.messageId] : [],
        });
        if (args?.completed === true) exec?.concludeTurn?.();
        return {
          sent: true,
          channel,
          messageIds: sent.messageId ? [sent.messageId] : [],
          summary: `已通过 QQ 发出 ${text.length} 字。${archiveWarning}`,
        };
      },
    },
    {
      name: 'chat_download',
      description: 'Inspect an archived file attachment or explicitly download it. Does not open, unpack or execute files.',
      parameters: {
        type: 'object', additionalProperties: false,
        properties: {
          id: { type: 'string', description: 'Attachment ID from a notice or chat_history.' },
          action: { type: 'string', enum: ['inspect', 'download'], description: 'Default inspect; download saves bytes subject to the configured size limit.' },
          directory: { type: 'string', description: 'Optional destination directory; defaults to the current user’s .dsh/life-chat/downloads.' },
        }, required: ['id'],
      },
      output: textOutput('附件信息。'),
      execute: (args) => downloadFile(args, getConfig()),
    },
    {
      name: 'chat_history',
      description: 'Read the locally archived WeChat/QQ messages, both directions, newest last. Use it when a batch references something said earlier or when the owner asks what was talked about.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          channel: { type: 'string', enum: ['weixin', 'qq'], description: 'Optional channel filter.' },
          keyword: { type: 'string', description: 'Optional case-insensitive substring filter.' },
          messageId: { type: 'string', description: 'Open one archived message or forwarded record using its ID.' },
          image: { type: 'string', description: 'View one forwarded image using its attachment ID shown in history (up to 8MB). When set, other history filters are ignored.' },
          cursor: { type: 'string', description: 'Continue a bounded page; retains the original filters.' },
          limit: { type: 'number', description: 'Maximum rows per page, 1-200. Default 20; byte budget may return fewer.' },
        },
      },
      output: {
        ...textOutput('查无记录。'),
        render: (_args, value) => [{ type: 'text', text: value.summary }, ...(value.attachment ? [{ type: 'image', attachment: value.attachment }] : [])],
      },
      async execute(args, exec) {
        const imageId = typeof args.image === 'string' ? args.image.trim() : args.image;
        if (imageId) {
          return openForwardImageById(imageId, getAttachments(), { signal: exec?.signal });
        }
        const rows = store.readMessages();
        const selected = args.messageId ? rows.map(row => row.id === args.messageId || row.messageId === args.messageId ? withForwardFiles(row) : row) : rows;
        return historyPage(args, getConfig(), selected);
      },
    },
    {
      name: 'chat_login',
      description: 'Scan-to-connect for the owned channels. action=begin returns a QR link; open or render it, then poll action=status until it reports connected. action=code submits the pairing code when WeChat asks for one. action=cancel aborts.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          channel: { type: 'string', enum: ['weixin', 'qq'] },
          action: { type: 'string', enum: ['begin', 'status', 'code', 'cancel'], description: 'Defaults to status.' },
          code: { type: 'string', description: 'Pairing code for WeChat.' },
        },
        required: ['channel'],
      },
      output: textOutput('等待扫码。'),
      async execute(args) {
        const channel = args.channel === 'qq' ? 'qq' : 'weixin';
        const adapter = channels[channel];
        const action = args?.action ?? 'status';
        if (action === 'begin') {
          const started = await adapter.startLogin();
          const state = adapter.loginState?.() ?? null;
          const qrUrl = started.qrUrl || state?.qrUrl || '';
          const qrImagePath = qrUrl ? await renderQr(channel, qrUrl) : '';
          return {
            state: 'pending',
            qrUrl,
            qrImagePath,
            summary: qrUrl
              ? `请扫码：${qrUrl}${qrImagePath ? `
二维码图片：${qrImagePath}` : ''}`
              : '二维码已开始生成，稍后用 action=status 取链接。',
          };
        }
        if (action === 'code') {
          const accepted = adapter.submitVerifyCode(args?.code ?? '');
          return { accepted, summary: accepted ? '配对码已提交。' : '当前没有等待配对码的登录。' };
        }
        if (action === 'cancel') {
          adapter.cancelLogin();
          return { state: 'cancelled', summary: '已取消扫码登录。' };
        }
        const state = adapter.loginState();
        if (!state) return { state: 'idle', summary: '没有进行中的登录。' };
        if (state.state === 'connected' && state.credentials) {
          update((config) => {
            const next = { ...config };
            if (channel === 'weixin') next.weixin = { ...config.weixin, ...state.credentials };
            else next.qq = { ...config.qq, ...state.credentials, ownerOpenId: state.credentials.ownerOpenId ?? config.qq.ownerOpenId };
            return next;
          });
          await adapter.connect();
          return { state: 'connected', summary: `${channel === 'qq' ? 'QQ' : '微信'}已连接。` };
        }
        return {
          state: state.state,
          qrUrl: state.qrUrl ?? '',
          error: state.error ?? '',
          summary: state.qrUrl ? `当前状态 ${state.state}，二维码：${state.qrUrl}` : `当前状态 ${state.state}。`,
        };
      },
    },
    {
      name: 'chat_status',
      description: 'Show whether WeChat / QQ are connected, which session receives the batches, and how long the collection window is.',
      parameters: { type: 'object', additionalProperties: false, properties: {} },
      output: textOutput(''),
      async execute() {
        const config = getConfig();
        const weixin = channels.weixin.status;
        const qq = channels.qq.status;
        const lines = [
          `微信：${weixin.connected ? '已连接' : (config.weixin.botToken ? '已保存凭据但未连上' : '未接入')}`,
          `QQ：${qq.connected ? '已连接' : (config.qq.appId ? '已保存凭据但未连上' : '未接入')}`,
          `主会话：${config.mainSessionId || '未设置'}`,
          `合并间隔：${config.quietSeconds} 秒，收集窗口：${config.windowSeconds} 秒`,
        ];
        const conflict = ownershipWarning(dshImAccounts(), config);
        if (conflict) lines.push(`冲突：${conflict}`);
        return {
          weixin,
          qq,
          mainSessionId: config.mainSessionId,
          quietSeconds: config.quietSeconds,
          windowSeconds: config.windowSeconds,
          dshImConflict: conflict,
          summary: lines.join('\n'),
        };
      },
    },
  ];
}
