import { MEMORY_ID_PATTERN } from './store.mjs';

const idField = description => ({ type: 'string', minLength: 1, maxLength: 32, pattern: MEMORY_ID_PATTERN, description });
const branch = (properties, required = []) => ({
  type: 'object', additionalProperties: false, properties, ...(required.length ? { required } : {}),
});

export function parameters(kind) {
  return {
    type: 'object',
    oneOf: [
      ...(kind === 'wishes' ? [branch({})] : []),
      branch({
        action: { const: 'update', description: 'Replace the text at the specified ID, or create a new entry if that ID does not exist.' },
        id: idField('Use the exact existing ID when editing. To create an entry, choose a short, descriptive kebab-case ID. The ui- prefix is reserved for IDs assigned by the settings page; you may only use it to edit an existing entry.'),
        text: { type: 'string', minLength: 1, maxLength: 500, description: 'Full replacement text, not an instruction for editing. The configured length limit may be lower.' },
      }, ['action', 'id', 'text']),
      branch({
        action: { const: 'remove', description: 'Delete the entry with the specified ID.' },
        id: idField('Exact ID of the entry to delete, including ui- IDs.'),
      }, ['action', 'id']),
    ],
  };
}

const toolInfo = {
  wishes: ['memory_wish', 'Wishes are not added to context automatically. This tool returns the current wish list, including after a write.'],
  settings: ['memory_setting', 'When enabled, the current settings appear automatically in context as a single list. This tool saves or removes a setting and reports the outcome.'],
};

export function createMemoryTool(kind, service) {
  const [name, description] = toolInfo[kind];
  return {
    name, description, parameters: parameters(kind),
    output: {
      schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      render: (_input, result) => [{ type: 'text', text: JSON.stringify(result) }],
    },
    execute: (input, exec) => service.tool(kind, input, exec?.agent, exec?.signal),
  };
}
