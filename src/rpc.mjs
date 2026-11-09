import { randomUUID } from 'node:crypto';
import { readSessionTitle } from './session-title.mjs';

export const PIPELINE_RPC_ENDPOINT = 'dsh-life-pipline';

const METHODS = new Set([
  'pipeline.workspaces',
  'pipeline.session.create',
  'pipeline.status',
  'pipeline.config.save',
  'pipeline.session.title',
]);

function failure(code, message) {
  return { ok: false, error: { code, message, details: {} } };
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** One pure dispatcher: the settings page and `node --test` share it. */
export function createPipelineRpcHandler({ getConfig, update, sessions, workspaces, createSession, renameSession }) {
  const attempts = new Map();
  const status = () => {
    let config = getConfig();
    const selected = String(config.lastWorkspaceId ?? '');
    if (selected && workspaces && !workspaces.get(selected)) {
      update(current => ({ ...current, lastWorkspaceId: '' }));
      config = getConfig();
    }
    const mainSessionId = String(config.mainSessionId ?? '');
    return {
      mainSessionId,
      lastWorkspaceId: String(config.lastWorkspaceId ?? ''),
      session: readSessionTitle(sessions, mainSessionId),
      configPath: '',
    };
  };

  return async function handle(method, payload) {
    if (!METHODS.has(method)) return failure('pipeline/unknown-method', `Unknown method: ${method}`);
    const input = isRecord(payload) ? payload : {};

    if (method === 'pipeline.workspaces') {
      return { ok: true, value: (workspaces?.list() ?? []).map(w => ({ id: w.id, title: w.title, path: w.path })) };
    }
    if (method === 'pipeline.session.create') {
      if (!workspaces || !createSession) return failure('pipeline/unavailable', '工作区创建服务不可用。');
      if (typeof input.requestId !== 'string' || !/^[\w-]{8,100}$/.test(input.requestId) || typeof input.workspaceId !== 'string') return failure('pipeline/bad-request', '请选择工作区并提供创建请求标识。');
      let entry = attempts.get(input.requestId);
      if (entry && entry.workspaceId !== input.workspaceId) return failure('pipeline/bad-request', '重试不能更换工作区。');
      if (!entry) {
        const workspace = workspaces.get(input.workspaceId);
        if (!workspace) return failure('pipeline/bad-request', '所选工作区已不存在，请刷新。');
        if (await workspace.status() !== 'ok') return failure('pipeline/bad-request', '工作区目录不可用。');
        // Recheck after await: concurrent identical requests must share one creation.
        entry = attempts.get(input.requestId);
        if (!entry) {
          if (attempts.size >= 100) return failure('pipeline/limit', '本次运行的创建记录已达上限，请重启后重试。');
          // Own the identity before invoking the shared controller. Never rename
          // an ambient/reused Session returned by an unrelated creation path.
          const sessionId = `session-${randomUUID()}`;
          entry = { workspaceId: input.workspaceId, sessionId,
            promise: Promise.resolve().then(() => createSession({ workspaceId: input.workspaceId, sessionId })) };
          attempts.set(input.requestId, entry);
        }
      }
      let created;
      try { created = await entry.promise; }
      catch { return failure('pipeline/create-failed', '创建结果未确认；请检查会话列表，不要重复创建。'); }
      const sessionId = created?.sessionId;
      if (sessionId !== entry.sessionId) return failure('pipeline/session-mismatch', '创建返回了其他会话，已停止设置标题和绑定。请检查会话列表。');
      if (!entry.named && renameSession) {
        try { await renameSession({ sessionId, title: 'LP 主会话' }); entry.named = true; }
        catch { return { ok: true, value: { sessionId, bound: false, error: '空会话已创建，但设置标题失败。请重试，不会重复创建。' } }; }
      }
      if (entry.bound) return { ok: true, value: { sessionId, bound: true, error: '' } };
      try { update(current => ({ ...current, mainSessionId: sessionId, lastWorkspaceId: entry.workspaceId })); entry.bound = true; }
      catch { return { ok: true, value: { sessionId, bound: false, error: '空会话已创建，但保存主会话失败。请重试绑定。' } }; }
      return { ok: true, value: { sessionId, bound: true, error: '' } };
    }
    if (method === 'pipeline.status') return { ok: true, value: status() };

    if (method === 'pipeline.session.title') {
      return { ok: true, value: readSessionTitle(sessions, input.sessionId) };
    }

    const hasMain = Object.hasOwn(input, 'mainSessionId');
    const hasWorkspace = Object.hasOwn(input, 'lastWorkspaceId');
    if (!hasMain && !hasWorkspace) return failure('pipeline/bad-request', '没有可保存的字段。');
    if (hasWorkspace && (typeof input.lastWorkspaceId !== 'string' || (input.lastWorkspaceId && !workspaces?.get(input.lastWorkspaceId)))) {
      return failure('pipeline/bad-request', '所选工作区已不存在，请刷新。');
    }
    update((current) => ({ ...current,
      ...(hasMain ? { mainSessionId: String(input.mainSessionId ?? '').trim() } : {}),
      ...(hasWorkspace ? { lastWorkspaceId: input.lastWorkspaceId } : {}),
    }));
    return { ok: true, value: status() };
  };
}

/**
 * Serve the page over the Host's own `/api` carrier. Browser auth and
 * Host/Origin trust are applied by the Host before this handler runs.
 */
export function registerPipelineRpc(ctx, handle) {
  const registry = ctx?.connection?.fetch;
  if (typeof registry?.register !== 'function') {
    throw new TypeError('dsh-life-pipline needs the Host Connection Fetch registry');
  }
  return registry.register({
    path: `/api/${PIPELINE_RPC_ENDPOINT}`,
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
        || message.method !== PIPELINE_RPC_ENDPOINT || !isRecord(call) || typeof call.method !== 'string'
        || !Object.hasOwn(call, 'payload')) {
        return Response.json({ type: 'server-response', rpcId, result: failure('pipeline/bad-request', 'Invalid request.') });
      }
      let result;
      try {
        result = await handle(call.method, call.payload, request.signal);
      } catch (error) {
        result = failure('pipeline/failed', String(error?.message ?? error));
      }
      return Response.json({ type: 'server-response', rpcId, result });
    },
  });
}
