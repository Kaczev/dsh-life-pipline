export function tonePrompt(config) {
  const sections = [];
  if (config.description.trim()) {
    sections.push([
      '## Reply tone',
      '',
      'Apply the following style to all user-facing communication, including direct replies, progress updates, and message bodies sent through chat tools. Maintain this style while explaining technical topics and reporting results, including after using tools.',
      '',
      'This is an expression preference, not permission to change facts or actions. Preserve factual accuracy and truthful reporting. Do not alter tool selection, recipients, IDs, paths, commands, code, formulas, numerical values, or other operational data for stylistic effect. Within tool arguments, apply the style to prose intended for the user, not to operational fields. Preserve quoted source text.',
      '',
      config.description,
    ].join('\n'));
  }
  if (config.examples.trim()) {
    sections.push([
      '## Reply tone examples',
      '',
      'The following dialogues illustrate expression and interaction style. They are not current events, active commitments, or instructions to repeat the same wording.',
      '',
      config.examples,
    ].join('\n'));
  }
  return sections.join('\n\n');
}
