/** Match background completion delivery without entering human prompt/steer. */
export function createNoticeDelivery(controller) {
  let disposed = false;
  return {
    async deliver({ sessionId, message }) {
      if (disposed) throw new Error('notice delivery was disposed');
      if (typeof controller?.resolveAgent !== 'function') {
        throw new Error('sessionController.resolveAgent is unavailable');
      }
      const result = await controller.resolveAgent(sessionId);
      if (disposed) throw new Error('notice delivery was disposed');
      if (!result?.agent) {
        throw new Error(`cannot resolve main session: ${JSON.stringify(result?.error ?? 'unavailable')}`);
      }
      const agent = result.agent;
      if (agent.status === 'idle') agent.followup(message);
      else agent.inject(message);
    },
    dispose() { disposed = true; },
  };
}
