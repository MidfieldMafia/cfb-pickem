/**
 * Saturday Slate database schema. Vocabulary follows CONTEXT.md: Season,
 * Week, Game, Member, Group, Pick, Lock of the Week, Tiebreaker Guess, Void,
 * Result Override. All timestamps are UTC. No point totals are stored;
 * scoring recomputes from picks and results on every read.
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { MAX_CHAT_TEXT } from "@/lib/chat/limits";
import { chatReactionKinds } from "@/lib/chat/reactions";
import type { CfbdLiveDrive } from "@/lib/cfbd/types";
import type { GameDetail } from "@/lib/detail";
import type { BoxScore, Positions } from "@/lib/results/box-score";
import type { LiveFeed } from "@/lib/results/live-feed";
import type { Rules } from "@/lib/scoring/types";

const utc = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull().unique(),
  /**
   * Scoring parameters. Inputs to scoring, never baked into stored totals.
   * The one scoring type this module imports, and it belongs here: the column
   * stores the engine's own inputs, so naming them with the engine's type is
   * the point rather than a leak.
   */
  rules: jsonb("rules").$type<Rules>().notNull(),
  active: boolean("active").notNull().default(false),
  createdAt: utc("created_at").notNull().defaultNow(),
});

export const weeks = pgTable(
  "weeks",
  {
    id: serial("id").primaryKey(),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    /** CollegeFootballData week number. */
    weekNumber: integer("week_number").notNull(),
    /** The instant picks lock. Null until the slate has a game. */
    deadline: utc("deadline"),
    published: boolean("published").notNull().default(false),
    tiebreakerGameId: integer("tiebreaker_game_id").references((): AnyPgColumn => games.id),
    /**
     * When scores were last pulled from CollegeFootballData for this Week.
     * Shared across Vercel instances: a refresh claims it atomically, so
     * member traffic schedules the feed calls without exceeding the quota.
     */
    scoreboardFetchedAt: utc("scoreboard_fetched_at"),
    /**
     * When this Week's box scores were last asked for: the stats gate's claim,
     * as `scoreboard_fetched_at` is the results gate's, so a final game waiting
     * on CollegeFootballData costs two calls every five minutes however many
     * members are looking. See `refreshStatsIfStale`.
     */
    statsFetchedAt: utc("stats_fetched_at"),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("weeks_season_week_idx").on(t.seasonId, t.weekNumber)],
);

/**
 * The stored statuses, owned here. The scoring engine names the same three
 * words in its own `GameStatus`, and the two are deliberately not tied
 * together: nothing carries this column's value into that union. What reads it
 * is `results/result.ts`, comparing against this enum to fold the Void and the
 * Result Override into a `ResultStatus`, and `results/engine.ts` builds the
 * engine's status from *that* — so the engine's union sits three hops away
 * across two translations. The `satisfies readonly GameStatus[]` that used to
 * stand here read as a drift guard but bound two types with no data path
 * between them, and it was the last reason a database module imported the
 * scoring engine's types for anything but `Rules`.
 */
export const gameStatuses = ["scheduled", "in_progress", "final"] as const;
export type GameStatus = (typeof gameStatuses)[number];

/** Which team has the ball, resolved to a side before it is stored — never the feed's raw string. */
export const possessionSides = ["home", "away"] as const;
export type PossessionSide = (typeof possessionSides)[number];

export const games = pgTable(
  "games",
  {
    id: serial("id").primaryKey(),
    weekId: integer("week_id")
      .notNull()
      .references(() => weeks.id),
    /** CollegeFootballData numeric game id; the join key for scores. */
    cfbdGameId: integer("cfbd_game_id").notNull(),
    homeTeamId: integer("home_team_id").notNull(),
    homeTeam: text("home_team").notNull(),
    homeRank: integer("home_rank"),
    homeConference: text("home_conference"),
    awayTeamId: integer("away_team_id").notNull(),
    awayTeam: text("away_team").notNull(),
    awayRank: integer("away_rank"),
    awayConference: text("away_conference"),
    kickoff: utc("kickoff").notNull(),
    /** Spread snapshot at slate time, home team perspective. Information only. */
    spread: text("spread"),
    /**
     * Presentation detail snapshot for the pick screen (venue, TV, win
     * probability, forecast, each team's form). Refreshed with the feed;
     * never read by scoring.
     */
    detail: jsonb("detail").$type<GameDetail>(),
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    status: text("status", { enum: gameStatuses }).notNull().default("scheduled"),
    /**
     * Where a game in progress stands, from the feed's scoreboard: the quarter
     * (5 and up is overtime) and the game clock as the feed writes it, "08:42".
     * Both null before kickoff and once final — the Live Board reads them, the
     * scoring never does. Written by the same refresh that writes the score.
     */
    period: integer("period"),
    clock: text("clock"),
    /**
     * The rest of what the scoreboard says about a game under way: which team
     * has the ball, the last play in the feed's own words ("Jalen Milroe pass
     * complete to…"), and the down-and-distance ("3rd & 7"). Same lifetime as
     * `period` and `clock` — all null before kickoff and once final — and the
     * same reader: the Live Board, never the scoring.
     *
     * `possession` is resolved to a side at the ingest seam and stored that
     * way, so nothing downstream sees the feed's raw string. It is null
     * whenever the feed has not said, and null too when the value is a shape
     * the resolver cannot place: the value has never been observed in the
     * wild (see `possessionSide`).
     */
    possession: text("possession", { enum: possessionSides }),
    lastPlay: text("last_play"),
    situation: text("situation"),
    /**
     * The live play-by-play's slice for this row: the newest play and the
     * header's down, distance and yards to goal, from the same fetch that
     * wrote this game's `live_feeds` row. Null before the feed has logged a
     * play and once the game is no longer under way, like the columns above;
     * a failed fetch leaves it as the last one that answered. The running
     * score `effectiveResult` shows takes the newest play's score when it is
     * newer than the scoreboard's (`newerScore`), so the score columns stay
     * the scoreboard's own.
     */
    liveFeed: jsonb("live_feed").$type<LiveFeed>(),
    /** Canceled or postponed after publish: scores 0 for everyone. */
    void: boolean("void").notNull().default(false),
    voidNote: text("void_note"),
    /** Result Override: a commissioner's correction that beats the feed. */
    overrideHomeScore: integer("override_home_score"),
    overrideAwayScore: integer("override_away_score"),
    overrideNote: text("override_note"),
    createdAt: utc("created_at").notNull().defaultNow(),
    updatedAt: utc("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("games_week_cfbd_idx").on(t.weekId, t.cfbdGameId),
    /** A row that says final has both scores. Without this, "final" is not the whole answer. */
    check(
      "games_final_has_scores",
      sql`${t.status} <> 'final' or (${t.homeScore} is not null and ${t.awayScore} is not null)`,
    ),
  ],
);

/**
 * CFBD's live play-by-play for one Game: every drive, each with its plays, as
 * the newest fetch returned them, overwritten on every fetch so a play revised
 * in place needs no handling of its own. Written by the stale gate's claim
 * while the Game is under way and read by the Game sheet; `teams[]` is not
 * kept. Nothing deletes a row after the final.
 */
export const liveFeeds = pgTable("live_feeds", {
  gameId: integer("game_id")
    .primaryKey()
    .references(() => games.id),
  drives: jsonb("drives").$type<CfbdLiveDrive[]>().notNull(),
  fetchedAt: utc("fetched_at").notNull(),
});

export type LiveFeedRow = typeof liveFeeds.$inferSelect;

/**
 * A final Game's box score for the Game sheet: team stats and game leaders,
 * positions included, stored the first time CFBD has both halves and never
 * fetched again. The bar colours are not here; they are worked out on read.
 */
export const gameStats = pgTable("game_stats", {
  gameId: integer("game_id")
    .primaryKey()
    .references(() => games.id),
  boxScore: jsonb("box_score").$type<BoxScore>().notNull(),
  fetchedAt: utc("fetched_at").notNull(),
});

/**
 * Every player's position for a Season, by CFBD athlete id, from one
 * `/roster?year=` call: the whole roster is 9 MB and 31,000 players, and
 * only the positions are kept, without the nulls and "?"s. Read when a box
 * score is first stored, to put a position beside each leader.
 */
export const seasonRosters = pgTable("season_rosters", {
  seasonId: integer("season_id")
    .primaryKey()
    .references(() => seasons.id),
  positions: jsonb("positions").$type<Positions>().notNull(),
  fetchedAt: utc("fetched_at").notNull(),
});

export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  /**
   * The member's Pennant, resolved by `findAvatar`: a flag id from
   * public/avatars/avatars.json, `team-<espnId>`, or `photo-<memberId>-<hash8>`
   * for a photo in `member_photos`. Null until the welcome page is done, and
   * after a commissioner clears a photo.
   */
  avatarId: text("avatar_id"),
  /** Unique across members: one phone is one person, whatever groups they play in. */
  phone: text("phone").unique(),
  isCommissioner: boolean("is_commissioner").notNull().default(false),
  /** The secret in the Magic Link. Regenerating replaces it. */
  token: text("token").notNull().unique(),
  /** A week counts as played only if its Deadline fell after this. */
  joinedAt: utc("joined_at").notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
  /**
   * Replied STOP to a text, so the app sends them none. Set by hand in the
   * console: the app hears no replies, only the commissioner does.
   */
  smsOptedOut: boolean("sms_opted_out").notNull().default(false),
  /** Set when the member finishes the welcome page for the first time. */
  welcomedAt: utc("welcomed_at"),
  lastSeenAt: utc("last_seen_at"),
  createdAt: utc("created_at").notNull().defaultNow(),
});

/**
 * A member's own photo, when it is their Pennant: one 216×216 JPEG, as
 * base64. A sibling table rather than a column on `members`, so reading a
 * roster never carries the bytes. At most one per member; replacing it
 * upserts, and switching away from it deletes the row.
 */
export const memberPhotos = pgTable("member_photos", {
  memberId: integer("member_id")
    .primaryKey()
    .references(() => members.id),
  bytes: text("bytes").notNull(),
  updatedAt: utc("updated_at").notNull().defaultNow(),
});

/**
 * A set of members who compete against each other. Every group plays the same
 * Slate; the group only decides who is on its boards. Names are not unique.
 */
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  /** The secret in the Join Link. Resetting replaces it. */
  joinToken: text("join_token").notNull().unique(),
  createdAt: utc("created_at").notNull().defaultNow(),
});

export const membershipRoles = ["organizer", "member"] as const;
export type MembershipRole = (typeof membershipRoles)[number];

/**
 * A member's place in one group. Commissioner stays a flag on the member, not
 * a role here: a commissioner plays only in groups they hold a membership in.
 */
export const memberships = pgTable(
  "memberships",
  {
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    role: text("role", { enum: membershipRoles }).notNull().default("member"),
    /** A Week counts in this group only if its Deadline fell after this. Kept through a removal and restore. */
    joinedAt: utc("joined_at").notNull().defaultNow(),
    /**
     * The newest Chat message this member has seen in this group (#248): the
     * unread badge counts what came after it. An id rather than a time, so the
     * marker never disagrees with the order the thread shows. Null until they
     * first open the thread.
     */
    chatReadId: integer("chat_read_id"),
  },
  (t) => [primaryKey({ columns: [t.groupId, t.memberId] }), index("memberships_member_idx").on(t.memberId)],
);

export const absenceKinds = ["removed", "left"] as const;
/** Why a member was out: taken out by an organizer or commissioner, or left on their own. */
export type AbsenceKind = (typeof absenceKinds)[number];

/**
 * One row per period a membership was removed. Nothing about the membership
 * is deleted on removal, so restoring it brings back everything the member had
 * in the group; a Week whose Deadline fell inside a period does not count.
 * `restoredAt` is null while the member is still out.
 */
export const membershipRemovals = pgTable(
  "membership_removals",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id").notNull(),
    memberId: integer("member_id").notNull(),
    removedAt: utc("removed_at").notNull(),
    restoredAt: utc("restored_at"),
    /**
     * A removal is undone only by an organizer or commissioner; someone who left
     * rejoins through the Join Link (#136). Rows from before leaving existed are removals.
     */
    kind: text("kind", { enum: absenceKinds }).notNull().default("removed"),
  },
  (t) => [
    foreignKey({ columns: [t.groupId, t.memberId], foreignColumns: [memberships.groupId, memberships.memberId] }),
    /** Out at most once at a time. */
    uniqueIndex("membership_removals_open_idx")
      .on(t.groupId, t.memberId)
      .where(sql`${t.restoredAt} is null`),
    check("membership_removals_restored_after_removed", sql`${t.restoredAt} is null or ${t.restoredAt} > ${t.removedAt}`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** Opaque random id carried by the httpOnly cookie. */
    id: text("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    createdAt: utc("created_at").notNull().defaultNow(),
    lastSeenAt: utc("last_seen_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_member_idx").on(t.memberId)],
);

export const picks = pgTable(
  "picks",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    /** CollegeFootballData team id of the chosen winner. */
    teamId: integer("team_id").notNull(),
    updatedAt: utc("updated_at").notNull().defaultNow(),
    updatedBy: integer("updated_by")
      .notNull()
      .references(() => members.id),
  },
  (t) => [uniqueIndex("picks_member_game_idx").on(t.memberId, t.gameId)],
);

export const locks = pgTable(
  "locks",
  {
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    weekId: integer("week_id")
      .notNull()
      .references(() => weeks.id),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    updatedAt: utc("updated_at").notNull().defaultNow(),
    updatedBy: integer("updated_by")
      .notNull()
      .references(() => members.id),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.weekId] })],
);

export const tiebreakerGuesses = pgTable(
  "tiebreaker_guesses",
  {
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    weekId: integer("week_id")
      .notNull()
      .references(() => weeks.id),
    /** Predicted combined final score of the Tiebreaker Game. */
    guess: integer("guess").notNull(),
    updatedAt: utc("updated_at").notNull().defaultNow(),
    updatedBy: integer("updated_by")
      .notNull()
      .references(() => members.id),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.weekId] })],
);

export const pickAuditKinds = ["pick", "lock", "tiebreaker_guess"] as const;
export type PickAuditKind = (typeof pickAuditKinds)[number];

/**
 * One row per commissioner edit of a member's pick, Lock, or Tiebreaker
 * Guess from the console, their own included: a change after the Deadline
 * is on the record whoever it was for. Values are team names or the guess
 * as text, so the log reads without joins.
 */
export const pickAudits = pgTable(
  "pick_audits",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    weekId: integer("week_id")
      .notNull()
      .references(() => weeks.id),
    gameId: integer("game_id").references(() => games.id),
    kind: text("kind", { enum: pickAuditKinds }).notNull(),
    previousValue: text("previous_value"),
    newValue: text("new_value"),
    changedBy: integer("changed_by")
      .notNull()
      .references(() => members.id),
    changedAt: utc("changed_at").notNull().defaultNow(),
  },
  (t) => [index("pick_audits_member_week_idx").on(t.memberId, t.weekId)],
);

export const resultAuditKinds = ["override", "clear_override", "void", "restore"] as const;
export type ResultAuditKind = (typeof resultAuditKinds)[number];

/**
 * One row per commissioner change to a Game's result: a Result Override set
 * or cleared, a Void, or a restore. Values are the effective score before
 * and after, as "away-home" text, so the log reads without joins.
 */
export const resultAudits = pgTable(
  "result_audits",
  {
    id: serial("id").primaryKey(),
    gameId: integer("game_id")
      .notNull()
      .references(() => games.id),
    kind: text("kind", { enum: resultAuditKinds }).notNull(),
    previousValue: text("previous_value"),
    newValue: text("new_value"),
    note: text("note"),
    changedBy: integer("changed_by")
      .notNull()
      .references(() => members.id),
    changedAt: utc("changed_at").notNull().defaultNow(),
  },
  (t) => [index("result_audits_game_idx").on(t.gameId)],
);

export const textKinds = ["magic_link", "reminder", "scheduled_reminder"] as const;
export type TextKind = (typeof textKinds)[number];
export const textStatuses = ["sent", "failed"] as const;
export type TextStatus = (typeof textStatuses)[number];

/**
 * One row per text the app tried to send, whoever asked for it. The month's
 * budget is counted from here, so a row means the provider was called: texts
 * the app declined to send (opted out, no number, over budget) leave no row.
 */
export const textMessages = pgTable(
  "text_messages",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    kind: text("kind", { enum: textKinds }).notNull(),
    /** The Week a reminder was about; null for a Magic Link. */
    weekId: integer("week_id").references(() => weeks.id),
    /** The number as sent, in E.164, so a later edit to the member's phone does not rewrite history. */
    phone: text("phone").notNull(),
    /** "pingram", or "noop" when no key is set: a noop row delivered nothing and spends no budget. */
    provider: text("provider").notNull(),
    status: text("status", { enum: textStatuses }).notNull(),
    /** What the provider answered: its tracking id when sent, its error when not. */
    detail: text("detail"),
    /** How many billed messages the body was: one per 160 characters, then per 153. */
    segments: integer("segments").notNull(),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [index("text_messages_created_idx").on(t.createdAt), index("text_messages_week_kind_idx").on(t.weekId, t.kind)],
);

export const feedbackKinds = ["bug", "idea"] as const;
export type FeedbackKind = (typeof feedbackKinds)[number];

/**
 * A member's bug report or idea (#178, #237). Only commissioners read it, and
 * `doneAt` is theirs alone: the member hears nothing back beyond the thanks
 * on sending. The user agent is kept raw and read into a device at display.
 */
export const feedback = pgTable(
  "feedback",
  {
    id: serial("id").primaryKey(),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    kind: text("kind", { enum: feedbackKinds }).notNull(),
    text: text("text").notNull(),
    userAgent: text("user_agent").notNull(),
    createdAt: utc("created_at").notNull().defaultNow(),
    /** Set when a commissioner files it under Done; null while it is still to read. */
    doneAt: utc("done_at"),
  },
  (t) => [index("feedback_member_created_idx").on(t.memberId, t.createdAt)],
);

/**
 * At most one screenshot per Feedback, as base64 JPEG text, following
 * `member_photos`: the phone shrinks it first, so it is never large.
 */
export const feedbackScreenshots = pgTable("feedback_screenshots", {
  feedbackId: integer("feedback_id")
    .primaryKey()
    .references(() => feedback.id),
  bytes: text("bytes").notNull(),
});

/**
 * One message in a Group's Chat thread (#248). A thread is a Group's messages
 * for one Season. `deletedAt` hides a message from everyone; `removedBy` is set
 * when an Organizer or Commissioner took it down rather than its sender (#250).
 */
export const chatMessages = pgTable(
  "chat_messages",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => groups.id),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    seasonId: integer("season_id")
      .notNull()
      .references(() => seasons.id),
    text: text("text").notNull(),
    createdAt: utc("created_at").notNull().defaultNow(),
    deletedAt: utc("deleted_at"),
    removedBy: integer("removed_by").references(() => members.id),
  },
  (t) => [
    index("chat_messages_thread_idx").on(t.groupId, t.seasonId, t.id),
    check("chat_messages_text_length", sql`char_length(${t.text}) between 1 and ${sql.raw(String(MAX_CHAT_TEXT))}`),
  ],
);

/**
 * A Member's reaction to a Chat message (#249). The key is the message and the
 * member, so each member has at most one reaction on a message: switching
 * rewrites the kind, taking it off deletes the row.
 */
export const chatReactions = pgTable(
  "chat_reactions",
  {
    messageId: integer("message_id")
      .notNull()
      .references(() => chatMessages.id),
    memberId: integer("member_id")
      .notNull()
      .references(() => members.id),
    kind: text("kind", { enum: chatReactionKinds }).notNull(),
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.memberId] }), index("chat_reactions_member_idx").on(t.memberId)],
);

export const seasonsRelations = relations(seasons, ({ many }) => ({ weeks: many(weeks) }));
export const weeksRelations = relations(weeks, ({ one, many }) => ({
  season: one(seasons, { fields: [weeks.seasonId], references: [seasons.id] }),
  games: many(games),
}));
export const gamesRelations = relations(games, ({ one }) => ({
  week: one(weeks, { fields: [games.weekId], references: [weeks.id] }),
}));
export const membersRelations = relations(members, ({ many }) => ({ sessions: many(sessions) }));
export const sessionsRelations = relations(sessions, ({ one }) => ({
  member: one(members, { fields: [sessions.memberId], references: [members.id] }),
}));

export type Season = typeof seasons.$inferSelect;
export type Week = typeof weeks.$inferSelect;
export type Game = typeof games.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Group = typeof groups.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type TextMessage = typeof textMessages.$inferSelect;
export type Feedback = typeof feedback.$inferSelect;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type ChatReaction = typeof chatReactions.$inferSelect;
