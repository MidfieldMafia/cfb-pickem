/** "1 game", "2 games". Only regular plurals; nothing in the app needs more. */
export function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
