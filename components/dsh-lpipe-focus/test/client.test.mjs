import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { DEFAULT_CONFIG, FIELD_BOUNDS } from '../src/config.mjs';
import { wrapClient } from '../scripts/build-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(resolve(here, '../client/panel.js'), 'utf8');
const bundleCode = readFileSync(resolve(here, '../lib/client.js'), 'utf8');

function loadBundle() {
  let captured = null;
  const sandbox = {
    window: { __ModuleLoader__: { load: (entry) => { captured = entry; } } },
    module: { exports: {} },
    exports: {},
    console,
    setTimeout: () => ({ unref() {} }),
    clearTimeout: () => {},
    Date,
    JSON,
    Math,
    Number,
    String,
    Boolean,
    Object,
    Array,
    Error,
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(bundleCode, sandbox, { filename: 'lib/client.js' });
  assert.ok(captured, 'bundle must register with window.__ModuleLoader__');
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {},
    useCallback: (fn) => fn,
    useRef: (initial) => ({ current: initial }),
  };
  const exported = captured.factory((name) => {
    if (name === 'react') return react;
    throw new Error(`unexpected require: ${name}`);
  });
  return { id: captured.id, exported };
}

function makeHarness() {
  const states = [];
  const refs = [];
  const effects = [];
  let cursor = 0;
  let refCursor = 0;
  let effectCursor = 0;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) {
      const index = cursor++;
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial;
      return [states[index], (value) => {
        states[index] = typeof value === 'function' ? value(states[index]) : value;
      }];
    },
    useRef(initial) {
      const index = refCursor++;
      return (refs[index] ??= { current: initial });
    },
    useEffect(fn) {
      const index = effectCursor++;
      effects[index] = fn;
    },
    useCallback: (fn) => fn,
  };
  const module = { exports: {} };
  vm.runInNewContext(
    panelSource,
    { require: () => react, module, console, setTimeout, clearTimeout, setInterval, clearInterval },
    { filename: 'client/panel.js' },
  );
  const api = module.exports.__test__;
  return {
    api,
    states,
    refs,
    effects,
    render(rpcCall) {
      cursor = refCursor = effectCursor = 0;
      return api.FocusSettingsPanel({ rpcCall });
    },
    mount() {
      for (const fn of effects.slice()) fn?.();
    },
  };
}

const tick = async () => {
  for (let i = 0; i < 8; i += 1) await new Promise((done) => setImmediate(done));
};

function walk(node, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) walk(item, out);
    return out;
  }
  if (typeof node.type === 'function') {
    walk(node.type(node.props), out);
    return out;
  }
  out.push(node);
  for (const child of node.children ?? []) walk(child, out);
  return out;
}

test('lib/client.js matches build output and registers exclusively into lpipe.settings.panel', () => {
  assert.equal(bundleCode, wrapClient(panelSource), 'lib/client.js must stay in sync with client/panel.js');
  const { id, exported } = loadBundle();
  assert.equal(id, 'dsh-lpipe-focus');

  const registrations = [];
  exported.apply({
    connection: { rpc: { call: () => Promise.resolve({ ok: true }) } },
    slots: {
      inject(slotName, fn) {
        assert.equal(slotName, 'lpipe.settings.panel');
        fn();
      },
      register(options, component) {
        registrations.push({ options, component });
      },
    },
  });
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].options.id, 'focus');
  assert.equal(registrations[0].options.name, 'lpipe.settings.panel');
  assert.equal(registrations[0].options.label(), '聚焦管线');
});

test('panel uses only --dsw-alias-* theme tokens and imports no dsh-client-ui-primitives', () => {
  assert.ok(!panelSource.includes('@deepseek-ai/dsh-client-ui-primitives'));
  assert.ok(!/#[0-9a-fA-F]{3,8}/.test(panelSource), 'no literal hex colors in panel styles');
  for (const key of ['text', 'muted', 'faint', 'border', 'borderStrong', 'bg', 'soft', 'accent', 'success', 'warning', 'danger']) {
    assert.match(panelSource, new RegExp(`\\b${key}: 'var\\(--dsw-alias-[a-z0-9-]+\\)'`));
  }
});

test('panel field defaults and bounds strictly match host config.mjs', () => {
  const h = makeHarness();
  for (const item of h.api.FIELDS) {
    const spec = FIELD_BOUNDS[item.key];
    assert.ok(spec, `unknown field ${item.key}`);
    assert.equal(item.min, spec.min);
    assert.equal(item.max, spec.max);
    assert.equal(item.fallback, DEFAULT_CONFIG[item.key]);
  }
  assert.deepEqual({ ...h.api.displayValues(DEFAULT_CONFIG) }, {
    idleMinutes: '60',
    compactChars: '512K',
    nudgeChars: '256K',
  });
  assert.deepEqual({ ...h.api.DEFAULT_VALUES }, DEFAULT_CONFIG);
  assert.equal(h.api.validateDraft({ idleMinutes: '60', compactChars: '300K', nudgeChars: '320K' }).errors.nudgeChars, '未转化提醒线不能高于过线整理阈值。');
  for (const key of ['allSessions', 'includeSubagents']) {
    assert.equal(h.api.normalizeConfig({ ...DEFAULT_CONFIG, [key]: 'false' }), null);
  }
});

test('panel handles load failure with retry protection, and supports edit, reset, revert, save, and late-reply safety', async () => {
  const h = makeHarness();
  let calls = [];
  let failLoad = true;
  let failSave = false;
  let savedState = { ...DEFAULT_CONFIG };
  const rpc = async (method, payload) => {
    calls.push({ method, payload });
    if (method === 'focus.config') {
      if (failLoad) return { ok: false, error: { code: 'focus/corrupt-config', message: '配置文件损坏' } };
      return { ok: true, value: { config: { ...savedState }, defaults: { ...DEFAULT_CONFIG } } };
    }
    if (method === 'focus.config.save') {
      if (failSave) return { ok: false, error: { code: 'focus/failed', message: '写入失败' } };
      savedState = { ...savedState, ...payload };
      return { ok: true, value: { config: { ...savedState } } };
    }
    throw new Error(`unexpected ${method}`);
  };

  // Initial render -> loading
  let tree = walk(h.render(rpc));
  assert.ok(JSON.stringify(tree).includes('正在读取聚焦管线配置'));
  h.mount();
  await tick();

  // Load failed -> error view with retry button, never showing default inputs
  tree = walk(h.render(rpc));
  assert.equal(tree.filter((n) => n.type === 'input').length, 0);
  const retryBtn = tree.find((n) => n.type === 'button' && n.children.includes('重试读取'));
  assert.ok(retryBtn, 'retry button must be shown on load error');

  // Retry succeeds
  failLoad = false;
  retryBtn.props.onClick();
  h.render(rpc);
  h.effects[1]();
  await tick();

  tree = walk(h.render(rpc));
  const inputs = tree.filter((n) => n.type === 'input');
  assert.deepEqual(inputs.map((node) => node.props.id), ['focus-idleMinutes', 'focus-compactChars', 'focus-nudgeChars']);
  assert.equal(inputs[0].props.inputMode, 'numeric', 'idleMinutes uses numeric keypad');
  assert.equal(inputs[1].props.inputMode, 'text', 'K/M fields use text inputMode so K/M/dot can be typed');
  assert.match(inputs[1].props['aria-describedby'], /focus-compactChars-range focus-compactChars-unit/);
  assert.ok(tree.some((n) => n.type === 'h3' && n.children.includes('Lpipe Focus')), 'section header aligns with sibling Lpipe blocks');
  assert.ok(tree.some((n) => n.type === 'style' && String(n.children[0]).includes(':focus-within')), 'component style provides focus-within ring');
  const findBtn = (label) => tree.find((n) => n.type === 'button' && n.children.includes(label));
  assert.equal(findBtn('保存').props.disabled, true);
  assert.equal(findBtn('撤回').props.disabled, true);
  assert.equal(findBtn('恢复默认').props.disabled, true);

  // Edit compactChars to 600K
  inputs[1].props.onChange({ target: { value: '600K' } });
  tree = walk(h.render(rpc));
  assert.equal(findBtn('保存').props.disabled, false);
  assert.equal(findBtn('撤回').props.disabled, false);
  assert.equal(findBtn('恢复默认').props.disabled, false);

  // Revert restores baseline
  findBtn('撤回').props.onClick();
  tree = walk(h.render(rpc));
  assert.equal(findBtn('保存').props.disabled, true);

  // Edit again and Save
  tree.filter((n) => n.type === 'input')[0].props.onChange({ target: { value: '45' } });
  tree = walk(h.render(rpc));
  findBtn('保存').props.onClick();
  await tick();

  tree = walk(h.render(rpc));
  assert.equal(findBtn('保存').props.disabled, true);
  assert.equal(findBtn('恢复默认').props.disabled, false);
  assert.equal(calls.at(-1).method, 'focus.config.save');
  assert.equal(calls.at(-1).payload.idleMinutes, 45);

  // Reset to defaults updates draft only until saved
  findBtn('恢复默认').props.onClick();
  tree = walk(h.render(rpc));
  assert.equal(findBtn('保存').props.disabled, false);
  assert.equal(findBtn('恢复默认').props.disabled, true);

  // Each switch saves only itself and leaves the reset numeric draft untouched.
  const switches = () => tree.filter(n => n.props.role === 'switch');
  const states = () => switches().map(n => n.props['aria-checked']);
  const status = () => tree.find(n => n.props.id === 'focus-status-text').children[0];
  assert.deepEqual(switches().map(n => n.props['aria-label']), ['所有顶层对话生效', '包含子智能体']);
  assert.deepEqual(states(), [false, true]);
  for (const toggle of switches()) {
    assert.equal(toggle.children[0].props.style.background, 'var(--dsw-alias-label-on-color)',
      'both switch thumbs use the theme white in either position');
  }
  for (const [i, key] of ['allSessions', 'includeSubagents'].entries()) {
    const before = states();
    const after = before.map((value, index) => index === i ? !value : value);
    failSave = true;
    switches()[i].props.onClick();
    tree = walk(h.render(rpc));
    assert.deepEqual(states(), after, 'optimistic state');
    assert.ok(switches().every(n => n.props.disabled));
    assert.equal(findBtn('保存').props.disabled, true, 'numeric writes cannot race a switch');
    await tick();
    tree = walk(h.render(rpc));
    assert.deepEqual(states(), before, 'failure rolls back only the changed switch');
    assert.match(status(), /写入失败/);
    failSave = false;
    switches()[i].props.onClick();
    await tick();
    tree = walk(h.render(rpc));
    assert.deepEqual({ ...calls.at(-1).payload }, { [key]: after[i] });
    assert.deepEqual(states(), after);
    assert.equal(tree.find(n => n.props.id === 'focus-idleMinutes').props.value, '60');
    assert.equal(savedState.idleMinutes, 45, 'scope changes never save the draft');
  }
  assert.deepEqual(states(), [true, false]);
  failSave = true;
  findBtn('保存').props.onClick();
  await tick();
  tree = walk(h.render(rpc));
  assert.match(status(), /写入失败.*草稿已保留/);
  assert.equal(findBtn('保存').props.disabled, false);
  failSave = false;
  findBtn('保存').props.onClick();
  tree = walk(h.render(rpc));
  assert.ok(switches().every(n => n.props.disabled));
  await tick();
  tree = walk(h.render(rpc));
  assert.deepEqual({ ...calls.at(-1).payload }, { idleMinutes: 60, compactChars: 512000, nudgeChars: 256000 });
  assert.deepEqual(states(), [true, false]);
  assert.deepEqual(savedState, { ...DEFAULT_CONFIG, allSessions: true, includeSubagents: false });
  assert.equal(findBtn('保存').props.disabled, true);

  tree.find(n => n.props.id === 'focus-nudgeChars').props.onChange({ target: { value: '600K' } });
  tree = walk(h.render(rpc));
  assert.equal(findBtn('保存').props.disabled, true);
  failSave = true;
  switches()[1].props.onClick();
  await tick();
  tree = walk(h.render(rpc));
  assert.deepEqual(states(), [true, false]);
  assert.match(status(), /写入失败/);
  assert.match(status(), /未转化提醒线不能高于/);
});
