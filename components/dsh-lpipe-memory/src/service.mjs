import { applyToolMutation, applyUiMutation, MemoryError, validateScopeInput, validateToolInput, validateUiInput } from './store.mjs';

import { applySceneMutation, applyRecollectionMutation, validateSceneInput, validateRecollectionInput, readScene } from './store.mjs';

const BUSINESS_ERRORS = new Set(['entry_limit', 'text_limit', 'reserved_id', 'not_found', 'id_exhausted', 'empty_text']);
const unavailable = () => ({ ok: false, code: 'not_available', message: 'This memory tool is not enabled for this session.' });
const invalid = message => ({ ok: false, code: 'invalid_input', message });

function failure(error, warn) {
  if (error instanceof MemoryError) {
    const { code, message, limit, field } = error;
    return { ok: false, code, message, ...(limit === undefined ? {} : { limit }), ...(field === undefined ? {} : { field }) };
  }
  warn(error);
  return { ok: false, code: 'store_io', message: 'Memory could not be accessed.' };
}

export function createMemoryService({ opened, allowedInState, warn = () => {} }) {
  let store;
  let live = true;
  const ready = opened.then(value => { store = value; return value; });
  // Report open failures via RPC, not as an unhandled rejection or a failed plugin load.
  ready.catch(() => {});
  const current = () => live && store ? store.read() : undefined;
  const allowed = (kind, subject) => {
    try { return allowedInState(kind, current(), subject); }
    catch { return false; }
  };
  const withWishes = (kind, state, result) => kind === 'wishes'
    ? { ...result, wishes: state.wishes.entries.map(entry => ({ ...entry })) } : result;
  const publicState = ({ allSessions, sharedLists, wishes, settings, recollections: { selections: _private, ...recollections } }) => ({ allSessions, sharedLists, wishes, settings, recollections });
  return {
    allowed, async readCurrent() { await ready; return current(); },
    async close() {
      live = false;
      const value = await ready.catch(() => undefined);
      await value?.close();
    },
    async tool(kind, input, subject, signal) {
      if (!allowed(kind, subject)) return unavailable();
      try {
        validateToolInput(kind, input);
        const value = await ready;
        if (kind === 'wishes' && Object.keys(input).length === 0) {
          if (!live || signal?.aborted) return unavailable();
          const state = value.read();
          return allowedInState(kind, state, subject) ? withWishes(kind, state, { ok: true }) : unavailable();
        }
        return await value.transact(state => {
          if (!live || signal?.aborted || !allowedInState(kind, state, subject)) return unavailable();
          try {
            const { outcome, id, text } = applyToolMutation(state, kind, input);
            return withWishes(kind, state, {
              ok: true, outcome, id, ...(kind === 'settings' && text !== undefined ? { text } : {}),
            });
          } catch (error) {
            if (!(error instanceof MemoryError) || !BUSINESS_ERRORS.has(error.code)) throw error;
            return withWishes(kind, state, failure(error, warn));
          }
        });
      } catch (error) {
        return failure(error, warn);
      }
    },
    async recall(kind, input, subject, signal) {
      if (!allowed('recollections', subject)) return unavailable();
      try {
        const scene = kind === 'scene';
        (scene ? validateSceneInput : validateRecollectionInput)(input);
        const value = await ready;
        const eligible = state => live && !signal?.aborted && allowedInState('recollections', state, subject);
        if (scene && Object.keys(input).length === 1) {
          const state = value.read();
          return eligible(state) ? { ok: true, ...readScene(state, input.scene) } : unavailable();
        }
        return await value.transact(state => eligible(state)
          ? { ok: true, ...(scene ? applySceneMutation : applyRecollectionMutation)(state, input, subject.session.id) }
          : unavailable());
      } catch (error) { return failure(error, warn); }
    },
    async rpc(method, payload) {
      try {
        if (method === 'memory.state') {
          if (payload !== null) return invalid('memory.state requires a null payload.');
          const value = await ready;
          if (!live) return { ok: false, code: 'store_closed', message: 'Memory is closed.' };
          return { ok: true, state: publicState(value.read()) };
        }
        if (method === 'memory.mutate' || method === 'memory.setScope') {
          const setScope = method === 'memory.setScope';
          if (setScope) validateScopeInput(payload);
          else validateUiInput(payload);
          const value = await ready;
          return await value.transact(state => {
            if (!live) return { ok: false, code: 'store_closed', message: 'Memory is closed.' };
            if (!setScope) applyUiMutation(state, payload);
            else if (typeof payload === 'boolean') state.allSessions = payload;
            else state.sharedLists[payload.kind] = payload.enabled;
            return { ok: true, state: publicState(state) };
          });
        }
        return invalid('Unknown Memory method.');
      } catch (error) {
        return failure(error, warn);
      }
    },
  };
}

export const MEMORY_RPC_ENDPOINT = 'dsh-lpipe-memory';
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function registerMemoryRpc(ctx, handle) {
  return ctx.connection.fetch.register({
    path: `/api/${MEMORY_RPC_ENDPOINT}`, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      if (request.method !== 'POST') return new Response('method not allowed', { status: 405 });
      if (request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
        return new Response('content type must be application/json', { status: 415 });
      }
      let message;
      try { message = await request.json(); }
      catch { return new Response('body is not JSON', { status: 400 }); }
      const rpcId = message?.rpcId;
      const call = message?.payload;
      if (!isObject(message) || message.type !== 'client-request' || typeof rpcId !== 'string'
        || message.method !== MEMORY_RPC_ENDPOINT || !isObject(call) || typeof call.method !== 'string'
        || !Object.hasOwn(call, 'payload')) {
        return new Response('invalid RPC message', { status: 400 });
      }
      return Response.json({ type: 'server-response', rpcId, result: { ok: true, value: await handle(call.method, call.payload) } });
    },
  });
}
