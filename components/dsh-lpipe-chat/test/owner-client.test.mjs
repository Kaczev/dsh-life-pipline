import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('Owner field lives in Chat, saves through Chat RPC and supports clear, cancel and validation', async () => {
  const states = [], refs = [];
  let cursor, refCursor;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) { const i = cursor++; if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial; return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef(initial) { return refs[refCursor++] ??= { current: initial }; },
    useEffect() {}, useCallback: fn => fn,
  };
  const module = { exports: {} }, calls = [];
  vm.runInNewContext(readFileSync(new URL('../client/panel.js', import.meta.url), 'utf8'), { require: () => React, module });
  let config = { ownerName: 'Owner', quietSeconds: 1, windowSeconds: 5, outputBytes: 16384, downloadBytes: 536870912, downloadRetentionDays: 7 };
  const render = () => { cursor = refCursor = 0; return module.exports.__test__.ChatSettingsPanel({ rpcCall: async (method, payload) => { calls.push({ method, payload }); config = { ...config, ...payload, ownerName: payload.ownerName.trim(), outputBytes: 16384, downloadBytes: 536870912 }; return { ok: true, value: { config, channels: {} } }; } }); };
  const find = (node, predicate) => !node || typeof node !== 'object' ? null : predicate(node) ? node : (node.children ?? []).flat(Infinity).map(child => find(child, predicate)).find(Boolean);
  render(); states[0] = { config, channels: {} }; states[8] = 'Owner';
  const save = tree => find(tree, n => n.type === 'button' && n.children.includes('保存'));
  let tree = render(); assert.equal(save(tree).props.disabled, true);
  const field = find(tree, n => n.props.id === 'dsh-lpipe-chat-owner'); assert.ok(field);
  field.props.setValue(' New '); tree = render(); assert.equal(save(tree).props.disabled, false);
  await save(tree).props.onClick(); assert.equal(calls[0].method, 'chat.config.save'); assert.equal(calls[0].payload.ownerName, ' New ');
  tree = render(); assert.equal(save(tree).props.disabled, true);
  states[8] = 'x'.repeat(201); assert.equal(save(render()).props.disabled, true);
  states[8] = 'bad\nname'; assert.equal(save(render()).props.disabled, true);
  states[8] = ''; tree = render(); assert.equal(save(tree).props.disabled, false);
  find(tree, n => n.type === 'button' && n.children.includes('取消')).props.onClick(); assert.equal(states[8], 'New');
  states[8] = ''; await save(render()).props.onClick(); assert.equal(calls.at(-1).payload.ownerName, '');
  assert.doesNotMatch(readFileSync(new URL('../../dsh-lpipe-home/client/panel.js', import.meta.url), 'utf8'), /dsh-lpipe-home-owner|OWNER_LABEL/);
});
