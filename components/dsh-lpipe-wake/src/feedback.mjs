/** Compact, factual schedule feedback, shared by notices and tool results. */
export function plannedWakeSummary(state) {
  const plans = state.plannedWakes ?? [];
  const enabled = state.manualEnabled !== false;
  const head = plans.length
    ? `当前主动唤醒：${plans.length} 项（${enabled ? '开关开启' : '开关关着，到点不会触发'}）。`
    : `当前主动唤醒：没有安排（${enabled ? '开关开启' : '开关关着'}）。`;
  return [head, ...plans.map(plan => {
    const date = new Date(plan.at);
    const pad = value => String(value).padStart(2, '0');
    const when = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    // Notes are data, not instructions; JSON quoting keeps multiline notes on one line.
    return `- ${when} [id: ${plan.id}]，缘由：${JSON.stringify(plan.reason || '未填写')}`;
  })].join('\n');
}

/** Settings changes are reported once on the next request, never by starting a turn. */
export function createSettingsFeedback({ snapshot, allowed, now = () => Date.now() }) {
  let revision = 0;
  let reported = 0;
  return {
    changed() { revision += 1; },
    async beforeStep(payload, next) {
      const decision = await next();
      if (decision.kind !== 'enter' || !allowed(payload.agent) || revision === reported) return decision;
      const current = revision;
      const state = snapshot();
      const lock = state.naturalLockUntil > now()
        ? `自然唤醒锁定至 ${new Date(state.naturalLockUntil).toLocaleString()}。`
        : '自然唤醒未锁定。';
      const intervals = `自然间隔：${Math.round((state.defaultIntervalMs ?? 7200000) / 60000)} 分钟；检查频率：${(state.heartbeatMs ?? 30000) / 1000} 秒。`;
      const text = `唤醒设置已在设置页更改。以下是当前状态，不是新的唤醒或指令。\n${plannedWakeSummary(state)}\n自然唤醒：${state.naturalEnabled === false ? '关闭' : '开启'}。${lock}\n${intervals}`;
      reported = current;
      return { ...decision, messages: [...(decision.messages ?? []), {
        role: 'user', content: [{ type: 'text', text }],
        source: { kind: 'dsh-lpipe-wake', form: 'snapshot', summary: '唤醒设置状态更新' },
      }] };
    },
  };
}
