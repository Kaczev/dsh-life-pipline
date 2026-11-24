import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { wrapClient } from '../scripts/build-client.mjs';
import { MAX_TEXT_LENGTH, normalize } from '../src/config.mjs';

const body = readFileSync(new URL('../client/panel.js', import.meta.url), 'utf8');
const bundle = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));
const config = (phrase, allSessions = false) => ({
  ok: true, value: { config: { phrase, allSessions }, defaults: { phrase: '', allSessions: false } },
});

function load(react) {
  let entry;
  vm.runInNewContext(bundle, { window: { __ModuleLoader__: { load: value => { entry = value; } } } });
  assert.equal(entry.id, 'dsh-lpipe-tone');
  return entry.factory(name => { assert.equal(name, 'react'); return react; });
}

// Re-render the built panel with stable hook slots. Effects run when their
// dependencies change, including the new load initiated by the Retry button.
function panel(rpcCall) {
  const hooks = [];
  let cursor;
  let pendingEffects;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef(initial) { return hooks[cursor++] ??= { current: initial }; },
    useEffect(fn, deps) {
      const index = cursor++;
      const previous = hooks[index];
      if (!previous || deps.some((value, i) => !Object.is(previous.deps[i], value))) {
        pendingEffects.push(() => {
          previous?.cleanup?.();
          hooks[index] = { deps, cleanup: fn() };
        });
      }
    },
  };
  const { TonePanel } = load(react).__test__;
  function render() {
    cursor = 0;
    pendingEffects = [];
    const tree = TonePanel({ rpcCall });
    for (const effect of pendingEffects) effect();
    return tree;
  }
  return { render, unmount() { for (const hook of hooks) hook?.cleanup?.(); } };
}

function elements(node, out = []) {
  if (node === null || typeof node !== 'object') return out;
  if (typeof node.type === 'function') return elements(node.type(node.props), out);
  out.push(node);
  for (const child of node.children) elements(child, out);
  return out;
}
const input = tree => elements(tree).find(node => node.type === 'input');
const button = (tree, label) => elements(tree).find(node => node.type === 'button' && node.children[0] === label);
const toggle = tree => elements(tree).find(node => node.props.role === 'switch');
const status = (tree, id = 'tone-phrase-status') => elements(tree).find(node => node.props.id === id).children[0];
const change = (tree, value) => input(tree).props.onChange({ target: { value } });

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

async function open(reply = config('Saved text'), save) {
  const calls = [];
  const view = panel((method, payload) => {
    calls.push([method, plain(payload)]);
    if (method === 'tone.config') return reply;
    assert.equal(method, 'tone.config.save');
    return save(payload);
  });
  const first = view.render();
  assert.equal(input(first), undefined);
  assert.ok(elements(first).some(node => node.props.role === 'status' && /读取/.test(node.children[0])));
  await tick();
  return { ...view, calls };
}

test('built loader registers the settings panel and dispatches via the existing RPC endpoint', async () => {
  assert.equal(bundle.replace(/\r\n/g, '\n'), wrapClient(body));
  assert.equal(wrapClient('a\r\nb'), wrapClient('a\nb'));
  const plugin = load({ createElement() {} });
  assert.deepEqual(plain(plugin.inject), ['slots', 'connection']);
  let slot;
  let render;
  let args;
  plugin.apply({
    slots: {
      inject(name, fn) { assert.equal(name, 'lpipe.settings.panel'); fn(); },
      register(spec, component) { slot = spec; render = component; },
    },
    connection: { rpc: { call(...values) { args = values; return 'reply'; } } },
  });
  assert.deepEqual([slot.name, slot.id, slot.order, slot.label()], ['lpipe.settings.panel', 'tone', 80, '语气管线']);
  assert.equal(render, plugin.__test__.TonePanel);
  const signal = new AbortController().signal;
  assert.equal(await slot.inject().rpcCall('tone.config', undefined, signal), 'reply');
  assert.deepEqual(plain(args.slice(0, 3)), ['/api', 'dsh-lpipe-tone', { method: 'tone.config', payload: {} }]);
  assert.equal(args[3], signal);
});

test('empty single-line field shows a labeled example and saves only the typed phrase', async () => {
  const view = await open(config(''), patch => config(patch.phrase));
  let tree = view.render();
  assert.equal(elements(tree).filter(node => node.type === 'input').length, 1);
  assert.equal(input(tree).props.type, 'text');
  assert.equal(input(tree).props.value, '');
  assert.equal(input(tree).props.placeholder, '呜……');
  const label = elements(tree).find(node => node.type === 'label' && node.props.htmlFor === input(tree).props.id);
  assert.equal(label.children[0], '习惯用语');
  assert.ok(elements(tree).some(node => node.props.id === input(tree).props['aria-describedby']));
  assert.equal(button(tree, '保存').props.disabled, true);
  const phrase = '  呜…… ';
  change(tree, phrase);
  button(view.render(), '撤回').props.onClick();
  tree = view.render();
  assert.equal(input(tree).props.value, '');
  assert.deepEqual(view.calls, [['tone.config', {}]]);
  change(tree, phrase);
  await button(view.render(), '保存').props.onClick();
  assert.deepEqual(view.calls[1], ['tone.config.save', { phrase }]);
  assert.equal(button(view.render(), '撤回'), undefined);
});

test('deleting a saved phrase is reversible until Save and takes effect independently of scope', async () => {
  const view = await open(config('嗯', true), patch => config(patch.phrase));
  let tree = view.render();
  assert.equal(input(tree).props.value, '嗯');
  change(tree, '');
  assert.deepEqual(view.calls, [['tone.config', {}]]);
  button(view.render(), '撤回').props.onClick();
  tree = view.render();
  assert.equal(input(tree).props.value, '嗯');
  change(tree, '');
  await button(view.render(), '保存').props.onClick();
  tree = view.render();
  assert.deepEqual(view.calls[1], ['tone.config.save', { phrase: '' }]);
  assert.equal(input(tree).props.value, '');
  assert.equal(button(tree, '保存').props.disabled, true);
  assert.equal(toggle(tree).props['aria-checked'], true);
  assert.match(status(tree), /已停用/);
});

test('client and Host agree on limits in UTF-16 code units and forbidden controls', async () => {
  const view = await open();
  const limit = '🙂'.repeat(MAX_TEXT_LENGTH / 2);
  for (const [text, valid] of [[limit, true], [limit + 'a', false], ['\0', false], ['\x7f', false], ['\x9f', false], ['a\rb', false], ['a\nb', false], [' \t ', true]]) {
    if (valid) assert.equal(normalize({ phrase: text }).phrase, text);
    else assert.throws(() => normalize({ phrase: text }), TypeError);
    change(view.render(), text);
    const tree = view.render();
    assert.equal(input(tree).props['aria-invalid'], !valid);
    assert.equal(button(tree, '保存').props.disabled, !valid);
    if (!valid) await button(tree, '保存').props.onClick();
  }
  assert.equal(view.calls.length, 1);
});

test('whitespace-only text saves verbatim and the panel reports that injection is skipped', async () => {
  const view = await open(config('x'), patch => config(patch.phrase));
  change(view.render(), '  \t');
  await button(view.render(), '保存').props.onClick();
  const tree = view.render();
  assert.equal(input(tree).props.value, '  \t');
  assert.deepEqual(view.calls[1], ['tone.config.save', { phrase: '  \t' }]);
  assert.match(status(tree), /已停用/);
});

test('overlapping phrase and scope saves reconcile only the field owned by each reply', async () => {
  for (const scopeFirst of [true, false]) {
    const phraseSave = deferred();
    const scopeSave = deferred();
    const view = await open(config('original'), patch => 'phrase' in patch ? phraseSave.promise : scopeSave.promise);
    change(view.render(), '  edited verbatim ');
    let tree = view.render();
    const submit = button(tree, '保存').props.onClick;
    const saving = submit();
    await submit();
    tree = view.render();
    assert.equal(input(tree).props.disabled, true);
    assert.equal(button(tree, '撤回').props.disabled, true);
    assert.equal(toggle(tree).props.disabled, false);
    const switchScope = toggle(tree).props.onClick;
    const switching = switchScope();
    await switchScope();
    tree = view.render();
    assert.equal(toggle(tree).props['aria-checked'], false);
    assert.equal(toggle(tree).props['aria-busy'], true);
    assert.deepEqual(view.calls.slice(1), [
      ['tone.config.save', { phrase: '  edited verbatim ' }], ['tone.config.save', { allSessions: true }],
    ]);
    const ackScope = async () => { scopeSave.resolve(config('original', true)); await switching; };
    const ackPrompt = async () => { phraseSave.resolve(config('acknowledged', false)); await saving; };
    if (scopeFirst) { await ackScope(); await ackPrompt(); } else { await ackPrompt(); await ackScope(); }
    tree = view.render();
    assert.equal(input(tree).props.value, 'acknowledged');
    assert.equal(button(tree, '撤回'), undefined);
    assert.equal(toggle(tree).props['aria-checked'], true);
  }
});

test('late phrase acknowledgement updates the baseline and retains any newer draft', async () => {
  const save = deferred();
  const view = await open(config('original'), () => save.promise);
  change(view.render(), 'first edit');
  const edited = view.render();
  const pending = button(edited, '保存').props.onClick();
  change(edited, 'newer edit');
  save.resolve(config('first edit'));
  await pending;
  const tree = view.render();
  assert.equal(input(tree).props.value, 'newer edit');
  assert.match(status(tree), /未保存/);
  button(tree, '撤回').props.onClick();
  assert.equal(input(view.render()).props.value, 'first edit');
});

test('save failures preserve the draft and scope, expose errors and allow retry', async () => {
  let attempt = 0;
  const view = await open(config('original'), patch => {
    if ('phrase' in patch) return { ok: true, value: { config: { phrase: null } } };
    return config('stale', ++attempt > 1);
  });
  change(view.render(), 'draft');
  await button(view.render(), '保存').props.onClick();
  let tree = view.render();
  assert.match(status(tree), /保存失败/);
  assert.equal(input(tree).props.value, 'draft');
  assert.equal(button(tree, '保存').props.disabled, false);
  await toggle(tree).props.onClick();
  tree = view.render();
  assert.match(status(tree, 'tone-allSessions-status'), /失败/);
  assert.equal(toggle(tree).props['aria-checked'], false);
  await toggle(tree).props.onClick();
  tree = view.render();
  assert.equal(toggle(tree).props['aria-checked'], true);
  assert.equal(status(tree, 'tone-allSessions-status'), '');
  assert.equal(input(tree).props.value, 'draft');
  button(tree, '撤回').props.onClick();
  assert.equal(input(view.render()).props.value, 'original');
});

test('invalid config reads show an error and Retry reloads the Host configuration', async () => {
  for (const bad of [{ ok: false, error: { message: 'offline' } }, config(null), config('text', null)]) {
    let reads = 0;
    const view = panel(() => ++reads === 1 ? bad : config('recovered', true));
    view.render();
    await tick();
    let tree = view.render();
    assert.equal(input(tree), undefined);
    assert.ok(elements(tree).some(node => node.props.role === 'alert'));
    button(tree, '重试').props.onClick();
    view.render();
    await tick();
    tree = view.render();
    assert.equal(input(tree).props.value, 'recovered');
    assert.equal(toggle(tree).props['aria-checked'], true);
    assert.equal(reads, 2);
    view.unmount();
  }
});
