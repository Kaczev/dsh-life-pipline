import assert from 'node:assert/strict';
import test from 'node:test';
import { FOCUS_SYSTEM_PROMPT } from '../src/prompt.mjs';
import { buildFocusLayerMessage, buildObjectiveMessage, buildTodoMessage } from '../src/render.mjs';
import { collectFocusHistory, createFocusEquateTool, validateFocusEquateArgs } from '../src/tools.mjs';

const fields = ['definitions', 'experience', 'conclusions', 'guidance'];
const listFields = [...fields, 'work_done', 'todos', 'next'];
const point = content => [{ content }];
const layer = (key, supersedes = []) => ({ key, supersedes, conclusions: point(`Verified ${key}.`) });
const user = (seq, source) => ({ seq, type: 'user/message', data: { source } });
const source = args => ({ kind: 'dsh-lpipe-focus', layer: 'equivalence', ...args });
const stored = (seq, data) => user(seq, buildFocusLayerMessage(data, seq).source);
const call = (seq, id, args, name = 'focus_equate') => ({ seq, type: 'assistant/message', data: { turn: 1, step: 2,
  message: { content: [{ type: 'tool-call', id, name, arguments: JSON.stringify(args) }] } } });
const receipt = (seq, id, overrides = {}) => ({ seq, type: 'tool/result', data: { turn: 1, step: 2,
  message: { toolCallId: id, source: { callId: id } }, ...overrides } });
const trace = (seq, id, args) => ({ seq, type: 'tool/call', data: { turn: 1, step: 2,
  callId: id, name: 'focus_equate', arguments: JSON.stringify(args) } });

test('system prompt defines when to fold and the tool describes the inclusive replacement span', () => {
  assert.equal(FOCUS_SYSTEM_PROMPT, [
    '## Context equivalence (`focus_equate`)',
    '',
    'An equivalence layer takes the place of part of the conversation. After a fold, the original messages in that span are unavailable. Preserve enough for the next model to understand the user, answer what is still due, and continue the work in the language and context of the exchange. Once a piece of work has produced a result, fold before starting the next substantive piece. Decisions, corrections, and open questions can also accumulate across short exchanges. If your next reply or action depends on those details, fold before using them. Otherwise, answer or ask the user directly.',
  ].join('\n'));
  assert.equal(createFocusEquateTool().description.split('\n\n')[0],
    'Call `focus_equate` alone after all outstanding tool calls have returned. The span starts immediately after the most recent equivalence layer. On the first fold, it starts after the fixed opening instructions. It ends with the successful tool result for this call, inclusive. The new equivalence layer takes that span’s place, followed by the current todo and next layers when present. Messages after the tool result stay in their original order.');
});

test('seven detail lists share the entry contract and at least one of four durable fields has entries', async () => {
  const tool = createFocusEquateTool();
  const base = { key: 'contract', supersedes: [] };
  const schema = tool.parameters;
  assert.equal(tool.name, 'focus_equate');
  assert.deepEqual(schema.required, ['key', 'supersedes']);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties), ['key', 'supersedes', ...listFields]);
  assert.deepEqual(schema.anyOf.map(branch => branch.required), fields.map(field => [field]));
  for (const field of listFields) {
    const list = schema.properties[field];
    assert.match(list.description, /detail list/i);
    assert.equal(list.type, 'array');
    assert.equal(list.items.type, 'object');
    assert.equal(list.items.additionalProperties, false);
    assert.deepEqual(list.items.required, ['content']);
    assert.deepEqual(Object.keys(list.items.properties).sort(), ['content', 'known', 'unknown']);
    for (const property of Object.values(list.items.properties)) assert.equal(property.type, 'string');
    for (const malformed of ['legacy text', 7, null, {}, ['text'], [null], [{}], [{ content: 3 }],
      [{ content: ' \n\t' }], [{ content: 'a\x00b' }], [{ content: 'OK', known: 7 }],
      [{ content: 'OK', unknown: null }], [{ content: 'OK', typo: 'unknown' }],
      [{ content: 'OK', known: 'bad\x00text' }], [{ content: 'OK', unknown: 'bad\x00text' }]]) {
      await assert.rejects(tool.execute({ ...layer('contract'), next: point('Continue.'), [field]: malformed }), { code: 'INVALID_ARGS' }, field);
    }
  }
  for (const branch of schema.anyOf) assert.equal(branch.properties[branch.required[0]].minItems, 1);
  for (let mask = 1; mask < 2 ** fields.length; mask++) {
    const args = { ...base };
    for (const [i, field] of fields.entries()) if (mask & (1 << i)) args[field] = point(field);
    assert.deepEqual(validateFocusEquateArgs(args), args);
    assert.equal((await tool.execute(args)).key, base.key);
  }
  for (const extra of [{}, { work_done: point('Done.'), next: point('Continue.') },
    { todos: point('Unfinished.'), next: point('Continue.') }, Object.fromEntries(fields.map(f => [f, []])),
    { result: 'Obsolete.', conclusions: point('Otherwise valid.') }]) {
    await assert.rejects(tool.execute({ ...base, ...extra }), { code: 'INVALID_ARGS' });
  }
});

test('todos replace, persist when omitted, clear with [], and require a fresh nonempty next', async () => {
  const tool = createFocusEquateTool();
  const base = layer('todos-start');
  const initialTodos = point('Finish the audit.');
  const events = [user(0, buildTodoMessage(initialTodos, 0).source)];
  const execute = args => tool.execute(args, { agent: { session: { snapshotEvents: () => events } } });
  assert.deepEqual(collectFocusHistory(events).currentTodos, initialTodos);
  for (const extra of [{}, { next: [] }, { todos: point('New task.') }, { todos: point('New task.'), next: [] }]) {
    const args = { ...base, ...extra };
    await assert.rejects(execute(args), { code: 'INVALID_ARGS' });
    assert.deepEqual(collectFocusHistory([...events, call(1, 'bad', args), receipt(2, 'bad')]), collectFocusHistory(events));
  }
  const failed = collectFocusHistory([...events, call(1, 'failed', { ...base, todos: [] }), receipt(2, 'failed', { error: { code: 'INVALID_ARGS' } })]);
  assert.deepEqual(failed, collectFocusHistory(events), 'a failed clear neither reserves a key nor changes todos');
  const replacement = { ...base, todos: [{ content: 'Review files.', known: 'Three remain.', unknown: 'Which changed?' }], next: point('Inspect the last file.') };
  assert.equal((await execute(replacement)).key, replacement.key);
  events.push(call(1, 'replace', replacement), receipt(2, 'replace'), stored(3, replacement));
  assert.deepEqual(collectFocusHistory(events).checkpoints.get(1), { layer: replacement, args: replacement, currentTodos: replacement.todos });
  const keep = { ...layer('todos-kept'), next: point('Compare the results.') };
  assert.equal((await execute(keep)).key, keep.key);
  events.push(call(4, 'keep', keep), receipt(5, 'keep'), stored(6, keep));
  assert.deepEqual(collectFocusHistory(events).currentTodos, replacement.todos);
  const clear = { ...layer('todos-cleared'), todos: [] };
  assert.equal((await execute(clear)).key, clear.key);
  events.push(call(7, 'clear', clear), receipt(8, 'clear'), stored(9, clear));
  assert.deepEqual(collectFocusHistory(events).currentTodos, []);
  assert.equal((await execute(layer('after-clear'))).key, 'after-clear');
});

test('replay ignores string detail fields in both receipts and equivalence sources', () => {
  const invalid = { ...layer('review'), guidance: 'Read only.' };
  const events = [call(0, 'review', invalid), receipt(1, 'review'), user(2, source(invalid))];
  assert.deepEqual(collectFocusHistory(events), collectFocusHistory([]));
});

test('todo seeds restore structured entries and ignore missing or malformed entries', () => {
  const entries = [{ content: 'Review files.', known: 'Three remain.', unknown: 'Which changed?' }, { content: 'Report findings.' }];
  const seed = buildTodoMessage(entries, 10).source;
  const textOnly = { kind: seed.kind, layer: seed.layer, rawText: 'Stale task.' };
  for (const invalid of [textOnly, { ...textOnly, entries: 'invalid' }, { ...textOnly, entries: [{ known: 'Missing content.' }] }]) {
    assert.deepEqual(collectFocusHistory([user(0, invalid)]).currentTodos, []);
    assert.deepEqual(collectFocusHistory([user(0, seed), user(1, invalid)]).currentTodos, entries);
  }
});

test('multiline entries keep their Markdown hierarchy in all three layers', () => {
  const entries = [
    { content: 'First line\r\nsecond line', known: 'Confirmed\nwith a source', unknown: 'Pending\rreview' },
    { content: 'Known only', known: 'Verified' },
    { content: 'Unknown only', unknown: 'Which version?' },
    { content: 'Last item' },
  ];
  const list = [
    '- First line', '  second line',
    '  - Known: Confirmed', '    with a source',
    '  - Unknown: Pending', '    review',
    '- Known only', '  - Known: Verified',
    '- Unknown only', '  - Unknown: Which version?',
    '- Last item',
  ].join('\n');
  const equivalence = buildFocusLayerMessage({ key: 'review', supersedes: ['prior'], experience: [], guidance: point('Read only.'), conclusions: entries });
  assert.equal(equivalence.content[0].text, [
    '<equivalence key="review">', 'Supersedes: prior', '',
    '## Guidance', '', '- Read only.', '', '## Conclusions', '', list, '</equivalence>',
  ].join('\n'));
  const todo = buildTodoMessage(entries);
  const next = buildObjectiveMessage({ entries, origin: 'model' });
  assert.equal(todo.content[0].text, `<current-todos>\n${list}\n</current-todos>`);
  assert.equal(next.content[0].text, [
    '<current-objective>', "Next-step hint from the last equivalence layer. The user's latest instructions take precedence:", list, '</current-objective>',
  ].join('\n'));
  for (const { source } of [todo, next]) {
    assert.deepEqual(source.entries, entries);
    assert.equal(source.rawText, list);
  }
});

test('all three rendered layers keep entries ordered, escape embedded end tags, and retain original source text', () => {
  for (const tag of ['equivalence', 'current-todos', 'current-objective']) {
    const close = `</${tag}>`;
    const entries = [{ content: `first ${close}`, known: `confirmed ${close}`, unknown: `unverified ${close}` }, { content: 'last item' }];
    const msg = tag === 'equivalence' ? buildFocusLayerMessage({ ...layer('escaped'), conclusions: entries }, 1)
      : tag === 'current-todos' ? buildTodoMessage(entries, 1) : buildObjectiveMessage({ entries, origin: 'model', now: 1 });
    assert.deepEqual(tag === 'equivalence' ? msg.source.conclusions : msg.source.entries, entries);
    const text = msg.content[0].text;
    assert.ok(text.endsWith(close));
    assert.equal(text.split(close).length, 2, 'the renderer owns the only literal closing tag');
    for (const display of tag === 'equivalence' ? [text] : [text, msg.source.rawText]) {
      assert.doesNotMatch(display, /\[object Object\]/);
      assert.match(display, /first[\s\S]*confirmed[\s\S]*unverified[\s\S]*last item/);
      assert.match(display, /\bknown\b/i);
      assert.match(display, /\bunknown\b/i);
    }
  }
  assert.equal(buildTodoMessage([]), null);
});

test('sources trust earlier keys and identical materializations, not text, bad references or conflicting rewrites', () => {
  const a = layer('first'), b = { ...layer('second', ['first']), definitions: point('Clean excludes cache hits.'), experience: point('Clear the cache first.'), guidance: point('Read-only checks.'), work_done: point('Read both manifests.'), next: point('Compare their licenses.') };
  const events = [stored(0, a), call(1, 'second-call', b), receipt(2, 'second-call'), stored(3, b), stored(4, b),
    ...[...fields, 'work_done'].map((field, i) => stored(5 + i, { ...b, [field]: point('Changed.') })),
    stored(10, layer('future-reference', ['future'])), stored(11, layer('future')),
    user(12, { kind: 'user', layer: 'equivalence', ...layer('not-a-key') }), user(13, source({ ...a, conclusions: [] }))];
  const history = collectFocusHistory(events);
  assert.deepEqual([...history.keys], ['first', 'second', 'future']);
  assert.deepEqual([...history.sources.keys()], [0, 3, 4, 11]);
  assert.equal('next' in history.sources.get(3), false);
  assert.deepEqual([...history.checkpoints], [[1, { layer: b, args: b, currentTodos: [] }]]);
  assert.deepEqual([...collectFocusHistory(events, 2).keys], ['first']);
});

test('historical tool names and sources never reserve keys; mixed result sources also fail closed', () => {
  const old = { key: 'old', supersedes: [], result: 'Previous format.' };
  const history = collectFocusHistory([call(0, 'c', layer('other'), 'focus_conclude'), receipt(1, 'c'),
    call(2, 'd', old), receipt(3, 'd'), user(4, { kind: 'dsh-lpipe-focus', layer: 'conclusion', ...old }),
    user(5, source(old)), user(6, source({ ...old, conclusions: 'Mixed.' }))]);
  assert.equal(history.keys.size, 0);
  assert.equal(history.checkpoints.size, 0);
  assert.equal(history.sources.size, 0);
});

test('long durable fields are admitted, rendered and replayed without a Focus length cap', async () => {
  const args = layer('long-layer');
  const tool = createFocusEquateTool();
  for (const [i, field] of [...fields, 'work_done'].entries()) args[field] = point(String(i).repeat(520000));
  assert.equal((await tool.execute(args)).key, args.key);
  const message = buildFocusLayerMessage(args);
  for (const field of [...fields, 'work_done']) assert.ok(message.content[0].text.includes(args[field][0].content));
  const history = collectFocusHistory([call(0, 'c', args), receipt(1, 'c'), user(2, message.source)]);
  assert.deepEqual(history.checkpoints.get(0), { layer: args, args, currentTodos: [] });
  assert.deepEqual(history.sources.get(2), args);
});

test('supersedes duplicates are rejected at runtime without an unsupported schema constraint', async () => {
  const tool = createFocusEquateTool();
  assert.equal(Object.hasOwn(tool.parameters.properties.supersedes, 'uniqueItems'), false);
  const events = [stored(0, layer('old'))];
  await assert.rejects(tool.execute(layer('new', ['old', 'old']), { agent: { session: { snapshotEvents: () => events } } }), /duplicate supersedes key/);
});

test('tool execute accepts a prior pending success but rejects duplicates and unsuccessful or future references', async () => {
  const a = layer('pending-a'), b = layer('pending-b', ['pending-a']);
  const events = [call(0, 'a', a), receipt(1, 'a'), call(2, 'b', b)];
  const tool = createFocusEquateTool();
  const execute = args => tool.execute(args, { agent: { session: { snapshotEvents: () => events } } });
  assert.equal((await execute(b)).key, 'pending-b');
  await assert.rejects(execute(a), /already exists/);
  await assert.rejects(execute(layer('unknown', ['pending-b'])), /unknown earlier layer/);
  events.push(receipt(3, 'b', { error: { code: 'INVALID_ARGS' } }));
  await assert.rejects(execute(layer('unknown', ['pending-b'])), /unknown earlier layer/);
});

test('replayed success requires one identified call and matching execution evidence', () => {
  const a = layer('trace-a');
  assert.deepEqual([...collectFocusHistory([call(0, 'a'), trace(1, 'a', a), receipt(2, 'a')]).keys], [a.key]);
  for (const events of [
    [call(0, 'a', a), trace(1, 'a', layer('different')), receipt(2, 'a')],
    [call(0, 'a', a), trace(1, 'a', { ...a, conclusions: [{ ...a.conclusions[0], known: 'Changed evidence.' }] }), receipt(2, 'a')],
    [call(0, 'a', a), trace(1, 'a', { ...a, next: point('Different hint.') }), receipt(2, 'a')],
    [call(0, 'a', a), trace(1, 'other', a), receipt(2, 'a')],
    [call(0, 'a', a), receipt(1, 'a', { message: { toolCallId: 'a', source: { callId: 'other' } } })],
    [call(0, 'a', a), receipt(1, 'a', { step: 3 })],
    [call(0, 'a', a), receipt(1, 'a', { message: { toolCallId: 'a', isError: true } })],
    [call(0, 'a', a), user(1, { kind: 'user' }), receipt(2, 'a')],
  ]) assert.equal(collectFocusHistory(events).checkpoints.size, 0);
});
