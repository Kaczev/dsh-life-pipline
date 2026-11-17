const DIMENSIONS = Object.freeze([
  ['diction', 'Diction — word choice'],
  ['syntax', 'Syntax — sentence structure'],
  ['rhythm', 'Rhythm — pacing and pauses'],
  ['expression', 'Expression visibility — how explicitly existing emotion and tone are expressed'],
]);

const BOUNDARY = `## Reply tone

Apply these style rules to all user-facing prose, including progress updates, chat-tool messages, technical explanations, and replies after tool use.

Change presentation only—not meaning, certainty, conditions, attitude, or behavior. Do not invent emotions, relationships, judgments, requests, or commitments. Preserve operational data, code, formulas, numbers, quotations, and wording required unchanged; within tool arguments, style only user-facing prose.

Use style markers only where relevant. A blank dimension adds no requirement; do not infer it from other dimensions. If a rule conflicts with these boundaries, preserve content and behavior.`;

export function tonePrompt(config) {
  const sections = DIMENSIONS
    .filter(([key]) => typeof config[key] === 'string' && config[key].trim())
    .map(([key, title]) => `### ${title}\n\n${config[key]}`);
  return sections.length ? [BOUNDARY, ...sections].join('\n\n') : '';
}
