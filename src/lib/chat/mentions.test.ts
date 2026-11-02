/**
 * Chat @mentions (#525) on the phone's side and the server's: the tokens a
 * message is stored with, how they read, and the composer's picker.
 */
import { describe, expect, test } from "vitest";
import {
  editDraft,
  encodeDraft,
  matchMentions,
  mentionSegments,
  mentionsOf,
  mentionsYou,
  pickerQuery,
  pickMention,
  renderMentions,
  unreadMentions,
  type Draft,
  type MentionCandidate,
} from "./mentions";

const names = new Map([
  [7, "Marcus Webb"],
  [12, "Tom Bradley"],
]);
const nameOf = (id: number) => names.get(id);

describe("tokens", () => {
  test("split a message into text and mentions, by Member id or everyone", () => {
    expect(mentionSegments("<@12> you are on the hook, <@everyone>")).toEqual([
      { kind: "mention", target: 12 },
      { kind: "text", text: " you are on the hook, " },
      { kind: "mention", target: "everyone" },
    ]);
  });

  test("leave anything that is not a Member id or everyone as text", () => {
    expect(mentionSegments("a <@abc> b <@0> c <@> d")).toEqual([{ kind: "text", text: "a <@abc> b <@0> c <@> d" }]);
  });

  test("read as @ and the current name, and a stranger as a former member", () => {
    expect(renderMentions("<@12> and <@99>, <@everyone>", nameOf)).toBe("@Tom Bradley and @former member, @everyone");
  });

  test("list whom a message mentions, once each", () => {
    expect(mentionsOf("<@12> <@7> <@12> <@everyone>")).toEqual([12, 7, "everyone"]);
  });
});

describe("the picker's matches", () => {
  const everyone: MentionCandidate = { target: "everyone", name: "everyone", note: "6 Members" };
  const group: MentionCandidate[] = [
    everyone,
    { target: 12, name: "Tom Bradley" },
    { target: 14, name: "Tommy" },
    { target: 15, name: "Coach Ray" },
    { target: 18, name: "Danny" },
    { target: 21, name: "Danny" },
    { target: 30, name: "Jess Álvarez" },
    { target: 31, name: "Big Tom" },
  ];
  const names = (query: string) => matchMentions(query, group).map((m) => `${m.name}#${m.target}`);

  test("a bare @ lists everyone first, then every Member alphabetically", () => {
    expect(names("")).toEqual([
      "everyone#everyone",
      "Big Tom#31",
      "Coach Ray#15",
      "Danny#18",
      "Danny#21",
      "Jess Álvarez#30",
      "Tom Bradley#12",
      "Tommy#14",
    ]);
  });

  test("names that start with the query come before names with a later word that does", () => {
    expect(names("tom")).toEqual(["Tom Bradley#12", "Tommy#14", "Big Tom#31"]);
  });

  test("ignores case and accents, and marks the matched part of the name as written", () => {
    expect(matchMentions("ALV", group)).toEqual([{ target: 30, name: "Jess Álvarez", hit: { start: 5, end: 8 } }]);
  });

  test("keeps matching across a space while some name still does", () => {
    expect(names("tom b")).toEqual(["Tom Bradley#12"]);
    expect(names("tom bradley is")).toEqual([]);
  });

  test("lists both Members who share a name", () => {
    expect(names("dan")).toEqual(["Danny#18", "Danny#21"]);
  });

  test("matches everyone by its own name", () => {
    expect(names("ev")).toEqual(["everyone#everyone"]);
    expect(names("ray")).toEqual(["Coach Ray#15"]);
  });

  test("matches nothing from the middle of a word", () => {
    expect(names("ommy")).toEqual([]);
  });
});

describe("mentions of the viewer", () => {
  const VIEWER = 3;
  const message = (id: number, memberId: number, text: string, gone: "deleted" | null = null) => ({ id, memberId, text, gone });
  const thread = [
    message(1, 7, "<@3> called it"),
    message(2, 9, "<@everyone> picks lock at 11"),
    message(3, 3, "<@everyone> thanks, <@3> is me"),
    message(4, 9, "<@12> you are next"),
    message(5, 7, "", "deleted"),
    message(6, 12, "Nice one <@3>"),
  ];

  test("are someone else's messages that name the viewer or everyone", () => {
    expect(thread.filter((m) => mentionsYou(m, VIEWER)).map((m) => m.id)).toEqual([1, 2, 6]);
  });

  test("are unread after the read marker as it was before the open, oldest first", () => {
    expect(unreadMentions(thread, VIEWER, 1)).toEqual([2, 6]);
    expect(unreadMentions(thread, VIEWER, 0)).toEqual([1, 2, 6]);
    expect(unreadMentions(thread, VIEWER, 6)).toEqual([]);
  });
});

describe("the composer's draft", () => {
  const tom: MentionCandidate = { target: 12, name: "Tom Bradley" };
  const everyone: MentionCandidate = { target: "everyone", name: "everyone", note: "6 Members" };
  const typed = (text: string): Draft => ({ text, picked: [] });

  test("opens the picker on an @ at the start or after a space, read at the caret", () => {
    expect(pickerQuery(typed("@"), 1)).toEqual({ start: 0, query: "" });
    expect(pickerQuery(typed("hi @to"), 6)).toEqual({ start: 3, query: "to" });
    expect(pickerQuery(typed("hi @to there"), 6)).toEqual({ start: 3, query: "to" });
    expect(pickerQuery(typed("hi @tom b"), 9)).toEqual({ start: 3, query: "tom b" });
  });

  test("does not open it for an email address, a space after the @, or with the caret before it", () => {
    expect(pickerQuery(typed("me@gmail"), 8)).toBeNull();
    expect(pickerQuery(typed("hi @ x"), 6)).toBeNull();
    expect(pickerQuery(typed("hi @to"), 2)).toBeNull();
  });

  test("picking puts the name in with a space after it, and the caret after that", () => {
    expect(pickMention(typed("hi @to"), { start: 3, query: "to" }, tom)).toEqual({
      draft: { text: "hi @Tom Bradley ", picked: [{ target: 12, name: "Tom Bradley", start: 3 }] },
      caret: 16,
    });
  });

  test("picking mid-draft moves the mentions after it along", () => {
    const draft = pickMention(typed("@ev"), { start: 0, query: "ev" }, everyone).draft;
    const withTom = editDraft(draft, "@t @everyone ");
    expect(pickMention(withTom, { start: 0, query: "t" }, tom).draft).toEqual({
      text: "@Tom Bradley  @everyone ",
      picked: [
        { target: 12, name: "Tom Bradley", start: 0 },
        { target: "everyone", name: "everyone", start: 14 },
      ],
    });
  });

  test("does not open the picker again inside a picked name", () => {
    const { draft } = pickMention(typed("@to"), { start: 0, query: "to" }, tom);
    expect(pickerQuery(draft, draft.text.length)).toBeNull();
  });

  test("keeps a picked name through edits around it, and drops it once its text changes", () => {
    const { draft } = pickMention(typed("hi @to"), { start: 3, query: "to" }, tom);
    const before = editDraft(draft, "oh hi @Tom Bradley ");
    expect(before.picked).toEqual([{ target: 12, name: "Tom Bradley", start: 6 }]);
    expect(editDraft(before, "oh hi @Tom Bradley see").picked).toEqual([{ target: 12, name: "Tom Bradley", start: 6 }]);
    expect(editDraft(draft, "hi @Tom Bradly ").picked).toEqual([]);
    expect(editDraft(editDraft(draft, "hi @Tom Bradley"), "hi @Tom Bradleymy").picked).toEqual([]);
    expect(editDraft(editDraft(draft, "hi @Tom Bradley"), "hi @Tom Bradley!").picked).toEqual([{ target: 12, name: "Tom Bradley", start: 3 }]);
    expect(editDraft(draft, "").picked).toEqual([]);
  });

  test("sends picked names as tokens, and typed-out ones as text", () => {
    const one = pickMention(typed("hi @to"), { start: 3, query: "to" }, tom).draft;
    const two = pickMention(editDraft(one, `${one.text}and @e`), { start: 20, query: "e" }, everyone).draft;
    const encoded = encodeDraft(editDraft(two, `${two.text}not @Tom Bradley or <@12> <@everyone>`));
    expect(mentionsOf(encoded)).toEqual([12, "everyone"]);
    expect(renderMentions(encoded, nameOf)).toBe("hi @Tom Bradley and @everyone not @Tom Bradley or <​@12> <​@everyone>");
  });
});
