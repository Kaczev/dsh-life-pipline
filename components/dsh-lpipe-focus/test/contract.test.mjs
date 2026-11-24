import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFocusLayerMessage, buildObjectiveMessage, buildTodoMessage } from '../src/render.mjs';
import { collectFocusHistory, createFocusEquateTool, validateFocusEquateArgs } from '../src/tools.mjs';

const fields = ['definitions', 'experience', 'conclusions', 'guidance'];
const layer = (key, supersedes = []) => ({ key, supersedes, conclusions: `Verified ${key}.` });
const user = (seq, source) => ({ seq, type: 'user/message', data: { source } });
const stored = (seq, data) => user(seq, buildFocusLayerMessage(data, seq).source);
const call = (seq, id, args, name = 'focus_equate') => ({ seq, type: 'assistant/message', data: { turn: 1, step: 2,
  message: { content: [{ type: 'tool-call', id, name, arguments: JSON.stringify(args) }] } } });
const receipt = (seq, id, overrides = {}) => ({ seq, type: 'tool/result', data: { turn: 1, step: 2,
  message: { toolCallId: id, source: { callId: id } }, ...overrides } });
const trace = (seq, id, args) => ({ seq, type: 'tool/call', data: { turn: 1, step: 2,
  callId: id, name: 'focus_equate', arguments: JSON.stringify(args) } });

test('at least one content field is nonblank; work_done, todos and next never count', async () => {
  const tool = createFocusEquateTool();
  const base = { key: 'contract', supersedes: [] };
  assert.equal(tool.name, 'focus_equate');
  assert.deepEqual(tool.parameters.required, ['key', 'supersedes']);
  assert.equal(tool.parameters.additionalProperties, false);
  assert.deepEqual(Object.keys(tool.parameters.properties), ['key', 'supersedes', ...fields, 'work_done', 'todos', 'next']);
  assert.deepEqual(tool.parameters.anyOf, fields.map(field => ({ required: [field], properties: { [field]: { pattern: '\\S' } } })));
  for (let mask = 1; mask < 2 ** fields.length; mask++) {
    const args = { ...base }, expected = { ...base };
    for (const [i, field] of fields.entries()) {
      args[field] = mask & (1 << i) ? `  ${field}  ` : '\t';
      if (mask & (1 << i)) expected[field] = field;
    }
    assert.deepEqual(validateFocusEquateArgs(args), expected);
    assert.equal((await tool.execute(args)).key, base.key);
  }
  for (const extra of [{}, { work_done: 'Done.', next: 'Continue.' }, { todos: 'Unfinished.', next: 'Continue.' }, { definitions: ' ', experience: '\t', conclusions: '\n', guidance: '  ' },
    { result: 'Obsolete.', conclusions: 'Otherwise valid.' }, ...fields.map(field => ({ conclusions: 'OK', [field]: 7 })),
    ...fields.map(field => ({ conclusions: 'OK', [field]: '\x00' }))]) {
    await assert.rejects(tool.execute({ ...base, ...extra }), { code: 'INVALID_ARGS' });
  }
});

test('todos replace, persist when omitted, clear with an empty string, and require a fresh next', async () => {
  const tool = createFocusEquateTool();
  const base = { key: 'todos-start', supersedes: [], conclusions: 'Recorded current work.' };
  const todo = { kind: 'dsh-lpipe-focus', layer: 'todos', rawText: 'Finish the audit.' };
  const events = [user(0, todo)];
  const execute = args => tool.execute(args, { agent: { session: { snapshotEvents: () => events } } });

  for (const extra of [{}, { next: ' \t' }, { todos: 'New task.' }, { todos: 'New task.', next: ' ' },
    { todos: ['Not a string.'], next: 'Start.' }, { todos: 'bad\x00text', next: 'Start.' }]) {
    const args = { ...base, ...extra };
    await assert.rejects(execute(args), { code: 'INVALID_ARGS' });
    const replay = collectFocusHistory([...events, call(1, 'invalid', args), receipt(2, 'invalid')]);
    assert.deepEqual(replay, collectFocusHistory(events), 'even a success-looking receipt cannot commit invalid args');
  }
  const failedClear = { ...base, todos: '' };
  const failed = collectFocusHistory([...events, call(1, 'failed', failedClear), receipt(2, 'failed', { error: { code: 'INVALID_ARGS' } })]);
  assert.deepEqual(failed, collectFocusHistory(events), 'an unsuccessful clear neither reserves a key nor changes todos');

  const replacement = { ...base, todos: 'Review remaining files.', next: 'Inspect the last file.' };
  assert.equal((await execute(replacement)).key, replacement.key);
  events.push(call(1, 'replace', replacement), receipt(2, 'replace'), stored(3, replacement));
  assert.equal(collectFocusHistory(events).currentTodos, replacement.todos);
  assert.deepEqual(collectFocusHistory(events).checkpoints.get(1), { layer: replacement, args: replacement, currentTodos: replacement.todos });

  const keep = { key: 'todos-kept', supersedes: [], experience: 'Continue the established review.', next: 'Compare the results.' };
  assert.equal((await execute(keep)).key, keep.key);
  events.push(call(4, 'keep', keep), receipt(5, 'keep'), stored(6, keep));
  assert.equal(collectFocusHistory(events).currentTodos, replacement.todos, 'omission retains the current todos');

  const emptyWithoutNext = { key: 'todos-cleared', supersedes: [], conclusions: 'The review is complete.', todos: '' };
  assert.equal((await execute(emptyWithoutNext)).key, emptyWithoutNext.key, 'empty todos clears without requiring next');
  events.push(call(7, 'clear', emptyWithoutNext), receipt(8, 'clear'), stored(9, emptyWithoutNext));
  assert.equal(collectFocusHistory(events).currentTodos, '');

  const afterClear = { key: 'after-clear', supersedes: [], conclusions: 'No unfinished work remains.' };
  assert.equal((await execute(afterClear)).key, afterClear.key, 'omitted todos after a clear do not require next');
});

test('todo and next render as separate sourced messages; next remains objective', () => {
  const todo = buildTodoMessage('  Review the remaining files.  ', 123);
  assert.equal(todo.content[0].text, `<current-todos>\n${todo.source.rawText}\n</current-todos>`);
  assert.deepEqual(todo.source, { kind: 'dsh-lpipe-focus', layer: 'todos', rawText: 'Review the remaining files.', createdAt: 123 });
  const next = buildObjectiveMessage({ rawText: 'Inspect the last file.', origin: 'model', now: 456 });
  assert.equal(next.source.layer, 'objective');
  assert.equal(next.source.rawText, 'Inspect the last file.');
  assert.ok(next.content[0].text.includes(next.source.rawText));
  assert.equal(buildTodoMessage('  '), null);
});

test('sources trust earlier keys and identical materializations, not text, bad references or conflicting rewrites', () => {
  const a = layer('first'), b = { ...layer('second', ['first']), definitions: 'Clean excludes cache hits.', experience: 'Clear the cache first.', guidance: 'The user prefers read-only checks.', work_done: 'Read both manifests.', next: 'Compare their licenses.' };
  const events = [
    stored(0, a), call(1, 'second-call', b), receipt(2, 'second-call'), stored(3, b),
    stored(4, b), ...[...fields, 'work_done'].map((field, i) => stored(5 + i, { ...b, [field]: 'Changed.' })),
    stored(10, layer('future-reference', ['future'])), stored(11, layer('future')),
    user(12, { kind: 'user', layer: 'equivalence', ...layer('not-a-key') }),
    stored(13, { ...a, conclusions: ' ' }),
  ];
  const history = collectFocusHistory(events);
  assert.deepEqual([...history.keys], ['first', 'second', 'future']);
  assert.deepEqual([...history.sources.keys()], [0, 3, 4, 11]);
  assert.equal('next' in history.sources.get(3), false, 'next belongs to the separate prompt');
  assert.deepEqual([...history.checkpoints], [[1, { layer: b, args: b, currentTodos: '' }]]);
  assert.deepEqual([...collectFocusHistory(events, 2).keys], ['first'], 'a call alone does not reserve a key');
});

test('historical tool names and sources never reserve keys; mixed result sources also fail closed', () => {
  const old = { key: 'old', supersedes: [], result: 'Previous format.' };
  const history = collectFocusHistory([call(0, 'c', layer('other'), 'focus_conclude'), receipt(1, 'c'),
    call(2, 'd', old), receipt(3, 'd'), user(4, { kind: 'dsh-lpipe-focus', layer: 'conclusion', ...old }),
    user(5, { kind: 'dsh-lpipe-focus', layer: 'equivalence', ...old }),
    user(6, { kind: 'dsh-lpipe-focus', layer: 'equivalence', ...old, conclusions: 'Mixed.' })]);
  assert.equal(history.keys.size, 0);
  assert.equal(history.checkpoints.size, 0);
  assert.equal(history.sources.size, 0);
});

test('long content fields and work_done are admitted, rendered and replayed without a Focus length cap', async () => {
  const args = { key: 'long-layer', supersedes: [] };
  const tool = createFocusEquateTool();
  for (const [i, field] of [...fields, 'work_done'].entries()) {
    assert.equal(tool.parameters.properties[field].maxLength, undefined);
    args[field] = String(i).repeat(520000);
  }
  assert.equal((await tool.execute(args)).key, args.key);
  const message = buildFocusLayerMessage(args);
  assert.equal(message.source.layer, 'equivalence');
  for (const field of [...fields, 'work_done']) assert.ok(message.content[0].text.includes(args[field]));
  const history = collectFocusHistory([call(0, 'c', args), receipt(1, 'c'), user(2, message.source)]);
  assert.deepEqual(history.checkpoints.get(0), { layer: args, args, currentTodos: '' });
  assert.deepEqual(history.sources.get(2), args);
});

test('supersedes duplicates are rejected at runtime without an unsupported schema constraint', async () => {
  const tool = createFocusEquateTool();
  assert.equal(Object.hasOwn(tool.parameters.properties.supersedes, 'uniqueItems'), false);
  const events = [stored(0, layer('old'))];
  await assert.rejects(
    tool.execute(layer('new', ['old', 'old']), { agent: { session: { snapshotEvents: () => events } } }),
    /duplicate supersedes key/,
  );
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
  assert.deepEqual([...collectFocusHistory([call(0, 'a'), trace(1, 'a', a), receipt(2, 'a')]).keys], [a.key], 'exact-step trace can supply missing assistant arguments');
  for (const events of [
    [call(0, 'a', a), trace(1, 'a', layer('different')), receipt(2, 'a')],
    [call(0, 'a', a), trace(1, 'a', { ...a, definitions: 'Different meaning.' }), receipt(2, 'a')],
    [call(0, 'a', a), trace(1, 'a', { ...a, next: 'Different hint.' }), receipt(2, 'a')],
    [call(0, 'a', a), trace(1, 'other', a), receipt(2, 'a')],
    [call(0, 'a', a), receipt(1, 'a', { message: { toolCallId: 'a', source: { callId: 'other' } } })],
    [call(0, 'a', a), receipt(1, 'a', { step: 3 })],
    [call(0, 'a', a), receipt(1, 'a', { message: { toolCallId: 'a', isError: true } })],
    [call(0, 'a', a), user(1, { kind: 'user' }), receipt(2, 'a')],
  ]) assert.equal(collectFocusHistory(events).checkpoints.size, 0);
});
