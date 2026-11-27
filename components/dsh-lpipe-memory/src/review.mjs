export const REVIEW_NOTICE = 'A memory review is due. When idle, revisit your wishes, settings, and relevant scenes. Correct or reclassify entries where needed. If a connection suggests a new idea, keep it as a thought rather than a fact. Do not move private content into a shared list. Leave entries unchanged when no revision is needed.';

// A missed deadline stays due until the configured main agent accepts a followup.
export function createReviewRunner({ current, controller, mainId, advance, now = Date.now, warn }) {
  let active = true, running = false, timer, accepted = null;
  async function tick() {
    if (!active || running) return;
    running = true;
    try {
      const state = await current();
      const due = state?.review?.nextReviewAt;
      if (!active || !state?.review?.enabled || due == null || now() < due) return;
      if (accepted !== due) {
        const id = mainId();
        if (!id) return;
        const { agent } = await controller.resolveAgent(id);
        const latest = await current();
        if (!active || mainId() !== id || agent?.status !== 'idle' || !latest?.review.enabled || latest.review.nextReviewAt !== due || now() < due) return;
        const shared = ['wishes', 'settings', 'recollections'].filter(k => latest.allSessions && latest.sharedLists[k]);
        const text = `${REVIEW_NOTICE}\nShared lists: ${shared.join(', ') || 'none'}.`;
        const result = await agent.followup({ id: `memory-review-${latest.storeId}-${due}`, role: 'user', content: [{ type: 'text', text }], source: { kind: 'dsh-lpipe-memory/review', form: 'notice', summary: '记忆管线 · 回顾', due } });
        if (result === false) return;
        accepted = due;
      }
      await advance(due, now());
      accepted = null;
    } catch (error) { warn(error); }
    finally { running = false; }
  }
  return { tick, start() { if (!timer && active) { timer = setInterval(tick, 5000); timer.unref?.(); void tick(); } }, dispose() { active = false; clearInterval(timer); } };
}
