import { isDeepStrictEqual } from 'node:util';
import { FOCUS_SOURCE_KIND } from './render.mjs';

export const FOCUS_TOOL_NAME = 'focus_equate';

export const MAX_KEY_LENGTH = 120;
export const MAX_OBJECTIVE_LENGTH = 8000;

const TEXT_FORBIDDEN_CONTROLS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/u;

export class FocusToolArgsError extends Error {
  constructor(violations) {
    const list = Array.isArray(violations) ? violations : [String(violations)];
    super(`invalid arguments: ${list.join('; ')}`);
    this.name = 'ToolArgsError';
    this.code = 'INVALID_ARGS';
    this.violations = list;
  }
}

export function readSessionEvents(session) {
  if (!session) return [];
  if (typeof session.snapshotEvents === 'function') {
    const events = session.snapshotEvents();
    return Array.isArray(events) ? events : [];
  }
  return Array.isArray(session.events) ? session.events : [];
}

function latestAssistantToolCalls(events) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== 'assistant/message') continue;
    const content = event.data?.message?.content;
    if (!Array.isArray(content)) return [];
    return content.filter((block) => block?.type === 'tool-call');
  }
  return [];
}

const KEY_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$';
const KEBAB_KEY = new RegExp(KEY_PATTERN, 'u');
const CONTENT_FIELDS = ['definitions', 'experience', 'conclusions', 'guidance'];
const DETAIL_FIELDS = [...CONTENT_FIELDS, 'work_done', 'todos', 'next'];
const LAYER_FIELDS = new Set(['key', 'supersedes', ...DETAIL_FIELDS]);
const DETAIL_ENTRY_FIELDS = new Set(['content', 'known', 'unknown']);

function checkKey(key, field) {
  if (typeof key !== 'string' || key.length > MAX_KEY_LENGTH || !KEBAB_KEY.test(key)) {
    throw new FocusToolArgsError(`${field} must be a lowercase kebab-case key of 1..${MAX_KEY_LENGTH} characters`);
  }
}

function checkText(text, field) {
  if (typeof text !== 'string' || TEXT_FORBIDDEN_CONTROLS.test(text)) {
    throw new FocusToolArgsError(`${field} must be text without forbidden control characters`);
  }
  return text.trim();
}

function normalizeDetailEntry(entry, field, index) {
  const location = `${field}[${index}]`;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new FocusToolArgsError(`${location} must be a detail entry object`);
  }
  for (const property of Object.keys(entry)) {
    if (!DETAIL_ENTRY_FIELDS.has(property)) throw new FocusToolArgsError(`unexpected property "${location}.${property}"`);
  }
  if (!Object.hasOwn(entry, 'content')) throw new FocusToolArgsError(`${location}.content is required`);
  const content = checkText(entry.content, `${location}.content`);
  if (!content) throw new FocusToolArgsError(`${location}.content must be nonblank`);
  const result = { content };
  for (const property of ['known', 'unknown']) {
    if (!Object.hasOwn(entry, property)) continue;
    const text = checkText(entry[property], `${location}.${property}`);
    if (!text) throw new FocusToolArgsError(`${location}.${property} must be nonblank when provided`);
    result[property] = text;
  }
  return result;
}

function normalizeDetailList(value, field) {
  if (!Array.isArray(value)) throw new FocusToolArgsError(`${field} must be a detail list array`);
  const entries = Array.from(value, (entry, index) => normalizeDetailEntry(entry, field, index));
  if (field === 'next') {
    const length = entries.reduce((total, entry) => total + entry.content.length + (entry.known?.length ?? 0) + (entry.unknown?.length ?? 0), 0);
    if (length > MAX_OBJECTIVE_LENGTH) throw new FocusToolArgsError(`next must be at most ${MAX_OBJECTIVE_LENGTH} characters`);
  }
  return entries;
}

export function validateFocusEquateArgs(args, knownKeys, currentTodos = []) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) throw new FocusToolArgsError('arguments must be an object');
  for (const field of Object.keys(args)) {
    if (!LAYER_FIELDS.has(field)) throw new FocusToolArgsError(`unexpected property "${field}"`);
  }
  const { key, supersedes } = args;
  checkKey(key, 'key');
  if (knownKeys?.has(key)) throw new FocusToolArgsError(`key "${key}" already exists; use a new key`);
  if (!Array.isArray(supersedes)) throw new FocusToolArgsError('supersedes must be an array of earlier layer keys');
  const refs = new Set();
  for (const ref of supersedes) {
    checkKey(ref, 'supersedes item');
    if (ref === key) throw new FocusToolArgsError('a layer cannot supersede itself');
    if (refs.has(ref)) throw new FocusToolArgsError(`duplicate supersedes key "${ref}"`);
    if (knownKeys && !knownKeys.has(ref)) throw new FocusToolArgsError(`unknown earlier layer key "${ref}"`);
    refs.add(ref);
  }
  if (!Array.isArray(currentTodos)) throw new FocusToolArgsError('current todos must be a detail list array');
  const layer = { key, supersedes: [...refs] };
  for (const field of DETAIL_FIELDS) {
    if (!Object.hasOwn(args, field)) continue;
    const entries = normalizeDetailList(args[field], field);
    if (entries.length || field === 'todos' || field === 'next') layer[field] = entries;
  }
  if (!CONTENT_FIELDS.some(field => layer[field]?.length)) {
    throw new FocusToolArgsError('at least one of definitions, experience, conclusions, or guidance must contain an entry');
  }
  const resultingTodos = Object.hasOwn(layer, 'todos') ? layer.todos : currentTodos;
  if (resultingTodos.length && !layer.next?.length) {
    throw new FocusToolArgsError('next must contain at least one entry while unfinished user work remains');
  }
  return layer;
}

export function readFocusLayerSource(source, knownKeys) {
  if (source?.kind !== FOCUS_SOURCE_KIND || source.layer !== 'equivalence') return null;
  const { kind, layer, createdAt, ...args } = source;
  if (Object.hasOwn(args, 'todos') || Object.hasOwn(args, 'next')) return null;
  try {
    return validateFocusEquateArgs(args, knownKeys);
  } catch (error) {
    if (error instanceof FocusToolArgsError) return null;
    throw error;
  }
}

function normalizeSeedTodos(source) {
  try {
    if (Object.hasOwn(source, 'entries')) return normalizeDetailList(source.entries, 'todos');
    return null;
  } catch (error) {
    if (error instanceof FocusToolArgsError) return null;
    throw error;
  }
}

// The durable log, not the current surface, reserves a key. A successful receipt
// can precede its folded layer on restore. Never derive identity from message text.
export function collectFocusHistory(events, beforeSeq = Infinity) {
  const layersByKey = new Map();
  const checkpoints = new Map();
  const sources = new Map();
  let currentTodos = [];
  let pending = null;
  for (const ev of events) {
    if (ev.seq >= beforeSeq) break;
    const data = ev.data;
    switch (ev.type) {
      case 'assistant/message': {
        const content = data?.message?.content;
        const calls = Array.isArray(content) ? content.filter(b => b?.type === 'tool-call') : [];
        const call = calls[0];
        pending = !data?.interrupted && Number.isSafeInteger(data?.turn) && Number.isSafeInteger(data?.step)
          && calls.length === 1 && call.name === FOCUS_TOOL_NAME && typeof call.id === 'string' && call.id
          ? { seq: ev.seq, id: call.id, turn: data.turn, step: data.step, raw: call.arguments ?? call.input } : null;
        break;
      }
      case 'tool/call':
        if (pending) {
          if (pending.traced || data?.name !== FOCUS_TOOL_NAME || data.callId !== pending.id || data.turn !== pending.turn || data.step !== pending.step) pending = null;
          else { pending.trace = data.arguments; pending.traced = true; }
        }
        break;
      case 'tool/result': {
        const match = pending;
        pending = null;
        const msg = data?.message;
        if (!match || !msg || data.turn !== match.turn || data.step !== match.step || msg.isError || data.error !== undefined
          || (msg.toolCallId ?? msg.source?.callId) !== match.id || (msg.source?.callId !== undefined && msg.source.callId !== match.id)) break;
        try {
          const decode = raw => typeof raw === 'string' ? JSON.parse(raw) : raw;
          const args = decode(match.raw ?? match.trace);
          const layer = validateFocusEquateArgs(args, layersByKey, currentTodos);
          if (match.traced && match.raw != null && match.trace !== match.raw
            && !isDeepStrictEqual(layer, validateFocusEquateArgs(decode(match.trace), layersByKey, currentTodos))) break;
          currentTodos = Object.hasOwn(layer, 'todos') ? layer.todos : currentTodos;
          checkpoints.set(match.seq, { layer, args, currentTodos });
          layersByKey.set(layer.key, layer);
        } catch (error) {
          if (!(error instanceof FocusToolArgsError || error instanceof SyntaxError)) throw error;
        }
        break;
      }
      case 'user/message': {
        pending = null;
        const source = data?.source;
        // A seed may contain only materialized messages. Structured entries are authoritative.
        if (!checkpoints.size && source?.kind === FOCUS_SOURCE_KIND && source.layer === 'todos') {
          currentTodos = normalizeSeedTodos(source) ?? currentTodos;
        }
        const layer = readFocusLayerSource(source);
        if (!layer || layer.supersedes.some(key => !layersByKey.has(key))) break;
        const prior = layersByKey.get(layer.key);
        if (prior) {
          const { todos, next, ...materialized } = prior;
          if (!isDeepStrictEqual(materialized, layer)) break;
        }
        layersByKey.set(layer.key, layer);
        sources.set(ev.seq, layer);
        break;
      }
      case 'system/message': case 'developer/message': case 'step/start': case 'step/end': case 'turn/start': case 'turn/end':
        pending = null;
        break;
    }
  }
  return { keys: new Set(layersByKey.keys()), checkpoints, sources, currentTodos };
}

function detailListSchema(description) {
  return {
    type: 'array', description,
    items: {
      type: 'object', additionalProperties: false, required: ['content'],
      properties: {
        content: { type: 'string', pattern: '\\S', description: 'One self-contained point that can be understood without the messages it replaces.' },
        known: { type: 'string', pattern: '\\S', description: 'An established detail whose omission would change how the point is understood, used, or verified.' },
        unknown: { type: 'string', pattern: '\\S', description: 'A specific unresolved detail whose answer could change a later judgment or action.' },
      },
    },
  };
}

export function createFocusEquateTool({ onDiagnostic = () => {} } = {}) {
  return {
    name: FOCUS_TOOL_NAME,
    description: [
      'Call `focus_equate` alone after all outstanding tool calls have returned. The new layer replaces the span after the most recent equivalence layer through this call’s successful result. On the first fold, the span starts after the fixed opening instructions. Later messages stay in order.',
      'Record each point once, in the field where it serves its purpose. Include at least one entry in `definitions`, `experience`, `conclusions`, or `guidance`. Earlier layers remain unless superseded. Before replacing one, carry forward everything in it that still matters, even if it is not needed for the next step.',
      'Omit `todos` when the outstanding work is unchanged. To update it, supply the complete remaining list; `[]` clears it. Each call replaces `next`. If todos remain, include at least one next action. Otherwise, omit `next` or pass `[]` to clear it.',
    ].join('\n\n'),
    parameters: {
      type: 'object', additionalProperties: false, required: ['key', 'supersedes'],
      anyOf: CONTENT_FIELDS.map(field => ({ required: [field], properties: { [field]: { minItems: 1 } } })),
      properties: {
        key: { type: 'string', pattern: KEY_PATTERN, maxLength: MAX_KEY_LENGTH,
          description: 'A new, unique lowercase kebab-case key for this layer.' },
        supersedes: { type: 'array',
          items: { type: 'string', pattern: KEY_PATTERN, maxLength: MAX_KEY_LENGTH },
          description: 'Keys of earlier equivalence layers this layer fully replaces; `[]` if none.' },
        definitions: detailListSchema('Conversation-specific meanings of terms and procedures, including where each meaning applies.'),
        experience: detailListSchema('Reusable methods, when they apply, and their limits. Name the source skill when retaining its guidance.'),
        conclusions: detailListSchema('Decisions, findings, and judgments. For a decision, identify who agreed to what. For a finding or judgment, state its basis and what that basis supports.'),
        guidance: detailListSchema('Preferences, agreements, and requirements that guide later choices, with their source, scope, and degree of obligation.'),
        work_done: detailListSchema('Actions taken or attempted, their scope, and their observed outcomes. Distinguish a verified result from an attempt whose outcome is unknown.'),
        todos: detailListSchema('All deliverables, commitments, and answers still owed to the user, including deferred work.'),
        next: detailListSchema('Immediate actions in execution order, with any prerequisites. The user’s latest instruction takes precedence.'),
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'key'],
        properties: { summary: { type: 'string' }, key: { type: 'string' } },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute(args, exec) {
      const session = exec?.agent?.session;
      const events = readSessionEvents(session);
      const siblingCalls = latestAssistantToolCalls(events);
      if (siblingCalls.length > 1) {
        onDiagnostic({
          event: 'rejected-parallel',
          sessionId: session?.id ?? null,
          toolCallCount: siblingCalls.length,
          siblingTools: siblingCalls.map((call) => call?.name).filter(Boolean),
        });
        throw new FocusToolArgsError(
          `${FOCUS_TOOL_NAME} must be called alone; wait for all sibling tool results to finish first`,
        );
      }
      const { keys, currentTodos } = collectFocusHistory(events);
      const { key } = validateFocusEquateArgs(args, keys, currentTodos);
      return { key, summary: `Recorded equivalence layer [${key}].` };
    },
  };
}
