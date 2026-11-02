/**
 * Chat @mentions (#525). A message keeps each mention as a token in its text,
 * `<@memberId>` or `<@everyone>`, never the name, so a rename shows in every
 * old message at once. The thread renders the tokens with the current names;
 * the server checks them against the Group and measures the limit on the
 * rendered text; the composer builds them from the names a member picked.
 *
 * Client-safe: no database imports.
 */

/** A Member's id, or the whole Group. */
export type MentionTarget = number | "everyone";

export type MentionSegment = { kind: "text"; text: string } | { kind: "mention"; target: MentionTarget };

/**
 * The zero-width space that keeps a typed-out `<@…>` from reading as a token.
 * The composer never shows or counts it, so the server's limit skips it too.
 */
export const UNTOKEN = "​";

/** How a mention of someone no longer anywhere reads. */
export const FORMER_MEMBER = "former member";

const TOKEN = /<@(\w+)>/g;

function targetOf(raw: string): MentionTarget | null {
  if (raw === "everyone") return "everyone";
  if (!/^[1-9]\d*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

/** The token a mention is stored as. */
export const mentionToken = (target: MentionTarget) => `<@${target}>`;

/** The message as text and mentions, in order. A token naming neither a Member id nor everyone stays text. */
export function mentionSegments(text: string): MentionSegment[] {
  const out: MentionSegment[] = [];
  const pushText = (piece: string) => {
    if (piece === "") return;
    const last = out.at(-1);
    if (last?.kind === "text") last.text += piece;
    else out.push({ kind: "text", text: piece });
  };
  let from = 0;
  for (const match of text.matchAll(TOKEN)) {
    const target = targetOf(match[1]);
    pushText(text.slice(from, match.index));
    if (target === null) pushText(match[0]);
    else out.push({ kind: "mention", target });
    from = match.index + match[0].length;
  }
  pushText(text.slice(from));
  return out;
}

/** Each target the message mentions, once, in the order they first appear. */
export function mentionsOf(text: string): MentionTarget[] {
  const seen: MentionTarget[] = [];
  for (const segment of mentionSegments(text)) {
    if (segment.kind === "mention" && !seen.includes(segment.target)) seen.push(segment.target);
  }
  return seen;
}

/** The Members a message names, once each; `@everyone` left out. */
export const mentionedIds = (text: string): number[] =>
  mentionsOf(text).filter((target): target is number => target !== "everyone");

/** How a mention reads: `@` and the current name, `@everyone`, or `@former member`. */
export function mentionLabel(target: MentionTarget, nameOf: (id: number) => string | undefined): string {
  return target === "everyone" ? "@everyone" : `@${nameOf(target) ?? FORMER_MEMBER}`;
}

/** What a thread message needs for the questions below. */
interface Mentioning {
  id: number;
  memberId: number;
  text: string;
  gone: unknown;
}

/**
 * Someone else's message, still showing, that names the viewer or everyone:
 * it gets the fill, the edge and MENTIONED YOU. `@everyone` counts as a
 * mention of each Member it reaches.
 */
export function mentionsYou(message: Mentioning, viewerId: number): boolean {
  if (message.memberId === viewerId || message.gone) return false;
  return mentionsOf(message.text).some((target) => target === "everyone" || target === viewerId);
}

/**
 * The messages behind the mention pill, oldest first: those that mention the
 * viewer after `readId`, their read marker as it was before this open. The
 * marker moves the moment the thread loads, so it has to be the old one.
 */
export function unreadMentions(messages: readonly Mentioning[], viewerId: number, readId: number): number[] {
  return messages.filter((m) => m.id > readId && mentionsYou(m, viewerId)).map((m) => m.id);
}

/** Someone the picker can offer: a Member, or everyone. */
export interface MentionCandidate {
  target: MentionTarget;
  /** The name as written, `everyone` for the Group. */
  name: string;
  /** What shows at the row's right: "N Members" for everyone. A Member shows their name alone. */
  note?: string;
}

export interface MentionMatch extends MentionCandidate {
  /** The part of `name` the query matched, in UTF-16 offsets into `name` as written. */
  hit: { start: number; end: number };
}

/** Lower case with the accents off, so `alv` finds `Álvarez`. */
export const foldName = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/**
 * The name folded, with where each folded character came from in the name as
 * written, so a match found in the folded name can be marked in the real one.
 */
function folded(name: string): { text: string; startOf: number[]; endOf: number[] } {
  let text = "";
  const startOf: number[] = [];
  const endOf: number[] = [];
  let offset = 0;
  for (const char of name) {
    for (const piece of foldName(char)) {
      text += piece;
      for (let i = 0; i < piece.length; i++) {
        startOf.push(offset);
        endOf.push(offset + char.length);
      }
    }
    offset += char.length;
  }
  return { text, startOf, endOf };
}

/**
 * Who the picker lists for `query`, the text typed after the `@`. A name
 * matches when it, or any later word in it, starts with the query, ignoring
 * case and accents; the query may hold spaces (`tom b`). Everyone comes first,
 * then names that start with the query, then names with a later word that
 * does, alphabetical within each, and by id between two people of one name.
 */
export function matchMentions(query: string, candidates: readonly MentionCandidate[]): MentionMatch[] {
  const q = foldName(query);
  const ranked: { match: MentionMatch; rank: number }[] = [];
  for (const candidate of candidates) {
    const name = folded(candidate.name);
    let at = -1;
    for (let i = 0; i <= name.text.length - q.length; i++) {
      if ((i === 0 || /\s/.test(name.text[i - 1])) && name.text.startsWith(q, i)) {
        at = i;
        break;
      }
    }
    if (at < 0) continue;
    const hit =
      q.length === 0 ? { start: 0, end: 0 } : { start: name.startOf[at], end: name.endOf[at + q.length - 1] };
    const rank = candidate.target === "everyone" ? 0 : at === 0 ? 1 : 2;
    ranked.push({ match: { ...candidate, hit }, rank });
  }
  const id = (target: MentionTarget) => (target === "everyone" ? 0 : target);
  return ranked
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        a.match.name.localeCompare(b.match.name, "en", { sensitivity: "base" }) ||
        id(a.match.target) - id(b.match.target),
    )
    .map((entry) => entry.match);
}

/** A name the member picked in the composer, where its `@` sits in the draft. */
export interface PickedMention {
  target: MentionTarget;
  name: string;
  start: number;
}

/**
 * The composer's draft: the text as typed, and the names in it that were
 * picked. Only a picked name is a mention; the same name typed out is text.
 */
export interface Draft {
  text: string;
  picked: PickedMention[];
}

export interface PickerQuery {
  /** Where the `@` is. */
  start: number;
  /** What follows it, up to the caret. */
  query: string;
}

/** Longer than any name with room to spare: past it, the member is writing, not looking someone up. */
const MAX_QUERY = 40;

const pickedText = (pick: Pick<PickedMention, "name">) => `@${pick.name}`;

/**
 * What the picker is looking up, read back from the caret: an `@` at the
 * start of the draft or after whitespace, and what follows it. Null when there
 * is none, so `me@gmail` never opens it, nor does an `@` already a picked name.
 */
export function pickerQuery(draft: Draft, caret: number): PickerQuery | null {
  const before = draft.text.slice(0, caret);
  const start = before.lastIndexOf("@");
  if (start < 0) return null;
  if (start > 0 && !/\s/.test(before[start - 1])) return null;
  if (draft.picked.some((pick) => pick.start === start)) return null;
  const query = before.slice(start + 1);
  if (/^\s/.test(query) || query.length > MAX_QUERY) return null;
  return { start, query };
}

/** Swaps the `@query` for the picked name and a space, and says where the caret goes. */
export function pickMention(draft: Draft, at: PickerQuery, candidate: MentionCandidate): { draft: Draft; caret: number } {
  const inserted = `${pickedText(candidate)} `;
  const end = at.start + 1 + at.query.length;
  const delta = inserted.length - (end - at.start);
  const picked = draft.picked
    .filter((pick) => pick.start + pickedText(pick).length <= at.start || pick.start >= end)
    .map((pick) => (pick.start >= end ? { ...pick, start: pick.start + delta } : pick));
  picked.push({ target: candidate.target, name: candidate.name, start: at.start });
  picked.sort((a, b) => a.start - b.start);
  return {
    draft: { text: draft.text.slice(0, at.start) + inserted + draft.text.slice(end), picked },
    caret: at.start + inserted.length,
  };
}

/** The picked name is still there as picked: whole, and not run on into a longer word (`@Tommy` from `@Tom`). */
function stillPicked(text: string, pick: PickedMention): boolean {
  const end = pick.start + pickedText(pick).length;
  return text.startsWith(pickedText(pick), pick.start) && !/[\p{L}\p{N}_]/u.test(text.charAt(end));
}

/**
 * The draft after the member typed or deleted: each picked name moves with
 * the text around it, and one whose own text changed is no longer a mention.
 */
export function editDraft(draft: Draft, text: string): Draft {
  let prefix = 0;
  while (prefix < draft.text.length && prefix < text.length && draft.text[prefix] === text[prefix]) prefix++;
  const delta = text.length - draft.text.length;
  const picked = draft.picked
    .map((pick) => (pick.start + pickedText(pick).length <= prefix ? pick : { ...pick, start: pick.start + delta }))
    .filter((pick) => pick.start >= 0 && stillPicked(text, pick));
  return { text, picked };
}

/**
 * The text to send: each picked name as its token. A token typed out by hand
 * is broken with a zero-width space, so typing `<@everyone>` mentions nobody.
 */
export function encodeDraft(draft: Draft): string {
  const plain = (text: string) => text.replaceAll("<@", `<${UNTOKEN}@`);
  let out = "";
  let from = 0;
  for (const pick of [...draft.picked].sort((a, b) => a.start - b.start)) {
    out += plain(draft.text.slice(from, pick.start)) + mentionToken(pick.target);
    from = pick.start + pickedText(pick).length;
  }
  return out + plain(draft.text.slice(from));
}

/** The message as people read it: each token as its label. */
export function renderMentions(text: string, nameOf: (id: number) => string | undefined): string {
  return mentionSegments(text)
    .map((segment) => (segment.kind === "text" ? segment.text : mentionLabel(segment.target, nameOf)))
    .join("");
}
