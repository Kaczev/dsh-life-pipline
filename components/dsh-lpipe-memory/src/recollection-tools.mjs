import { RECOLLECTION_ID_PATTERN } from './store.mjs';
import { renderSceneEntries } from './model-list.mjs';

export const RECOLLECTION_PROMPT = `## Recollections
Preserve useful experiences and context for future conversations, organizing them into scenes when appropriate. Load a relevant scene when it would help, and update a scene when useful context changes. When the conversation clearly moves away from the active scene, exit it even if no replacement scene is ready.

When no scene is active, consider loading a relevant scene or creating or updating one if useful. This is optional and should not interrupt unrelated work or force a selection.

Stay within the configured scene limit. At capacity, merge, condense, or discard lower-value information as needed, including an entire scene. Preserve useful context where practical, but do not exceed the limit.`;

const name = description => ({ type: 'string', pattern: RECOLLECTION_ID_PATTERN, minLength: 1, maxLength: 32, description });
const flag = description => ({ type: 'boolean', const: true, description });
const body = description => ({ type: 'string', minLength: 1, maxLength: 500, description });
const defines = {
  scene: {
    description: 'Pass scene alone to read without switching. Add description to create or update it. Set select to make it current. Pass an empty scene name to exit the current scene. Delete an empty scene with remove.',
    parameters: { type: 'object', additionalProperties: false, required: ['scene'], properties: {
      scene: { type: 'string', description: 'Short English scene name in kebab-case, or empty to exit.', anyOf: [{ const: '' }, { pattern: RECOLLECTION_ID_PATTERN, maxLength: 32 }] },
      description: body('When this scene is relevant.'),
      select: flag('Make this scene current for this conversation.'), remove: flag('Delete this scene.'),
    }, if: { properties: { scene: { const: '' } } }, then: { maxProperties: 1 },
    not: { required: ['remove'], anyOf: [{ required: ['description'] }, { required: ['select'] }] } },
  },
  recollection: {
    description: 'In the current scene, pass id and text to create or replace an entry. Set kind to choose or change its type. If omitted, new entries are recollections and existing entries keep their type. To delete it, pass only id and remove: true.',
    parameters: { type: 'object', additionalProperties: false, required: ['id'], properties: {
      id: name('Short, descriptive English name in kebab-case.'), text: body('Full entry text.'), kind: { type: 'string', enum: ['recollection', 'thought'], description: 'Entry type.' }, remove: flag('Delete this entry.'),
    }, oneOf: [{ required: ['text'] }, { required: ['remove'], not: { required: ['kind'] } }] },
  },
};

export function createRecollectionTool(kind, service) {
  return { name: `memory_${kind}`, ...defines[kind],
    execute: (input, exec) => service.recall(kind, input, exec?.agent, exec?.signal),
    output: { schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      render: (_, result) => [{ type: 'text', text: !result.ok ? `Memory error (${result.code}): ${result.message}`
        : result.outcome === 'exited' ? 'No scene is selected.'
        : result.entries ? renderSceneEntries('scene-recollections', result.scene, result.entries)
        : `${kind === 'scene' ? 'Scene' : 'Entry'} ${result.outcome}: ${result.id ?? result.scene}.` }],
    },
  };
}
