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

test('恢复默认逐项只改草稿，可撤回并显式保存，保存时禁用', async () => {
  const harness = makeHarness();
  const keys = ['diction', 'syntax', 'rhythm', 'expression'];
  const original = Object.fromEntries(keys.map((key) => [key, `saved-${key}`]));
  const defaults = Object.fromEntries(keys.map((key) => [key, `host-default-${key}`]));
  const calls = [];
  let finishSave;
  const rpc = async (method, payload) => {
    calls.push({ method, payload });
    if (method === 'tone.config') return { ok: true, value: { config: original, defaults } };
    return new Promise((resolve) => { finishSave = () => resolve(okConfig(payload)); });
  };
  harness.render(rpc); harness.mount(); await tick();
  const resets = (tree) => buttons(tree).filter((node) => textOf(node) === '恢复默认');
  let tree = harness.render(rpc);
  assert.equal(resets(tree).length, 4);
  for (const [index, key] of keys.entries()) {
    assert.equal(resets(tree)[index].props.disabled, false);
    resets(tree)[index].props.onClick();
    tree = harness.render(rpc);
    assert.equal(areas(tree)[index].props.value, defaults[key]);
    assert.equal(resets(tree)[index].props.disabled, true);
    assert.deepEqual(plain(harness.states[1]), original, 'reset never changes the saved baseline');
    assert.equal(calls.length, 1, 'reset sends no save request');
    button(tree, '撤回').props.onClick();
    tree = harness.render(rpc);
    assert.deepEqual(areas(tree).map((area) => area.props.value), keys.map((k) => original[k]));
  }
  resets(tree)[0].props.onClick(); tree = harness.render(rpc);
  button(tree, '保存').props.onClick(); await tick();
  tree = harness.render(rpc);
  assert.deepEqual(resets(tree).map((node) => node.props.disabled), [true, true, true, true]);
  formOf(tree, harness.api).props.onReset('syntax');
  assert.equal(harness.states[0].syntax, original.syntax, 'handler also guards saving');
  assert.deepEqual(plain(calls[1].payload), { ...original, diction: defaults.diction });
  finishSave(); await tick(); tree = harness.render(rpc);
  assert.equal(button(tree, '保存').props.disabled, true);
  assert.equal(resets(tree)[0].props.disabled, true);
  assert.equal(resets(tree)[1].props.disabled, false);
});

test('缺失或无效 defaults 不猜默认值，现有读写与清空仍可用', async () => {
  for (const defaults of [undefined, {}, { diction: 42 }]) {
    const harness = makeHarness();
    const rpc = async (method, payload) => method === 'tone.config'
      ? { ok: true, value: { config: { diction: 'saved', syntax: '', rhythm: '', expression: '' }, defaults } }
      : okConfig(payload);
    harness.render(rpc); harness.mount(); await tick();
    let tree = harness.render(rpc);
    assert.equal(areas(tree).length, 4);
    assert.equal(buttons(tree).filter((node) => textOf(node) === '恢复默认').every((node) => node.props.disabled), true);
    button(tree, '清空').props.onClick(); await tick(); tree = harness.render(rpc);
    assert.deepEqual(areas(tree).map((node) => node.props.value), ['', '', '', '']);
    assert.match(textOf(statusOf(tree)), /已清空/);
  }
});

test('四项帮助文字与输入框关联，解释逐字采用确认文案', async () => {
  const harness = makeHarness();
  const rpc = async () => okConfig({ diction: '', syntax: '', rhythm: '', expression: '' });
  harness.render(rpc); harness.mount(); await tick();
  const tree = harness.render(rpc);
  const descriptions = [
    '决定用什么词表达同一个意思，例如日常还是书面、直白还是含蓄，以及称呼、语气词和比喻的使用习惯。不改变术语含义和事实。',
    '决定一句话怎么组织，例如长句还是短句、完整句还是口语省略，以及分句如何连接。不改变原有判断、条件和确定程度。',
    '决定话怎么展开、在哪里停顿，例如段落疏密、停顿、重复和重点的落点。不删减信息，也不为了节奏添加内容。',
    '决定已有的情绪和语气表现得多明显，例如直接说出、通过语气词或括号动作表现，还是保持克制。不凭空增加情绪，也不改变对用户的态度。',
  ];
  areas(tree).forEach((area, i) => {
    const help = walk(tree).find((node) => node.props.id === area.props['aria-describedby']);
    assert.equal(textOf(help), descriptions[i]);
  });
});

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

test('面板第一屏是读取中，读到空配置后显示四个空输入框', async () => {
  const harness = makeHarness();
  const calls = [];
  const rpcCall = async (method, payload) => {
    calls.push({ method, payload });
    return okConfig({ rhythm: '', expression: '', diction: '', syntax: '' });
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
  assert.match(textOf(tree), /措辞/);
  assert.match(textOf(tree), /句式/);
  const fields = areas(tree);
  assert.equal(fields.length, 4);
  assert.equal(fields[0].props.value, '');
  assert.equal(fields[1].props.value, '');
  assert.deepEqual(fields.map((node) => node.props.disabled), [false, false, false, false]);
  assert.match(textOf(tree), /0 \/ 32000/);
  assert.match(textOf(tree), /四项都是空白，下一轮不会注入任何语气内容/);
  assert.equal(button(tree, '保存').props.disabled, true);
  assert.equal(button(tree, '清空').props.disabled, true);
});

test('读不到配置时报错并可重试，不假装成读到了空配置', async () => {
  for (const failure of [
    async () => ({ ok: false, error: { message: '生活目录不可读' } }),
    async () => ({ ok: true, value: {} }),
    async () => ({ ok: true, value: { config: { rhythm: '', expression: '', diction: 1, syntax: '' } } }),
    async () => { throw new Error('宿主没有回话'); },
  ]) {
    const harness = makeHarness();
    let calls = 0;
    let fail = true;
    const rpcCall = async () => {
      calls += 1;
      if (fail) { fail = false; return failure(); }
      return okConfig({ rhythm: '', expression: '', diction: '可可爱爱', syntax: '' });
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
    assert.equal(areas(retried).length, 4);
    assert.equal(areas(retried)[0].props.value, '可可爱爱');
  }
});

test('校验规则与宿主配置一致：字符数、控制字符、不自动 trim', () => {
  const { api } = makeHarness();
  assert.equal(api.MAX_TEXT_LENGTH, HOST_MAX_TEXT_LENGTH);
  assert.equal(api.MAX_TEXT_LENGTH, 32000);

  const long = api.validateDraft({ rhythm: '', expression: '', diction: 'x'.repeat(32000), syntax: '' });
  assert.deepEqual(plain(long.errors), {});
  const tooLong = api.validateDraft({ rhythm: '', expression: '', diction: 'x'.repeat(32001), syntax: '' });
  assert.match(tooLong.errors.diction, /最多 32000 个字符（当前 32001 个）/);

  for (let code = 0; code <= 0x9f; code += 1) {
    const text = `a${String.fromCharCode(code)}b`;
    let hostRejects = false;
    try { normalizeHost({ rhythm: '', expression: '', diction: text, syntax: '' }); } catch { hostRejects = true; }
    const clientRejects = Boolean(api.validateDraft({ rhythm: '', expression: '', diction: text, syntax: '' }).errors.diction);
    assert.equal(clientRejects, hostRejects, `control ${code}`);
  }

  const raw = '  可可爱爱\t\r\n（状态）\n  ';
  assert.equal(api.validateDraft({ rhythm: '', expression: '', diction: raw, syntax: '' }).values.diction, raw);
  assert.equal(api.validateDraft({ syntax: '\n用户：你好\n助手：嗯' }).values.syntax, '\n用户：你好\n助手：嗯');

  // 保存基线只在原值相等时才算没改动。
  assert.equal(api.valuesEqual({ rhythm: '', expression: '', diction: raw, syntax: '' }, { rhythm: '', expression: '', diction: raw, syntax: '' }), true);
  assert.equal(api.valuesEqual({ rhythm: '', expression: '', diction: 'x', syntax: '' }, { rhythm: '', expression: '', diction: 'x ', syntax: '' }), false);
  assert.equal(api.valuesEqual({ rhythm: '', expression: '', diction: '', syntax: '' }, {}), true);
  assert.equal(api.normalizeConfig({ rhythm: '', expression: '', diction: 'a', syntax: 'b', future: 1 }).diction, 'a');
  assert.equal(api.normalizeConfig({ rhythm: '', expression: '', diction: 'a' }), null);
  assert.equal(api.normalizeConfig(null), null);
  assert.equal(api.isBlank({ rhythm: '', expression: '', diction: ' ', syntax: '' }), false, 'whitespace is content, not emptiness');
});

test('保存按钮只在有效且未保存的改动时亮起', () => {
  const { api } = makeHarness();
  const base = { rhythm: '', expression: '', diction: '可可爱爱', syntax: '' };
  const form = (props) => api.ToneForm({
    form: base,
    errors: {},
    saving: false,
    dirty: false,
    canClear: true,
    statusText: '保存后下一轮起生效；只改这四项。',
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

  const dirty = form({ dirty: true, form: { ...base, diction: '新的' }, statusText: '改了还没保存' });
  assert.equal(button(dirty, '保存').props.disabled, false);
  assert.equal(button(dirty, '保存').props.style.opacity, 1);
  assert.equal(button(dirty, '撤回').props.disabled, false);
  assert.match(textOf(dirty), /改了还没保存/);

  const saving = form({ dirty: true, saving: true, statusText: '保存中…' });
  assert.equal(button(saving, '保存中…').props.disabled, true);
  assert.equal(button(saving, '清空').props.disabled, true);
  assert.deepEqual(select(saving, 'textarea').map((node) => node.props.disabled), [true, true, true, true]);

  const invalid = form({
    dirty: true,
    errors: { diction: '措辞最多 32000 个字符。' },
    statusText: '校验未通过：措辞最多 32000 个字符。',
    statusTone: 'error',
  });
  assert.equal(button(invalid, '保存').props.disabled, true);
  assert.match(textOf(invalid), /校验未通过/);
  assert.equal(walk(invalid).some((node) => node.props?.['aria-invalid'] === true), true);
});

test('编辑后保存：完整四项发给 RPC，成功用返回配置更新保存基线', async () => {
  const harness = makeHarness();
  const calls = [];
  const rpcCall = async (method, payload) => {
    calls.push({ method, payload });
    if (method === 'tone.config') return okConfig({ rhythm: '', expression: '', diction: '', syntax: '' });
    return okConfig(payload);
  };
  harness.render(rpcCall);
  harness.mount();
  await tick();

  let tree = harness.render(rpcCall);
  let form = formOf(tree, harness.api);
  form.props.onChange('diction', '用括号表示状态');
  tree = harness.render(rpcCall);
  form = formOf(tree, harness.api);
  form.props.onChange('syntax', '用户：你好\n助手：嗯～');
  tree = harness.render(rpcCall);
  assert.match(textOf(statusOf(tree)), /改了还没保存/);
  form = formOf(tree, harness.api);
  assert.equal(button(tree, '保存').props.disabled, false);

  form.props.onSave();
  await tick();
  const saveCall = calls.find((call) => call.method === 'tone.config.save');
  assert.deepEqual(plain(saveCall.payload), { rhythm: '', expression: '', diction: '用括号表示状态', syntax: '用户：你好\n助手：嗯～' });

  tree = harness.render(rpcCall);
  assert.match(textOf(statusOf(tree)), /已保存，下一轮起生效/);
  assert.equal(button(tree, '保存').props.disabled, true, 'a committed save leaves nothing to save');
  assert.deepEqual(plain(harness.states[0]), { rhythm: '', expression: '', diction: '用括号表示状态', syntax: '用户：你好\n助手：嗯～' });
  assert.deepEqual(plain(harness.states[1]), { rhythm: '', expression: '', diction: '用括号表示状态', syntax: '用户：你好\n助手：嗯～' });
});

test('保存失败保留草稿与旧基线，不显示成已保存', async () => {
  const harness = makeHarness();
  const rpcCall = async (method, payload) => {
    if (method === 'tone.config') return okConfig({ rhythm: '', expression: '', diction: '旧内容', syntax: '' });
    assert.deepEqual(plain(payload), { rhythm: '', expression: '', diction: '新内容', syntax: '' });
    return { ok: false, error: { code: 'tone/failed', message: '文件损坏' } };
  };
  harness.render(rpcCall);
  harness.mount();
  await tick();
  let tree = harness.render(rpcCall);
  formOf(tree, harness.api).props.onChange('diction', '新内容');
  tree = harness.render(rpcCall);
  formOf(tree, harness.api).props.onSave();
  await tick();
  tree = harness.render(rpcCall);
  assert.match(textOf(statusOf(tree)), /保存失败：文件损坏；草稿还留着/);
  assert.equal(plain(harness.states[0]).diction, '新内容', 'the draft survives a failed save');
  assert.equal(plain(harness.states[1]).diction, '旧内容', 'the baseline only moves on a real save');
  assert.equal(button(tree, '保存').props.disabled, false, 'still dirty, so it can be retried');

  // A malformed success body is a failure too: baseline must not move to it.
  const harness2 = makeHarness();
  let stage = 'read';
  const rpc2 = async (method) => {
    if (method === 'tone.config') return okConfig({ rhythm: '', expression: '', diction: 'a', syntax: '' });
    stage = 'saved';
    return { ok: true, value: { config: { rhythm: '', expression: '', diction: 'a' } } };
  };
  harness2.render(rpc2);
  harness2.mount();
  await tick();
  let tree2 = harness2.render(rpc2);
  formOf(tree2, harness2.api).props.onChange('syntax', 'b');
  tree2 = harness2.render(rpc2);
  formOf(tree2, harness2.api).props.onSave();
  await tick();
  tree2 = harness2.render(rpc2);
  assert.equal(stage, 'saved');
  assert.match(textOf(statusOf(tree2)), /保存返回的配置格式不对/);
  assert.deepEqual(plain(harness2.states[1]), { rhythm: '', expression: '', diction: 'a', syntax: '' });
  assert.equal(plain(harness2.states[0]).syntax, 'b');
});

test('晚返回的保存不覆盖保存期间新打的草稿', async () => {
  const harness = makeHarness();
  let release;
  const gate = new Promise((done) => { release = done; });
  const rpcCall = async (method, payload) => {
    if (method === 'tone.config') return okConfig({ rhythm: '', expression: '', diction: 'a', syntax: '' });
    await gate;
    return okConfig({ rhythm: '', expression: '', diction: 'a', syntax: 'b' });
  };
  harness.render(rpcCall);
  harness.mount();
  await tick();
  let tree = harness.render(rpcCall);
  formOf(tree, harness.api).props.onChange('syntax', 'b');
  tree = harness.render(rpcCall);
  formOf(tree, harness.api).props.onSave();

  // 保存请求还在路上，用户换了第二版草稿。
  tree = harness.render(rpcCall);
  formOf(tree, harness.api).props.onChange('syntax', '更新的草稿');
  tree = harness.render(rpcCall);
  assert.equal(plain(harness.states[0]).syntax, '更新的草稿');

  release();
  await tick();
  tree = harness.render(rpcCall);
  assert.equal(plain(harness.states[0]).syntax, '更新的草稿', 'the reply must not stomp newer typing');
  assert.deepEqual(plain(harness.states[1]), { rhythm: '', expression: '', diction: 'a', syntax: 'b' }, 'the reply is still the new baseline');
  assert.equal(button(tree, '保存').props.disabled, false, 'the newer draft is still unsaved');
});

test('清空四项：发空字符串、四项都回到空白、不注入任何内容', async () => {
  const harness = makeHarness();
  const calls = [];
  const rpcCall = async (method, payload) => {
    calls.push({ method, payload });
    if (method === 'tone.config') return okConfig({ rhythm: '', expression: '', diction: '可可爱爱', syntax: '用户：你好' });
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
  assert.deepEqual(plain(saveCall.payload), { rhythm: '', expression: '', diction: '', syntax: '' });
  tree = harness.render(rpcCall);
  assert.deepEqual(plain(harness.states[0]), { rhythm: '', expression: '', diction: '', syntax: '' });
  assert.deepEqual(plain(harness.states[1]), { rhythm: '', expression: '', diction: '', syntax: '' });
  assert.match(textOf(statusOf(tree)), /已清空，下一轮起不再注入/);
  assert.equal(button(tree, '清空').props.disabled, true, 'nothing left to clear');
  assert.equal(areas(tree).map((node) => node.props.value).join(''), '');
});

test('空白内容原样保存，不会被 trim 成空字符串以外的东西', () => {
  const { api } = makeHarness();
  assert.deepEqual(plain(api.payloadOf({ rhythm: '', expression: '', diction: ' 空格 \n', syntax: '\t' })), { rhythm: '', expression: '', diction: ' 空格 \n', syntax: '\t' });
  assert.deepEqual(plain(api.configOf({ ok: true, value: { config: { rhythm: '', expression: '', diction: 'x', syntax: '' } } })), { rhythm: '', expression: '', diction: 'x', syntax: '' });
  assert.equal(api.configOf({ ok: false, error: { message: 'x' } }), null);
  assert.equal(api.configOf({ ok: true, value: { config: null } }), null);
});


test('四个维度使用宿主原值，不复制默认值或生成旧字段', async () => {
  const harness = makeHarness();
  const baseline = { diction: '宿主选词', syntax: '宿主句式', rhythm: '宿主节奏', expression: '宿主显隐' };
  const rpc = async () => okConfig(baseline);
  harness.render(rpc);
  harness.mount();
  await tick();
  const tree = harness.render(rpc);
  assert.deepEqual(areas(tree).map((node) => node.props.id), ['tone-diction', 'tone-syntax', 'tone-rhythm', 'tone-expression']);
  assert.deepEqual(areas(tree).map((node) => node.props.value), Object.values(baseline));
  assert.deepEqual(plain(harness.api.FIELDS).map(({ label }) => label), ['措辞', '句式', '节奏', '表达的显隐']);
  assert.deepEqual(plain(harness.api.payloadOf({ ...baseline, description: '旧', examples: '旧' })), baseline);
  for (const key of Object.keys(baseline)) {
    const { [key]: missing, ...incomplete } = baseline;
    assert.equal(harness.api.normalizeConfig(incomplete), null, key + ' must come from Host');
    assert.ok(harness.api.validateDraft({ ...baseline, [key]: 'x'.repeat(32001) }).errors[key]);
  }
});

test('四项分别编辑后完整保存，撤回恢复宿主基线', async () => {
  const harness = makeHarness();
  const baseline = { diction: '原措辞', syntax: '原句式', rhythm: '原节奏', expression: '原显隐' };
  const calls = [];
  const rpc = async (method, payload) => {
    calls.push({ method, payload });
    return okConfig(method === 'tone.config' ? baseline : payload);
  };
  harness.render(rpc);
  harness.mount();
  await tick();
  let tree = harness.render(rpc);
  formOf(tree, harness.api).props.onChange('expression', '临时显隐');
  tree = harness.render(rpc);
  button(tree, '撤回').props.onClick();
  tree = harness.render(rpc);
  assert.deepEqual(areas(tree).map((node) => node.props.value), Object.values(baseline));
  assert.equal(button(tree, '保存').props.disabled, true);
  const changed = { diction: '新措辞', syntax: '新句式', rhythm: '新节奏', expression: '新显隐' };
  for (const [key, value] of Object.entries(changed)) {
    formOf(tree, harness.api).props.onChange(key, value);
    tree = harness.render(rpc);
  }
  button(tree, '保存').props.onClick();
  await tick();
  tree = harness.render(rpc);
  assert.deepEqual(plain(calls[1].payload), changed);
  assert.deepEqual(areas(tree).map((node) => node.props.value), Object.values(changed));
  assert.equal(button(tree, '保存').props.disabled, true);
});
