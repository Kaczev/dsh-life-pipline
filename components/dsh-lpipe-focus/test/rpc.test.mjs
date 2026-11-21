import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DEFAULT_CONFIG, configFile, loadConfig, saveConfig } from '../src/config.mjs';
import { FOCUS_RPC_ENDPOINT, createFocusRpcHandler, registerFocusRpc } from '../src/rpc.mjs';

const makeRequest = (body, options = {}) =>
  new Request(`http://localhost/api/${FOCUS_RPC_ENDPOINT}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...options,
  });

const envelope = (method, payload = {}, rpcId = 'focus-1') => ({
  type: 'client-request',
  rpcId,
  method: FOCUS_RPC_ENDPOINT,
  payload: { method, payload },
});

test('RPC route handles config read/save, preserves unknown keys, and validates envelopes and HTTP inputs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'lpipe-focus-rpc-'));
  try {
    let route = null;
    const disposer = () => {};
    const handle = createFocusRpcHandler({
      load: () => loadConfig(root),
      save: (patch) => saveConfig(patch, root),
    });
    const returnedDisposer = registerFocusRpc(
      { connection: { fetch: { register(r) { route = r; return disposer; } } } },
      handle,
    );
    assert.equal(returnedDisposer, disposer);
    assert.equal(route.path, `/api/${FOCUS_RPC_ENDPOINT}`);
    assert.deepEqual(route.methods, ['POST']);

    const call = async (body) => (await route.fetch(makeRequest(body))).json();

    const initial = await call(envelope('focus.config', {}));
    assert.equal(initial.type, 'server-response');
    assert.equal(initial.rpcId, 'focus-1');
    assert.deepEqual(initial.result, {
      ok: true,
      value: { config: DEFAULT_CONFIG, defaults: DEFAULT_CONFIG },
    });

    const updated = await call(envelope('focus.config.save', { idleMinutes: 45, compactChars: 500000 }));
    assert.equal(updated.result.ok, true);
    assert.equal(updated.result.value.config.idleMinutes, 45);
    assert.equal(updated.result.value.config.compactChars, 500000);

    // Non-empty payload on focus.config is rejected
    const badRead = await call(envelope('focus.config', { extra: 1 }));
    assert.equal(badRead.result.ok, false);
    assert.equal(badRead.result.error.code, 'focus/bad-request');

    // Unknown method
    const unknown = await call(envelope('focus.other', {}));
    assert.equal(unknown.result.ok, false);
    assert.equal(unknown.result.error.code, 'focus/unknown-method');

    // Bad save payloads
    for (const bad of [null, [], {}, { idleMinutes: '45' }, { extra: 10 }, { compactChars: 100000, nudgeChars: 120000 }]) {
      const res = await call(envelope('focus.config.save', bad));
      assert.equal(res.result.ok, false);
    }

    // Bad envelopes
    for (const badEnv of [
      null,
      [],
      {},
      { ...envelope('focus.config'), method: 'wrong-endpoint' },
      { ...envelope('focus.config'), payload: { method: 'focus.config' } },
    ]) {
      const res = await call(badEnv);
      assert.equal(res.result.error.code, 'focus/bad-request');
    }

    // HTTP status rejections
    assert.equal((await route.fetch(new Request(`http://localhost/api/${FOCUS_RPC_ENDPOINT}`))).status, 405);
    assert.equal((await route.fetch(makeRequest('{}', { headers: { 'content-type': 'text/plain' } }))).status, 415);
    assert.equal((await route.fetch(makeRequest('{broken'))).status, 400);

    // Corrupt config surfaces error and keeps file intact
    writeFileSync(configFile(root), 'corrupt-json');
    const corruptReply = await call(envelope('focus.config', {}));
    assert.equal(corruptReply.result.ok, false);
    assert.equal(corruptReply.result.error.code, 'focus/corrupt-config');
    assert.equal(readFileSync(configFile(root), 'utf8'), 'corrupt-json');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
