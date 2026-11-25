import { renderEntries } from './model-list.mjs';
import { MEMORY_ID_PATTERN } from './store.mjs';

const idField = description => ({ type: 'string', minLength: 1, maxLength: 32, pattern: MEMORY_ID_PATTERN, description });
const branch = (properties, required = []) => ({
  type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}),
});

export function parameters(kind) {
  const wish = kind === 'wishes';
  return {
    type: 'object',
    oneOf: [
      ...(wish ? [branch({})] : []),
      branch({
        action: { const: 'update', description: wish ? 'Create an entry or replace its text.' : 'Replace the text at the specified ID, or create a new entry if that ID does not exist.' },
        id: idField(wish ? 'Use the exact ID of the entry to replace. For a new entry, choose a short kebab-case ID without the reserved ui- prefix.' : 'Use the exact existing ID when editing. To create an entry, choose a short, descriptive kebab-case ID. The ui- prefix is reserved for IDs assigned by the settings page; you may only use it to edit an existing entry.'),
        text: { type: 'string', minLength: 1, maxLength: 500, description: wish ? 'The full text to store, not a description of the edit. The configured length limit may be lower than the schema maximum.' : 'Full replacement text, not an instruction for editing. The configured length limit may be lower.' },
      }, ['action', 'id', 'text']),
      branch({
        action: { const: 'remove', description: wish ? 'Delete an entry.' : 'Delete the entry with the specified ID.' },
        id: idField(wish ? 'The exact ID of the entry to delete, including its ui- prefix if present.' : 'Exact ID of the entry to delete, including ui- IDs.'),
      }, ['action', 'id']),
    ],
  };
}

const toolInfo = {
  wishes: ['memory_wish', 'Call with no arguments to read the current wish list. Use update to add or replace an entry, or remove to delete one. Each successful call returns the current list.'],
  settings: ['memory_setting', 'When enabled, the current settings appear automatically in context as a single list. This tool saves or removes a setting and reports the outcome.'],
};

function renderResult(kind, result) {
  const parts = [];
  if (!result.ok) {
    parts.push(`Memory error (${result.code}): ${result.message}`);
    if (result.field !== undefined) parts.push(`Field: ${result.field}`);
    if (result.limit !== undefined) parts.push(`Limit: ${result.limit}`);
  } else if (result.outcome) {
    const label = kind === 'wishes' ? 'Wish' : 'Setting';
    if (result.text !== undefined) {
      parts.push(`${label} ${result.outcome}.`, renderEntries('saved-setting', [result]));
    } else {
      parts.push(`${label} ${result.outcome}. [id: ${result.id}]`);
    }
  }
  if (Array.isArray(result.wishes)) parts.push(renderEntries('current-wishes', result.wishes));
  return parts.join('\n');
}

export function createMemoryTool(kind, service) {
  const [name, description] = toolInfo[kind];
  return {
    name, description, parameters: parameters(kind),
    output: {
      schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      render: (_input, result) => [{ type: 'text', text: renderResult(kind, result) }],
    },
    execute: (input, exec) => service.tool(kind, input, exec?.agent, exec?.signal),
  };
}
