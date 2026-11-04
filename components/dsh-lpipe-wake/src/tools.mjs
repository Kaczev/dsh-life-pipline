import { normalizeState } from './engine.mjs';

const asIso = (ms) => (Number.isFinite(ms) ? new Date(ms).toISOString() : null);

/** `45m`, `2h`, `90s`, or a bare number of minutes. */
export function parseDuration(text) {
  const value = String(text ?? '').trim().toLowerCase();
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/.exec(value);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] ?? 'm';
  const scale = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  const ms = Math.round(amount * scale);
  return Number.isFinite(ms) && ms > 0 ? ms : null;
}

/**
 * The tool I use to move my own next wake. It only places a deadline; the
 * engine's rule "activity clears it" still applies afterwards.
 */
export function createWakeTools({ runner, now = () => Date.now() }) {
  const status = () => {
    const state = normalizeState(runner.snapshot(), now());
    return {
      nextWakeAt: asIso(state.nextWakeAt),
      defaultIntervalMs: state.defaultIntervalMs,
      lastActivityEndedAt: asIso(state.lastActivityEndedAt),
      lastWokeAt: asIso(state.lastWokeAt),
      now: asIso(now()),
    };
  };

  return [{
    name: 'wake_set',
    description: 'Move or clear my own next wake-up. Call it with no arguments to read the current schedule. The wake itself always follows the engine rule: starting any activity clears it.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        in: { type: 'string', description: 'Wake after this long, e.g. "45m", "2h", "90s".' },
        at: { type: 'string', description: 'Wake at this instant (ISO 8601 with offset).' },
        clear: { type: 'boolean', description: 'Drop the manual deadline and fall back to the default interval.' },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          nextWakeAt: { type: ['string', 'null'] },
          defaultIntervalMs: { type: 'number' },
          lastActivityEndedAt: { type: ['string', 'null'] },
          now: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['summary'],
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    async execute(args) {
      const input = args && typeof args === 'object' ? args : {};
      if (input.clear === true) {
        runner.clearNextWake();
        return { ...status(), summary: '下一次唤醒改回默认推算。' };
      }
      if (Object.hasOwn(input, 'in')) {
        const ms = parseDuration(input.in);
        if (ms === null) return { ...status(), summary: `看不懂这个时长：${input.in}` };
        runner.setNextWake(now() + ms);
        return { ...status(), summary: `下次唤醒改到 ${new Date(now() + ms).toISOString()}。` };
      }
      if (Object.hasOwn(input, 'at')) {
        const at = Date.parse(String(input.at));
        if (!Number.isFinite(at)) return { ...status(), summary: `看不懂这个时间：${input.at}` };
        runner.setNextWake(at);
        return { ...status(), summary: `下次唤醒改到 ${new Date(at).toISOString()}。` };
      }
      const state = status();
      return { ...state, summary: state.nextWakeAt ? `下次唤醒：${state.nextWakeAt}` : '现在没有待触发的唤醒。' };
    },
  }];
}
