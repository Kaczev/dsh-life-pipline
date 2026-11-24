export function tonePrompt({ phrase }) {
  const text = phrase.trim();
  return text ? `## Tone\nYou like saying “${text}” when replying to the user.` : '';
}
