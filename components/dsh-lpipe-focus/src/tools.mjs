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
const LAYER_FIELDS = new Set(['key', 'supersedes', ...CONTENT_FIELDS, 'work_done', 'todos', 'next']);

function checkKey(key, field) {
  if (typeof key !== 'string' || key.length > MAX_KEY_LENGTH || !KEBAB_KEY.test(key)) {
    throw new FocusToolArgsError(`${field} must be a lowercase kebab-case key of 1..${MAX_KEY_LENGTH} characters`);
  }
}

function checkText(text, field, limit) {
  if (typeof text !== 'string' || TEXT_FORBIDDEN_CONTROLS.test(text)) {
    throw new FocusToolArgsError(`${field} must be text without forbidden control characters`);
  }
  if (limit !== undefined && text.length > limit) throw new FocusToolArgsError(`${field} must be at most ${limit} characters`);
  return text.trim();
}

export function validateFocusEquateArgs(args, knownKeys, currentTodos = '') {
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
  const layer = { key, supersedes: [...refs] };
  for (const field of CONTENT_FIELDS) {
    if (Object.hasOwn(args, field)) {
      const text = checkText(args[field], field);
      if (text) layer[field] = text;
    }
  }
  if (!CONTENT_FIELDS.some(field => Object.hasOwn(layer, field))) {
    throw new FocusToolArgsError('at least one of definitions, experience, conclusions, or guidance must not be blank');
  }
  for (const [field, limit] of [['work_done'], ['next', MAX_OBJECTIVE_LENGTH]]) {
    if (Object.hasOwn(args, field)) {
      const text = checkText(args[field], field, limit);
      if (text) layer[field] = text;
    }
  }
  if (Object.hasOwn(args, 'todos')) layer.todos = checkText(args.todos, 'todos');
  const resultingTodos = layer.todos ?? currentTodos;
  if (resultingTodos && !layer.next) {
    throw new FocusToolArgsError('next must be nonblank while unfinished user work remains');
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

// The durable log, not the current surface, reserves a key. A successful receipt
// can precede its folded layer on restore. Never derive identity from message text.
export function collectFocusHistory(events, beforeSeq = Infinity) {
  const layersByKey = new Map();
  const checkpoints = new Map();
  const sources = new Map();
  let currentTodos = '';
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
          currentTodos = layer.todos ?? currentTodos;
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
        // A seed may contain only materialized messages. After the first receipt,
        // checkpoints are authoritative; an older fold can be written to the log later.
        if (!checkpoints.size && source?.kind === FOCUS_SOURCE_KIND && source.layer === 'todos'
          && typeof source.rawText === 'string' && !TEXT_FORBIDDEN_CONTROLS.test(source.rawText)) {
          currentTodos = source.rawText.trim();
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

export function createFocusEquateTool({ onDiagnostic = () => {} } = {}) {
  return {
    name: FOCUS_TOOL_NAME,
    description: [
      'Create a new equivalence layer and replace the current todo and next layers. The new equivalence layer replaces the entire surface span after the previous equivalence layer. That span will no longer be available, so preserve in the appropriate layer anything from it that can still affect how you understand the user, what you should say, or what you should do.',
      'The layers appear in this order: the latest equivalence layer, the current todo layer, then the current next layer. Existing equivalence layers remain available and are not removed merely because they are old. Use `supersedes` only for earlier equivalence-layer keys whose still-needed content is fully preserved by the new equivalence layer; a superseded layer may be removed during later compaction.',
      'Use equivalence-layer fields for durable context. Set `todos` only when the unfinished user work changes: omitting it keeps the current todo layer, a nonblank value replaces it with the complete current set of unfinished requests and questions, and an empty value clears it. The next layer is an immediate-action hint, not a record of unfinished work. Whenever the resulting todo layer is nonempty, provide a nonblank `next` that advances that work.',
      'Call this tool alone after all outstanding tool calls have returned. Use each field that applies. When a passage contains several kinds of information, split it by purpose and record each detail once.',
    ].join('\n\n'),
    parameters: {
      type: 'object', additionalProperties: false, required: ['key', 'supersedes'],
      anyOf: CONTENT_FIELDS.map(field => ({ required: [field], properties: { [field]: { pattern: '\\S' } } })),
      properties: {
        key: { type: 'string', pattern: KEY_PATTERN, maxLength: MAX_KEY_LENGTH,
          description: 'A new, unique lowercase kebab-case key for this layer.' },
        supersedes: { type: 'array',
          items: { type: 'string', pattern: KEY_PATTERN, maxLength: MAX_KEY_LENGTH },
          description: 'Keys of earlier layers this one fully replaces. Include a key only when this layer preserves everything still needed from it. Use [] if none qualify.' },
        definitions: { type: 'string',
          description: 'Preserve the conversation-specific meaning of terms and procedures that later reasoning depends on, including meanings established through use. For a provisional or disputed term, state what is understood and what remains open. Retain an earlier meaning when needed to interpret the exchange.' },
        experience: { type: 'string',
          description: 'Preserve what the next model needs to know how to do. State each reusable method or still-applicable skill rule as an instruction, with its conditions and limits. Name the skill when retaining its guidance.' },
        conclusions: { type: 'string',
          description: 'What remains established or open. Record decisions, constraints, findings, and questions the user still expects you to answer. Preserve whose position a judgment represents and the evidence or uncertainty that affects it.' },
        guidance: { type: 'string',
          description: 'Preserve preferences, agreements, and constraints that still guide choices or actions. State whose guidance it is, where it applies, and whether it expresses a preference, a shared commitment, or a requirement.' },
        work_done: { type: 'string',
          description: 'Record actions taken or attempted, their scope, and the observed result. When an action also yields guidance for future work, put that guidance in `experience`.' },
        todos: { type: 'string',
          description: 'The complete current set of unfinished user requests and questions. Set only when it changes; omit to keep the current todo layer, or use an empty value to clear it.' },
        next: { type: 'string', maxLength: MAX_OBJECTIVE_LENGTH,
          description: 'The immediate next action, not the unfinished-work record. Required and nonblank whenever the resulting todo layer is nonempty; otherwise optional. The latest user instruction takes precedence.' },
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
