/**
 * Saturday Slate database schema. Vocabulary follows CONTEXT.md: Season,
 * Week, Game, Member, Pick, Lock of the Week, Tiebreaker Guess, Void,
 * Result Override. All timestamps are UTC. No point totals are stored;
 * scoring recomputes from picks and results on every read.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
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
import type { Rules } from "@/lib/scoring/types";

const utc = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const seasons = pgTable("seasons", {
  id: serial("id").primaryKey(),
  year: integer("year").notNull().unique(),
  /** Scoring parameters. Inputs to scoring, never baked into stored totals. */
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
    createdAt: utc("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("weeks_season_week_idx").on(t.seasonId, t.weekNumber)],
);

export const gameStatuses = ["scheduled", "in_progress", "final"] as const;
export type GameStatus = (typeof gameStatuses)[number];

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
    homeScore: integer("home_score"),
    awayScore: integer("away_score"),
    status: text("status", { enum: gameStatuses }).notNull().default("scheduled"),
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
  (t) => [uniqueIndex("games_week_cfbd_idx").on(t.weekId, t.cfbdGameId)],
);

export const members = pgTable("members", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  /** Id from public/avatars/avatars.json. Null until the welcome page is done. */
  avatarId: text("avatar_id"),
  phone: text("phone"),
  isCommissioner: boolean("is_commissioner").notNull().default(false),
  /** The secret in the Magic Link. Regenerating replaces it. */
  token: text("token").notNull().unique(),
  /** A week counts as played only if its Deadline fell after this. */
  joinedAt: utc("joined_at").notNull().defaultNow(),
  active: boolean("active").notNull().default(true),
  /** Set when the member finishes the welcome page for the first time. */
  welcomedAt: utc("welcomed_at"),
  lastSeenAt: utc("last_seen_at"),
  createdAt: utc("created_at").notNull().defaultNow(),
});

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

/** One row per commissioner edit of another member's pick, Lock, or Tiebreaker Guess. */
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
export type Session = typeof sessions.$inferSelect;
