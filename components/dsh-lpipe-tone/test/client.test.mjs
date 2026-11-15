// 客户端半边：语气设置块。除了注册形状，还要真的把面板渲染一遍并走完
// 读取、编辑、保存、清空、失败与晚返回——引用顺序错或状态机写错，只有跑起来才看得出来。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { MAX_TEXT_LENGTH as HOST_MAX_TEXT_LENGTH, normalize as normalizeHost } from '../src/config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(resolve(here, '../client/panel.js'), 'utf8');
const bundleCode = readFileSync(resolve(here, '../lib/client.js'), 'utf8');

/** Load the built bundle the way the Web client does, without a browser. */
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
  assert.ok(captured, 'the bundle registers itself with the host loader');
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

/**
 * A tiny React stand-in: one state slot per hook call, in call order, so a real
 * panel can be re-rendered and its state driven the way the Host would.
 */
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
  vm.runInNewContext(panelSource, { require: () => react, module, console, setTimeout, clearTimeout, setInterval, clearInterval }, { filename: 'client/panel.js' });
  const api = module.exports.__test__;
  return {
    api,
    states,
    refs,
    effects,
    /** Re-render the real panel; hook cursors restart exactly like React's. */
    render(rpcCall) {
      cursor = refCursor = effectCursor = 0;
      return api.TonePanel({ rpcCall });
    },
    /** Run the mount effects once (the alive ref and the first read). */
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

/** Collect one component's element nodes (a component node is not a rendered element). */
function componentNodes(node, type, out = []) {
  if (node === null || node === undefined || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const item of node) componentNodes(item, type, out);
    return out;
  }
  if (node.type === type) out.push(node);
  if (typeof node.type === 'function') {
    componentNodes(node.type(node.props), type, out);
    return out;
  }
  for (const child of node.children ?? []) componentNodes(child, type, out);
  return out;
}

function textOf(node) {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (typeof node.type === 'function') return textOf(node.type(node.props));
  return textOf(node.children);
}

const select = (tree, type) => walk(tree).filter((node) => node.type === type);
const buttons = (tree) => select(tree, 'button');
const areas = (tree) => select(tree, 'textarea');
const button = (tree, label) => buttons(tree).find((node) => textOf(node) === label);
const formOf = (tree, api) => componentNodes(tree, api.ToneForm)[0];
const statusOf = (tree) => walk(tree).find((node) => node.props?.role === 'status');

const plain = (value) => JSON.parse(JSON.stringify(value));

const okConfig = (config) => ({ ok: true, value: { config } });

test('语气设置块注册到 lpipe.settings.panel，排在最后，走既有 Fetch RPC', () => {
  const { id, exported } = loadBundle();
  assert.equal(id, 'dsh-lpipe-tone');
  const api = exported.__test__;
  assert.equal(api.PANEL_SLOT, 'lpipe.settings.panel');
  assert.equal(api.PANEL_ID, 'tone');
  assert.equal(api.RPC_ENDPOINT, 'dsh-lpipe-tone');

  let injected = null;
  let registered = null;
  const ctx = {
    slots: {
      inject: (slot, register) => { injected = { slot, register }; },
      register: (options, component) => { registered = { options, component }; return options; },
    },
    connection: { rpc: { call: (...args) => ({ args }) } },
  };
  exported.apply(ctx);
  assert.equal(injected.slot, 'lpipe.settings.panel');
  const options = injected.register();
  assert.equal(options.name, 'lpipe.settings.panel');
  assert.equal(options.id, 'tone');
  assert.equal(options.order, 80);
  assert.equal(options.label(), '语气管线');
  assert.equal(registered.component, api.TonePanel);

  const props = options.inject();
  const reply = props.rpcCall('tone.config', {});
  assert.equal(reply.args[0], '/api');
  assert.equal(reply.args[1], 'dsh-lpipe-tone');
  assert.deepEqual(plain(reply.args[2]), { method: 'tone.config', payload: {} });
});

test('面板第一屏是读取中，读到空配置后显示两个空输入框', async () => {
  const harness = makeHarness();
  const calls = [];
  const rpcCall = async (method, payload) => {
    calls.push({ method, payload });
    return okConfig({ description: '', examples: '' });
  };
  const first = harness.render(rpcCall);
  assert.match(textOf(first), /Lpipe Tone/);
  assert.match(textOf(first), /语气管线/);
  assert.match(textOf(first), /正在读取语气管线配置/);
  harness.mount();
  await tick();
  const tree = harness.render(rpcCall);
  assert.deepEqual(calls.map((call) => call.method), ['tone.config']);
  assert.deepEqual(plain(calls[0].payload), {});
  assert.match(textOf(tree), /语气描述/);
  assert.match(textOf(tree), /对话示例/);
  const fields = areas(tree);
  assert.equal(fields.length, 2);
  assert.equal(fields[0].props.value, '');
  assert.equal(fields[1].props.value, '');
  assert.deepEqual(fields.map((node) => node.props.disabled), [false, false]);
  assert.match(textOf(tree), /0 \/ 32000/);
  assert.match(textOf(tree), /两项都是空白，下一轮不会注入任何语气内容/);
  assert.equal(button(tree, '保存').props.disabled, true);
  assert.equal(button(tree, '清空').props.disabled, true);
});

test('读不到配置时报错并可重试，不假装成读到了空配置', async () => {
  for (const failure of [
    async () => ({ ok: false, error: { message: '生活目录不可读' } }),
    async () => ({ ok: true, value: {} }),
    async () => ({ ok: true, value: { config: { description: 1, examples: '' } } }),
    async () => { throw new Error('宿主没有回话'); },
  ]) {
    const harness = makeHarness();
    let calls = 0;
    let fail = true;
    const rpcCall = async () => {
      calls += 1;
      if (fail) { fail = false; return failure(); }
      return okConfig({ description: '可可爱爱', examples: '' });
    };
    harness.render(rpcCall);
    harness.mount();
    await tick();
    const failed = harness.render(rpcCall);
    assert.match(textOf(failed), /读取失败/);
    assert.match(textOf(failed), /重试/);
    assert.equal(areas(failed).length, 0, 'a failed read must not show an empty form');
    assert.equal(calls, 1);

    button(failed, '重试').props.onClick();
    // A changed reload key re-runs the read effect; the harness records it on
    // the next render and then executes it like React would.
    harness.render(rpcCall);
    harness.mount();
    await tick();
    const retried = harness.render(rpcCall);
    assert.equal(calls, 2);
    assert.equal(areas(retried).length, 2);
    assert.equal(areas(retried)[0].props.value, '可可爱爱');
  }
});

test('校验规则与宿主配置一致：字符数、控制字符、不自动 trim', () => {
  const { api } = makeHarness();
  assert.equal(api.MAX_TEXT_LENGTH, HOST_MAX_TEXT_LENGTH);
  assert.equal(api.MAX_TEXT_LENGTH, 32000);

  const long = api.validateDraft({ description: 'x'.repeat(32000), examples: '' });
  assert.deepEqual(plain(long.errors), {});
  const tooLong = api.validateDraft({ description: 'x'.repeat(32001), examples: '' });
  assert.match(tooLong.errors.description, /最多 32000 个字符（当前 32001 个）/);

  for (let code = 0; code <= 0x9f; code += 1) {
    const text = `a${String.fromCharCode(code)}b`;
    let hostRejects = false;
    try { normalizeHost({ description: text, examples: '' }); } catch { hostRejects = true; }
    const clientRejects = Boolean(api.validateDraft({ description: text, examples: '' }).errors.description);
    assert.equal(clientRejects, hostRejects, `control ${code}`);
  }

  const raw = '  可可爱爱\t\r\n（状态）\n  ';
  assert.equal(api.validateDraft({ description: raw, examples: '' }).values.description, raw);
  assert.equal(api.validateDraft({ examples: '\n用户：你好\n助手：嗯' }).values.examples, '\n用户：你好\n助手：嗯');

  // 保存基线只在原值相等时才算没改动。
  assert.equal(api.valuesEqual({ description: raw, examples: '' }, { description: raw, examples: '' }), true);
  assert.equal(api.valuesEqual({ description: 'x', examples: '' }, { description: 'x ', examples: '' }), false);
  assert.equal(api.valuesEqual({ description: '', examples: '' }, {}), true);
  assert.equal(api.normalizeConfig({ description: 'a', examples: 'b', future: 1 }).description, 'a');
  assert.equal(api.normalizeConfig({ description: 'a' }), null);
  assert.equal(api.normalizeConfig(null), null);
  assert.equal(api.isBlank({ description: ' ', examples: '' }), false, 'whitespace is content, not emptiness');
});

test('保存按钮只在有效且未保存的改动时亮起', () => {
  const { api } = makeHarness();
  const base = { description: '可可爱爱', examples: '' };
  const form = (props) => api.ToneForm({
    form: base,
    errors: {},
    saving: false,
    dirty: false,
    canClear: true,
    statusText: '保存后下一轮起生效；只改这两项。',
    statusTone: 'muted',
    onChange: () => {},
    onSave: () => {},
    onClear: () => {},
    onRevert: () => {},
    ...props,
  });

  const clean = form({});
  assert.equal(button(clean, '保存').props.disabled, true);
  assert.equal(button(clean, '保存').props.style.opacity, 0.42);
  assert.equal(button(clean, '撤回').props.disabled, true);
  assert.equal(button(clean, '清空').props.disabled, false);

  const dirty = form({ dirty: true, form: { ...base, description: '新的' }, statusText: '改了还没保存' });
  assert.equal(button(dirty, '保存').props.disabled, false);
  assert.equal(button(dirty, '保存').props.style.opacity, 1);
  assert.equal(button(dirty, '撤回').props.disabled, false);
  assert.match(textOf(dirty), /改了还没保存/);

  const saving = form({ dirty: true, saving: true, statusText: '保存中…' });
  assert.equal(button(saving, '保存中…').props.disabled, true);
  assert.equal(button(saving, '清空').props.disabled, true);
  assert.deepEqual(select(saving, 'textarea').map((node) => node.props.disabled), [true, true]);

  const invalid = form({
    dirty: true,
    errors: { description: '语气描述最多 32000 个字符。' },
    statusText: '校验未通过：语气描述最多 32000 个字符。',
    statusTone: 'error',
  });
  assert.equal(button(invalid, '保存').props.disabled, true);
  assert.match(textOf(invalid), /校验未通过/);
  assert.equal(walk(invalid).some((node) => node.props?.['aria-invalid'] === true), true);
});

test('编辑后保存：完整两项发给 RPC，成功用返回配置更新保存基线', async () => {
  const harness = makeHarness();
  const calls = [];
  const rpcCall = async (method, payload) => {
    calls.push({ method, payload });
    if (method === 'tone.config') return okConfig({ description: '', examples: '' });
    return okConfig(payload);
  };
  harness.render(rpcCall);
  harness.mount();
  await tick();

  let tree = harness.render(rpcCall);
  let form = formOf(tree, harness.api);
  form.props.onChange('description', '用括号表示状态');
  tree = harness.render(rpcCall);
  form = formOf(tree, harness.api);
  form.props.onChange('examples', '用户：你好\n助手：嗯～');
  tree = harness.render(rpcCall);
  assert.match(textOf(statusOf(tree)), /改了还没保存/);
  form = formOf(tree, harness.api);
  assert.equal(button(tree, '保存').props.disabled, false);

  form.props.onSave();
  await tick();
  const saveCall = calls.find((call) => call.method === 'tone.config.save');
  assert.deepEqual(plain(saveCall.payload), { description: '用括号表示状态', examples: '用户：你好\n助手：嗯～' });

  tree = harness.render(rpcCall);
  assert.match(textOf(statusOf(tree)), /已保存，下一轮起生效/);
  assert.equal(button(tree, '保存').props.disabled, true, 'a committed save leaves nothing to save');
  assert.deepEqual(plain(harness.states[0]), { description: '用括号表示状态', examples: '用户：你好\n助手：嗯～' });
  assert.deepEqual(plain(harness.states[1]), { description: '用括号表示状态', examples: '用户：你好\n助手：嗯～' });
});

test('保存失败保留草稿与旧基线，不显示成已保存', async () => {
  const harness = makeHarness();
  const rpcCall = async (method, payload) => {
    if (method === 'tone.config') return okConfig({ description: '旧内容', examples: '' });
    assert.deepEqual(plain(payload), { description: '新内容', examples: '' });
    return { ok: false, error: { code: 'tone/failed', message: '文件损坏' } };
  };
  harness.render(rpcCall);
  harness.mount();
  await tick();
  let tree = harness.render(rpcCall);
  formOf(tree, harness.api).props.onChange('description', '新内容');
  tree = harness.render(rpcCall);
  formOf(tree, harness.api).props.onSave();
  await tick();
  tree = harness.render(rpcCall);
  assert.match(textOf(statusOf(tree)), /保存失败：文件损坏；草稿还留着/);
  assert.equal(plain(harness.states[0]).description, '新内容', 'the draft survives a failed save');
  assert.equal(plain(harness.states[1]).description, '旧内容', 'the baseline only moves on a real save');
  assert.equal(button(tree, '保存').props.disabled, false, 'still dirty, so it can be retried');

  // A malformed success body is a failure too: baseline must not move to it.
  const harness2 = makeHarness();
  let stage = 'read';
  const rpc2 = async (method) => {
    if (method === 'tone.config') return okConfig({ description: 'a', examples: '' });
    stage = 'saved';
    return { ok: true, value: { config: { description: 'a' } } };
  };
  harness2.render(rpc2);
  harness2.mount();
  await tick();
  let tree2 = harness2.render(rpc2);
  formOf(tree2, harness2.api).props.onChange('examples', 'b');
  tree2 = harness2.render(rpc2);
  formOf(tree2, harness2.api).props.onSave();
  await tick();
  tree2 = harness2.render(rpc2);
  assert.equal(stage, 'saved');
  assert.match(textOf(statusOf(tree2)), /保存返回的配置格式不对/);
  assert.deepEqual(plain(harness2.states[1]), { description: 'a', examples: '' });
  assert.equal(plain(harness2.states[0]).examples, 'b');
});

test('晚返回的保存不覆盖保存期间新打的草稿', async () => {
  const harness = makeHarness();
  let release;
  const gate = new Promise((done) => { release = done; });
  const rpcCall = async (method, payload) => {
    if (method === 'tone.config') return okConfig({ description: 'a', examples: '' });
    await gate;
    return okConfig({ description: 'a', examples: 'b' });
  };
  harness.render(rpcCall);
  harness.mount();
  await tick();
  let tree = harness.render(rpcCall);
  formOf(tree, harness.api).props.onChange('examples', 'b');
  tree = harness.render(rpcCall);
  formOf(tree, harness.api).props.onSave();

  // 保存请求还在路上，用户换了第二版草稿。
  tree = harness.render(rpcCall);
  formOf(tree, harness.api).props.onChange('examples', '更新的草稿');
  tree = harness.render(rpcCall);
  assert.equal(plain(harness.states[0]).examples, '更新的草稿');

  release();
  await tick();
  tree = harness.render(rpcCall);
  assert.equal(plain(harness.states[0]).examples, '更新的草稿', 'the reply must not stomp newer typing');
  assert.deepEqual(plain(harness.states[1]), { description: 'a', examples: 'b' }, 'the reply is still the new baseline');
  assert.equal(button(tree, '保存').props.disabled, false, 'the newer draft is still unsaved');
});

test('清空两项：发空字符串、两项都回到空白、不注入任何内容', async () => {
  const harness = makeHarness();
  const calls = [];
  const rpcCall = async (method, payload) => {
    calls.push({ method, payload });
    if (method === 'tone.config') return okConfig({ description: '可可爱爱', examples: '用户：你好' });
    return okConfig(payload);
  };
  harness.render(rpcCall);
  harness.mount();
  await tick();
  let tree = harness.render(rpcCall);
  assert.equal(button(tree, '清空').props.disabled, false);
  formOf(tree, harness.api).props.onClear();
  await tick();
  const saveCall = calls.find((call) => call.method === 'tone.config.save');
  assert.deepEqual(plain(saveCall.payload), { description: '', examples: '' });
  tree = harness.render(rpcCall);
  assert.deepEqual(plain(harness.states[0]), { description: '', examples: '' });
  assert.deepEqual(plain(harness.states[1]), { description: '', examples: '' });
  assert.match(textOf(statusOf(tree)), /已清空，下一轮起不再注入/);
  assert.equal(button(tree, '清空').props.disabled, true, 'nothing left to clear');
  assert.equal(areas(tree).map((node) => node.props.value).join(''), '');
});

test('空白内容原样保存，不会被 trim 成空字符串以外的东西', () => {
  const { api } = makeHarness();
  assert.deepEqual(plain(api.payloadOf({ description: ' 空格 \n', examples: '\t' })), { description: ' 空格 \n', examples: '\t' });
  assert.deepEqual(plain(api.configOf({ ok: true, value: { config: { description: 'x', examples: '' } } })), { description: 'x', examples: '' });
  assert.equal(api.configOf({ ok: false, error: { message: 'x' } }), null);
  assert.equal(api.configOf({ ok: true, value: { config: null } }), null);
});
