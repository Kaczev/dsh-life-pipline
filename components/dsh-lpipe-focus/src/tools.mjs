export const FOCUS_TOOL_NAME = 'focus_conclude';

export const MAX_CONCLUSIONS_PER_CALL = 32;
export const MAX_KEY_LENGTH = 120;
export const MAX_TEXT_LENGTH = 16000;
export const MAX_OBJECTIVE_LENGTH = 8000;

const KEY_FORBIDDEN_CONTROLS = /[\x00-\x1f\x7f-\x9f]/u;
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

function latestAssistantToolCalls(session) {
  const events = readSessionEvents(session);
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type !== 'assistant/message') continue;
    const content = event.data?.message?.content;
    if (!Array.isArray(content)) return [];
    return content.filter((block) => block?.type === 'tool-call');
  }
  return [];
}

export function validateFocusConcludeArgs(args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) {
    throw new FocusToolArgsError('arguments must be an object');
  }
  for (const key of Object.keys(args)) {
    if (key !== 'conclusions' && key !== 'objective') {
      throw new FocusToolArgsError(`unexpected property "${key}"`);
    }
  }
  const rawConclusions = args.conclusions;
  if (!Array.isArray(rawConclusions)) {
    throw new FocusToolArgsError('conclusions must be an array');
  }
  if (rawConclusions.length < 1 || rawConclusions.length > MAX_CONCLUSIONS_PER_CALL) {
    throw new FocusToolArgsError(`conclusions must contain 1..${MAX_CONCLUSIONS_PER_CALL} items`);
  }

  const deduped = new Map();
  for (let index = 0; index < rawConclusions.length; index += 1) {
    const item = rawConclusions[index];
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new FocusToolArgsError(`conclusions[${index}] must be an object`);
    }
    for (const prop of Object.keys(item)) {
      if (prop !== 'key' && prop !== 'text') {
        throw new FocusToolArgsError(`conclusions[${index}] has unexpected property "${prop}"`);
      }
    }
    if (typeof item.key !== 'string') {
      throw new FocusToolArgsError(`conclusions[${index}].key must be a string`);
    }
    if (KEY_FORBIDDEN_CONTROLS.test(item.key)) {
      throw new FocusToolArgsError(`conclusions[${index}].key must not contain newlines or control characters`);
    }
    const trimmedKey = item.key.trim();
    if (trimmedKey.length < 1 || trimmedKey.length > MAX_KEY_LENGTH) {
      throw new FocusToolArgsError(`conclusions[${index}].key trimmed length must be 1..${MAX_KEY_LENGTH}`);
    }
    if (typeof item.text !== 'string') {
      throw new FocusToolArgsError(`conclusions[${index}].text must be a string`);
    }
    if (item.text.length > MAX_TEXT_LENGTH) {
      throw new FocusToolArgsError(`conclusions[${index}].text length must be 0..${MAX_TEXT_LENGTH}`);
    }
    if (TEXT_FORBIDDEN_CONTROLS.test(item.text)) {
      throw new FocusToolArgsError(`conclusions[${index}].text contains forbidden control characters`);
    }
    if (deduped.has(trimmedKey)) deduped.delete(trimmedKey);
    deduped.set(trimmedKey, { key: trimmedKey, text: item.text });
  }

  let objective = '';
  if (args.objective !== undefined) {
    if (typeof args.objective !== 'string') {
      throw new FocusToolArgsError('objective must be a string when provided');
    }
    if (args.objective.length > MAX_OBJECTIVE_LENGTH) {
      throw new FocusToolArgsError(`objective length must be 0..${MAX_OBJECTIVE_LENGTH}`);
    }
    if (TEXT_FORBIDDEN_CONTROLS.test(args.objective)) {
      throw new FocusToolArgsError('objective contains forbidden control characters');
    }
    objective = args.objective.trim();
  }

  return {
    entries: [...deduped.values()],
    objective,
  };
}

export function createFocusConcludeTool({ onDiagnostic = () => {} } = {}) {
  return {
    name: FOCUS_TOOL_NAME,
    description:
      'Stack concise conclusions onto the main-session conclusion layer and fold consumed raw search or file-editing steps before the next request, keeping the prompt prefix cache intact. Must be called alone without any sibling tool calls in the same response.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['conclusions'],
      properties: {
        conclusions: {
          type: 'array',
          description: 'Conclusions to stack onto the conclusion layer (1..32 items). Each item sets or updates a slot key; pass text: "" to retire an obsolete key.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['key', 'text'],
            properties: {
              key: {
                type: 'string',
                description: "Short slot identifier for same-slot supersession, e.g. 'wake.timer' or 'file.rpc'.",
              },
              text: {
                type: 'string',
                description: 'Self-contained conclusion replacing the raw search/edit steps, or "" when this key is no longer needed.',
              },
            },
          },
        },
        objective: {
          type: 'string',
          description: 'Optional single current objective for the next step. Omit or pass "" to carry forward the active user request.',
        },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['summary', 'recordedCount', 'retiredCount'],
        properties: {
          summary: { type: 'string' },
          recordedCount: { type: 'integer' },
          retiredCount: { type: 'integer' },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute(args, exec) {
      const session = exec?.agent?.session;
      const siblingCalls = latestAssistantToolCalls(session);
      if (siblingCalls.length > 1) {
        onDiagnostic({
          event: 'rejected-parallel',
          sessionId: session?.id ?? null,
          toolCallCount: siblingCalls.length,
          siblingTools: siblingCalls.map((call) => call?.name).filter(Boolean),
        });
        throw new FocusToolArgsError(
          'focus_conclude must be called alone; wait for all sibling tool results to finish first, then call focus_conclude by itself',
        );
      }
      const parsed = validateFocusConcludeArgs(args);
      const retiredCount = parsed.entries.filter((item) => item.text === '').length;
      const activeCount = parsed.entries.length - retiredCount;
      const parts = [];
      if (activeCount > 0) parts.push(`${activeCount} conclusion(s)`);
      if (retiredCount > 0) parts.push(`${retiredCount} retired key(s)`);
      const summary = `Recorded ${parts.join(' and ')}; raw steps will fold before the next request.`;
      return {
        summary,
        recordedCount: activeCount,
        retiredCount,
      };
    },
  };
}
