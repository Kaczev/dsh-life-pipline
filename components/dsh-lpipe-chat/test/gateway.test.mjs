import test from 'node:test';
import assert from 'node:assert/strict';
import { InboundGateway } from '../src/gateway.mjs';

const quiet = { warn() {} };
const message = (text, at) => ({ channel: 'weixin', channelLabel: '微信', conversationKind: 'dm', senderName: 'Kaczev', text, ...(at ? { at } : {}) });
const tick = () => new Promise(setImmediate);
// The burst ends when nothing new has arrived for the quiet period, so every
// assertion has to move the fake clock past it first.
const flush = async (t, ms = 3000) => {
  t.mock.timers.tick(ms);
  await tick();
};
// Small holder 3s, big holder 6s: a burst closes on silence, and a notice
// opens a window in which whatever follows is collected for one late delivery.
function setup(t, deliver, config = { mainSessionId: 'session-main', quietSeconds: 3, windowSeconds: 6 }, saveImages = null) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const gateway = new InboundGateway({ getConfig: () => config, log: quiet, deliver, saveImages });
  t.after(() => gateway.dispose());
  return gateway;
}

test('a burst arrives as one notice once the quiet period passes, with real newlines', async (t) => {
  const notices = [];
  const gateway = setup(t, async (r) => notices.push(r));
  gateway.accept(message('在吗'));
  await tick();
  assert.equal(notices.length, 0, 'the first message waits for the quiet period');
  gateway.accept(message('我下班了'));
  gateway.accept(message('买了菜'));
  await flush(t);
  assert.equal(notices.length, 1, 'one burst, one notice');
  assert.equal(notices[0].sessionId, 'session-main');
  assert.equal(notices[0].message.source.kind, 'dsh-lpipe-chat');
  assert.equal(notices[0].message.source.form, 'notice');
  assert.equal(notices[0].message.role, 'user');
  assert.ok(notices[0].message.id);
  assert.ok(Object.isFrozen(notices[0].message.content[0]));
  assert.equal(
    notices[0].message.content[0].text,
    ['[微信 · Kaczev] 在吗', '[微信 · Kaczev] 我下班了', '[微信 · Kaczev] 买了菜'].join(String.fromCharCode(10)),
  );
  assert.equal(gateway.pending, 0);
});

test('every new message restarts the quiet period instead of adding one', async (t) => {
  const notices = [];
  const gateway = setup(t, async (r) => notices.push(r));
  gateway.accept(message('一'));
  await flush(t, 2000);
  assert.equal(notices.length, 0, 'still inside the quiet period');
  gateway.accept(message('二'));
  await flush(t, 2000);
  assert.equal(notices.length, 0, 'the second message pushed the deadline back');
  await flush(t, 1500);
  assert.equal(notices.length, 1);
  assert.equal(
    notices[0].message.content[0].text,
    ['[微信 · Kaczev] 一', '[微信 · Kaczev] 二'].join(String.fromCharCode(10)),
  );
});

test('two separate bursts produce two notices', async (t) => {
  const notices = [];
  const gateway = setup(t, async (r) => notices.push(r));
  gateway.accept(message('早'));
  await flush(t);
  assert.equal(notices.length, 1);
  gateway.accept(message('还在吗'));
  // The window opened by the first notice has to end before the next one goes.
  await flush(t, 6000);
  assert.equal(notices.length, 2);
  assert.equal(notices[0].message.content[0].text, '[微信 · Kaczev] 早');
  assert.equal(notices[1].message.content[0].text, '[微信 · Kaczev] 还在吗');
});

test('the big holder collects everything that follows a notice into one delivery', async (t) => {
  const notices = [];
  const gateway = setup(t, async (r) => notices.push(r));
  gateway.accept(message('一'));
  await flush(t);
  assert.equal(notices.length, 1);
  // Three separate bursts, each quiet on its own, but all inside the window.
  gateway.accept(message('二'));
  await flush(t, 2000);
  gateway.accept(message('三'));
  await flush(t, 2000);
  gateway.accept(message('四'));
  await flush(t, 2000);
  assert.equal(notices.length, 1, 'the window still holds them together');
  await flush(t, 3000);
  assert.equal(notices.length, 2);
  assert.equal(
    notices[1].message.content[0].text,
    ['[微信 · Kaczev] 二', '[微信 · Kaczev] 三', '[微信 · Kaczev] 四'].join(String.fromCharCode(10)),
  );
});

test('unset main session retains all messages and recovers after configuration', async (t) => {
  const config = { mainSessionId: '', quietSeconds: 3, windowSeconds: 6 };
  const notices = [];
  const gateway = setup(t, async (r) => notices.push(r), config);
  gateway.accept(message('one'));
  gateway.accept(message('two'));
  assert.equal(gateway.pending, 2);
  config.mainSessionId = 'session-main';
  await flush(t);
  assert.equal(notices.length, 1);
  assert.match(notices[0].message.content[0].text, /one\n.*two/);
});

test('a slow delivery across the quiet deadline never discards buffered messages', async (t) => {
  const notices = [];
  let release;
  const gateway = setup(t, (r) => {
    notices.push(r);
    return notices.length === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve();
  });
  gateway.accept(message('one'));
  await flush(t);
  assert.equal(notices.length, 1, 'the first delivery is in flight');
  gateway.accept(message('two'));
  gateway.accept(message('three'));
  await tick();
  assert.equal(gateway.pending, 2, 'messages that arrive mid-flight are held');
  release();
  await tick();
  await flush(t, 7000);
  assert.equal(notices.length, 2);
  assert.match(notices[1].message.content[0].text, /two\n.*three/);
});

test('delivery failure retries the entire batch in order', async (t) => {
  const notices = [];
  const gateway = setup(t, async (r) => {
    notices.push(r);
    if (notices.length === 1) throw new Error('session unavailable');
  });
  gateway.accept(message('one'));
  gateway.accept(message('two'));
  await flush(t);
  assert.equal(gateway.pending, 2);
  await flush(t);
  assert.match(notices[1].message.content[0].text, /one\n.*two/);
  assert.equal(gateway.pending, 0);
});

test('dispose during delivery prevents requeue, timers and late accepts', async (t) => {
  let reject;
  const gateway = setup(t, () => new Promise((_, fail) => { reject = fail; }));
  gateway.accept(message('one'));
  // Storing pictures happens before delivery, so the promise starts a microtask
  // later; let it start, then pull the plug mid-flight.
  await flush(t);
  gateway.dispose();
  reject(new Error('late failure'));
  await tick();
  gateway.accept(message('late'));
  t.mock.timers.tick(9000);
  assert.equal(gateway.pending, 0);
});

test('a burst gets one timestamp at its head, not one per message', async (t) => {
  const notices = [];
  const gateway = setup(t, async (r) => notices.push(r));
  const base = new Date(2026, 10, 5, 9, 0).getTime();
  gateway.accept(message('早', new Date(base).toISOString()));
  gateway.accept(message('刚醒', new Date(base + 60_000).toISOString()));
  gateway.accept(message('错过了什么', new Date(base + 30 * 60_000).toISOString()));
  await flush(t);
  const lines = notices
    .map((notice) => notice.message.content[0].text)
    .join(String.fromCharCode(10))
    .split(String.fromCharCode(10));
  assert.deepEqual(lines, [
    '09:00',
    '[微信 · Kaczev] 早',
    '[微信 · Kaczev] 刚醒',
    '09:30',
    '[微信 · Kaczev] 错过了什么',
  ]);
});

const picture = (name = 'image') => ({ name, mediaType: 'image/png', data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) });

test('a picture rides in the same notice as the words', async (t) => {
  const notices = [];
  const saved = [];
  const gateway = setup(
    t,
    async (r) => notices.push(r),
    undefined,
    async (inputs) => {
      saved.push(...inputs);
      return [{ attachmentId: 'att-1', mediaType: 'image/png', bytes: 4, width: 1, height: 1 }];
    },
  );
  gateway.accept({ ...message('看这个'), images: [picture()] });
  await flush(t);
  const [text, image] = notices[0].message.content;
  assert.equal(text.type, 'text');
  assert.match(text.text, /看这个/);
  assert.equal(image.type, 'image');
  assert.equal(image.attachment.attachmentId, 'att-1');
  assert.ok(Object.isFrozen(image), 'every content part is frozen before publication');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].mediaType, 'image/png');
});

test('a picture on its own still reads as a message', async (t) => {
  const notices = [];
  const gateway = setup(t, async (r) => notices.push(r), undefined, async () => [
    { attachmentId: 'att-1', mediaType: 'image/png', bytes: 4, width: 1, height: 1 },
  ]);
  gateway.accept({ ...message(''), images: [picture()] });
  await flush(t);
  assert.equal(notices[0].message.content[0].text, '[微信 · Kaczev] （1 张图片）');
});

test('a batch never carries more pictures than one message may hold', async (t) => {
  const notices = [];
  const counts = [];
  const gateway = setup(t, async (r) => notices.push(r), undefined, async (inputs) => {
    counts.push(inputs.length);
    return inputs.map((_input, index) => ({ attachmentId: `att-${index}`, mediaType: 'image/png', bytes: 4 }));
  });
  // One message, six pictures: the cap belongs to the injected batch.
  gateway.accept({ ...message(''), images: [picture(), picture(), picture(), picture(), picture(), picture()] });
  await flush(t);
  assert.deepEqual(counts, [4]);
  assert.equal(notices[0].message.content.filter((part) => part.type === 'image').length, 4);
});

test('a refused picture still delivers the words, with a note', async (t) => {
  const notices = [];
  const gateway = setup(t, async (r) => notices.push(r), undefined, async () => {
    throw new Error('Image is too large for one message.');
  });
  gateway.accept({ ...message('这张图很大'), images: [picture()] });
  await flush(t);
  const content = notices[0].message.content;
  assert.equal(content.length, 1, 'no image part survives a refusal');
  assert.match(content[0].text, /这张图很大/);
  assert.match(content[0].text, /1 张图片没能取过来：Image is too large/);
});

test('a host without an attachment service says so instead of silently dropping the picture', async (t) => {
  const notices = [];
  const gateway = setup(t, async (r) => notices.push(r));
  gateway.accept({ ...message('看图'), images: [picture()] });
  await flush(t);
  assert.match(notices[0].message.content[0].text, /没有附件服务/);
  assert.equal(notices[0].message.content.length, 1);
});

test('a model without vision still gets the words, and the pictures are dropped once', async (t) => {
  const attempts = [];
  const gateway = setup(t, async (r) => {
    attempts.push(r.message);
    if (r.message.content.some((part) => part.type === 'image')) {
      throw new Error('DeepSeek Messages image input requires a vision model');
    }
  }, undefined, async () => [{ attachmentId: 'att-1', mediaType: 'image/png', bytes: 4 }]);
  gateway.accept({ ...message('这张图'), images: [picture()] });
  await flush(t);
  assert.equal(attempts.length, 2);
  assert.equal(attempts[1].content.length, 1);
  assert.match(attempts[1].content[0].text, /这张图/);
  assert.match(attempts[1].content[0].text, /图片没能随这条消息进入：DeepSeek Messages image input requires a vision model/);
});
