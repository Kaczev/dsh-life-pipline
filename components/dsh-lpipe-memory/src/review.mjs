import { MEMORY_KINDS } from './store.mjs';

const categories = new Intl.ListFormat('en');
function reviewNotice(state) {
  const enabled = MEMORY_KINDS.filter(kind => state[kind].enabled);
  const hasEntries = enabled.some(kind => kind === 'recollections'
    ? state.recollections.scenes.some(scene => scene.entries.length > 0)
    : state[kind].entries.length > 0);
  if (!hasEntries) return null;
  const text = `When idle, review your ${categories.format(enabled)}. Correct or reclassify entries where useful. Keep private content out of shared lists.`;
  return state.recollections.enabled ? `${text} Save new interpretations as thoughts.` : text;
}

// Reviews with entries stay due until the configured main agent accepts a followup.
export function createReviewRunner({ current, controller, mainId, advance, now = Date.now, warn }) {
  let active = true, running = false, timer, accepted = null;
  async function tick() {
    if (!active || running) return;
    running = true;
    try {
      const state = await current();
      const due = state?.review?.nextReviewAt;
      if (!active || !state?.review?.enabled || due == null || now() < due) return;
      if (accepted !== due && reviewNotice(state)) {
        const id = mainId();
        if (!id) return;
        const { agent } = await controller.resolveAgent(id);
        const latest = await current();
        if (!active || mainId() !== id || !latest?.review.enabled || latest.review.nextReviewAt !== due || now() < due) return;
        const text = reviewNotice(latest);
        if (text) {
          if (agent?.status !== 'idle') return;
          const result = await agent.followup({ id: `memory-review-${latest.storeId}-${due}`, role: 'user', content: [{ type: 'text', text }], source: { kind: 'dsh-lpipe-memory/review', form: 'notice', summary: '记忆管线 · 回顾', due } });
          if (result === false) return;
          accepted = due;
        }
      }
      await advance(due, now());
      accepted = null;
    } catch (error) { warn(error); }
    finally { running = false; }
  }
  return { tick, start() { if (!timer && active) { timer = setInterval(tick, 5000); timer.unref?.(); void tick(); } }, dispose() { active = false; clearInterval(timer); } };
}
