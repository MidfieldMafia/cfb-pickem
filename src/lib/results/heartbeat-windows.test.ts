/**
 * Which minutes the live heartbeat pings, from the published Slate's kickoffs
 * (#546): each Game's kickoff hour to five hours after kickoff, in UTC, merged
 * where they overlap and pinned to the date.
 */
import { describe, expect, test } from "vitest";
import { heartbeatWindows, reminderSchedules } from "./heartbeat-windows";

const at = (iso: string) => new Date(iso);
const game = (kickoff: string, isVoid = false) => ({ kickoff: at(kickoff), void: isVoid });

/** The Tuesday before Week 10, when the slate is published. */
const TUESDAY = at("2026-11-03T18:00:00Z");

describe("the heartbeat windows", () => {
  test("Week 10's Saturday, 17:00 to 00:30 kickoffs, is one window split at midnight UTC", () => {
    const week10 = [
      game("2026-11-07T17:00:00Z"),
      game("2026-11-07T17:00:00Z"),
      game("2026-11-07T19:30:00Z"),
      game("2026-11-07T20:30:00Z"),
      game("2026-11-07T21:00:00Z"),
      game("2026-11-07T23:30:00Z"),
      game("2026-11-08T00:00:00Z"),
      game("2026-11-08T00:30:00Z"),
    ];

    expect(heartbeatWindows(week10, TUESDAY)).toEqual([
      { id: "slate-live-2026-11-07", cron: "* 17-23 7 11 *" },
      { id: "slate-live-2026-11-08", cron: "* 0-5 8 11 *" },
    ]);
  });

  test("a Friday 8 pm ET game pings the first five hours of the Saturday UTC date", () => {
    // 8 pm EDT on Friday 11 September is midnight UTC on the 12th.
    expect(heartbeatWindows([game("2026-09-12T00:00:00Z")], at("2026-09-08T18:00:00Z"))).toEqual([
      { id: "slate-live-2026-09-12", cron: "* 0-4 12 9 *" },
    ]);
  });

  test("a window crossing midnight UTC splits into one cron per date", () => {
    expect(heartbeatWindows([game("2026-11-07T22:15:00Z")], TUESDAY)).toEqual([
      { id: "slate-live-2026-11-07", cron: "* 22-23 7 11 *" },
      { id: "slate-live-2026-11-08", cron: "* 0-3 8 11 *" },
    ]);
  });

  test("two overlapping games merge into one window", () => {
    expect(heartbeatWindows([game("2026-11-07T15:30:00Z"), game("2026-11-07T12:00:00Z")], TUESDAY)).toEqual([
      { id: "slate-live-2026-11-07", cron: "* 12-20 7 11 *" },
    ]);
  });

  test("two windows apart on the same date share that date's schedule", () => {
    expect(heartbeatWindows([game("2026-11-07T00:00:00Z"), game("2026-11-07T16:00:00Z")], TUESDAY)).toEqual([
      { id: "slate-live-2026-11-07", cron: "* 0-4,16-20 7 11 *" },
    ]);
  });

  test("void games and windows already over are dropped", () => {
    const games = [game("2026-11-07T17:00:00Z", true), game("2026-11-07T12:00:00Z"), game("2026-11-07T21:00:00Z")];

    // At 18:00 noon's window has ended (17:00); the void game never counts.
    expect(heartbeatWindows(games, at("2026-11-07T18:00:00Z"))).toEqual([
      { id: "slate-live-2026-11-07", cron: "* 21-23 7 11 *" },
      { id: "slate-live-2026-11-08", cron: "* 0-1 8 11 *" },
    ]);
    // Once a window spilling past midnight is down to its last date, the date it left is gone too.
    expect(heartbeatWindows(games, at("2026-11-08T01:00:00Z"))).toEqual([
      { id: "slate-live-2026-11-08", cron: "* 0-1 8 11 *" },
    ]);
    expect(heartbeatWindows(games, at("2026-11-08T02:00:00Z"))).toEqual([]);
  });

  test("an empty slate pings nothing", () => {
    expect(heartbeatWindows([], TUESDAY)).toEqual([]);
  });
});

describe("the Pick reminder schedules", () => {
  const deadline = new Date("2026-11-21T17:00:00Z");

  test("one a day before the Deadline and one an hour before, each pinned to its minute", () => {
    expect(reminderSchedules(deadline, new Date("2026-11-18T12:00:00Z"))).toEqual([
      { id: "pick-reminder-day", cron: "0 17 20 11 *" },
      { id: "pick-reminder-final", cron: "0 16 21 11 *" },
    ]);
  });

  test("a reminder already past drops out, and a Deadline off the hour keeps its minute", () => {
    expect(reminderSchedules(new Date("2026-11-21T00:30:00Z"), new Date("2026-11-20T06:00:00Z"))).toEqual([
      { id: "pick-reminder-final", cron: "30 23 20 11 *" },
    ]);
    expect(reminderSchedules(deadline, new Date("2026-11-21T16:30:00Z"))).toEqual([]);
  });

  test("no Deadline, no reminders", () => {
    expect(reminderSchedules(null, new Date("2026-11-18T12:00:00Z"))).toEqual([]);
  });
});
