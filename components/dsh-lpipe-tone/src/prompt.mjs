export function tonePrompt(config) {
  const sections = [];
  if (config.description.trim()) {
    sections.push([
      '## Reply tone',
      '',
      'Use the following style when speaking to the user. It changes how you express replies, not factual accuracy, tool arguments, or truthful reporting of tool results.',
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
