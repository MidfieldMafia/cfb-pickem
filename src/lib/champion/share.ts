/**
 * Share your win (#592), on the champion's own celebration sheet: the text, and
 * the Web Share call behind the button. The text carries the title and the
 * points only. A group's name would tell anyone it reaches who the group is,
 * so it never goes in.
 */

/** The champion's line: a co-champion's reads "a … co-champion". */
export function shareText({ year, points, co }: { year: number; points: number; co: boolean }): string {
  const title = co ? `a ${year} Saturday Slate Regular Season co-champion` : `the ${year} Saturday Slate Regular Season Champion`;
  return `I'm ${title} with ${points} points.`;
}

/**
 * `navigator.share` with the title, text and Leaderboard link. A dismissed
 * picker rejects with an `AbortError`, which is the member changing their
 * mind, not a failure: `cancelled`, and nothing to show. Anything else is
 * `failed`, for the button to offer a copy instead.
 */
export async function shareWin(
  share: (data: ShareData) => Promise<void>,
  data: { title: string; text: string; url: string },
): Promise<"shared" | "cancelled" | "failed"> {
  try {
    await share(data);
    return "shared";
  } catch (error) {
    // By name, not `instanceof`: a `DOMException` is not an `Error` in every engine.
    return (error as { name?: unknown } | null)?.name === "AbortError" ? "cancelled" : "failed";
  }
}
