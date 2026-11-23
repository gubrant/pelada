import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash'),
  role: text('role').notNull().default('player'), // 'admin' | 'player'
  name: text('name').notNull(),
  inviteToken: text('invite_token'),
  inviteExpiresAt: timestamp('invite_expires_at'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const players = pgTable('players', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  nickname: text('nickname').notNull(),
  age: integer('age'),
  position: text('position').notNull().default('Ala Direito'),
  dominantFoot: text('dominant_foot').notNull().default('Destro'),
  phone: text('phone'),
  email: text('email'),
  photoUrl: text('photo_url'),
  initPhysical: doublePrecision('init_physical').notNull().default(7),
  initDribbling: doublePrecision('init_dribbling').notNull().default(7),
  initShooting: doublePrecision('init_shooting').notNull().default(7),
  initDefense: doublePrecision('init_defense').notNull().default(7),
  initAttack: doublePrecision('init_attack').notNull().default(7),
  initPassing: doublePrecision('init_passing').notNull().default(7),
  initPositioning: doublePrecision('init_positioning').notNull().default(7),
  initOverall: doublePrecision('init_overall').notNull().default(7),
  curPhysical: doublePrecision('cur_physical').notNull().default(7),
  curDribbling: doublePrecision('cur_dribbling').notNull().default(7),
  curShooting: doublePrecision('cur_shooting').notNull().default(7),
  curDefense: doublePrecision('cur_defense').notNull().default(7),
  curAttack: doublePrecision('cur_attack').notNull().default(7),
  curPassing: doublePrecision('cur_passing').notNull().default(7),
  curPositioning: doublePrecision('cur_positioning').notNull().default(7),
  curOverall: doublePrecision('cur_overall').notNull().default(7),
  ratedByUserId: integer('rated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  category: text('category').notNull().default('mensalista'), // 'mensalista' | 'avulso' | 'eventual'
  exclusiveGroupId: integer('exclusive_group_id'),
  exclusivePeladaId: integer('exclusive_pelada_id'),
  invitedByUserId: integer('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  initRatingStatus: text('init_rating_status').notNull().default('approved'), // 'pending_votes' | 'approved'
  initVotesCount: integer('init_votes_count').notNull().default(0),
  initScoresJson: text('init_scores_json'),
  curScoresJson: text('cur_scores_json'),
  profileCompleted: boolean('profile_completed').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const peladaGroups = pgTable('pelada_groups', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  weekday: text('weekday').notNull().default('Quarta-feira'),
  startTime: text('start_time').notNull().default('20:00'),
  endTime: text('end_time').notNull().default('22:00'),
  location: text('location').notNull().default('Quadra Principal'),
  fullAddress: text('full_address'),
  avulsoFee: doublePrecision('avulso_fee').notNull().default(0),
  monthlyFee: doublePrecision('monthly_fee').notNull().default(0),
  initialCashBalance: doublePrecision('initial_cash_balance').notNull().default(0),
  pixKey: text('pix_key'),
  playersPerTeam: integer('players_per_team').notNull().default(5),
  defaultTeamsCount: integer('default_teams_count').notNull().default(2),
  photoUrl: text('photo_url'),
  criteriaConfig: text('criteria_config'),
  ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const peladaGroupMembers = pgTable(
  'pelada_group_members',
  {
    id: serial('id').primaryKey(),
    groupId: integer('group_id')
      .references(() => peladaGroups.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    playerId: integer('player_id').references(() => players.id, { onDelete: 'cascade' }),
    memberRole: text('member_role').notNull().default('member'), // 'admin' | 'member'
    adminTitle: text('admin_title'), // 'presidente' | 'tesoureiro' | 'presidente_tesoureiro' | 'administrador' | null
    playerCategory: text('player_category').notNull().default('mensalista'), // 'mensalista' | 'avulso' | 'eventual'
    accessPeladaId: integer('access_pelada_id').references(() => peladas.id, { onDelete: 'set null' }),
    accessExpiresAt: timestamp('access_expires_at'),
    summaryEmailSentAt: timestamp('summary_email_sent_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('group_member_user_unique').on(table.groupId, table.userId),
    uniqueIndex('group_member_player_unique').on(table.groupId, table.playerId),
  ]
);

export const seasons = pgTable('seasons', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').references(() => peladaGroups.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  startDate: text('start_date').notNull(),
  endDate: text('end_date'),
  status: text('status').notNull().default('open'), // 'open' | 'closed'
  summaryJson: text('summary_json'),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  closedAt: timestamp('closed_at'),
});

export const peladas = pgTable('peladas', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id').references(() => peladaGroups.id, { onDelete: 'cascade' }),
  seasonId: integer('season_id')
    .references(() => seasons.id, { onDelete: 'cascade' })
    .notNull(),
  title: text('title').notNull(),
  location: text('location').notNull(),
  eventDate: text('event_date').notNull(),
  startTime: text('start_time').notNull().default('20:00'),
  endTime: text('end_time').notNull().default('22:00'),
  playersPerTeam: integer('players_per_team').notNull().default(5),
  status: text('status').notNull().default('in_progress'), // 'scheduled' | 'in_progress' | 'finished'
  notes: text('notes'),
  criteriaConfig: text('criteria_config'),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const peladaTeams = pgTable('pelada_teams', {
  id: serial('id').primaryKey(),
  peladaId: integer('pelada_id')
    .references(() => peladas.id, { onDelete: 'cascade' })
    .notNull(),
  name: text('name').notNull(),
  colorHex: text('color_hex').notNull().default('#059669'),
  wins: integer('wins').notNull().default(0),
  draws: integer('draws').notNull().default(0),
  losses: integer('losses').notNull().default(0),
  goalsFor: integer('goals_for').notNull().default(0),
  goalsAgainst: integer('goals_against').notNull().default(0),
});

export const peladaAttendances = pgTable(
  'pelada_attendances',
  {
    id: serial('id').primaryKey(),
    peladaId: integer('pelada_id')
      .references(() => peladas.id, { onDelete: 'cascade' })
      .notNull(),
    playerId: integer('player_id')
      .references(() => players.id, { onDelete: 'cascade' })
      .notNull(),
    teamId: integer('team_id').references(() => peladaTeams.id, { onDelete: 'set null' }),
    present: boolean('present').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('pelada_player_unique').on(table.peladaId, table.playerId)]
);

export const matches = pgTable('matches', {
  id: serial('id').primaryKey(),
  peladaId: integer('pelada_id')
    .references(() => peladas.id, { onDelete: 'cascade' })
    .notNull(),
  seasonId: integer('season_id')
    .references(() => seasons.id, { onDelete: 'cascade' })
    .notNull(),
  matchNumber: integer('match_number').notNull().default(1),
  teamAId: integer('team_a_id')
    .references(() => peladaTeams.id, { onDelete: 'cascade' })
    .notNull(),
  teamBId: integer('team_b_id')
    .references(() => peladaTeams.id, { onDelete: 'cascade' })
    .notNull(),
  scoreA: integer('score_a').notNull().default(0),
  scoreB: integer('score_b').notNull().default(0),
  status: text('status').notNull().default('live'), // 'live' | 'finished'
  durationMinutes: integer('duration_minutes').notNull().default(10),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  finishedAt: timestamp('finished_at'),
});

export const matchEvents = pgTable('match_events', {
  id: serial('id').primaryKey(),
  matchId: integer('match_id')
    .references(() => matches.id, { onDelete: 'cascade' })
    .notNull(),
  peladaId: integer('pelada_id')
    .references(() => peladas.id, { onDelete: 'cascade' })
    .notNull(),
  seasonId: integer('season_id')
    .references(() => seasons.id, { onDelete: 'cascade' })
    .notNull(),
  teamId: integer('team_id')
    .references(() => peladaTeams.id, { onDelete: 'cascade' })
    .notNull(),
  eventType: text('event_type').notNull(), // 'goal' | 'defense' | 'own_goal'
  playerId: integer('player_id')
    .references(() => players.id, { onDelete: 'cascade' })
    .notNull(),
  assistPlayerId: integer('assist_player_id').references(() => players.id, { onDelete: 'set null' }),
  minute: integer('minute').notNull().default(1),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const playerEvaluations = pgTable(
  'player_evaluations',
  {
    id: serial('id').primaryKey(),
    matchId: integer('match_id')
      .references(() => matches.id, { onDelete: 'cascade' }),
    peladaId: integer('pelada_id')
      .references(() => peladas.id, { onDelete: 'cascade' })
      .notNull(),
    playerId: integer('player_id')
      .references(() => players.id, { onDelete: 'cascade' })
      .notNull(),
    evaluatorUserId: integer('evaluator_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    physical: integer('physical').notNull(),
    dribbling: integer('dribbling').notNull(),
    shooting: integer('shooting').notNull(),
    defense: integer('defense').notNull(),
    attack: integer('attack').notNull(),
    passing: integer('passing').notNull(),
    positioning: integer('positioning').notNull(),
    scoresJson: text('scores_json'),
    averageScore: doublePrecision('average_score').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('eval_match_player_evaluator_unique').on(
      table.matchId,
      table.playerId,
      table.evaluatorUserId
    ),
  ]
);

export const playerInitialVotes = pgTable(
  'player_initial_votes',
  {
    id: serial('id').primaryKey(),
    groupId: integer('group_id').references(() => peladaGroups.id, { onDelete: 'cascade' }),
    playerId: integer('player_id')
      .references(() => players.id, { onDelete: 'cascade' })
      .notNull(),
    adminUserId: integer('admin_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    scoresJson: text('scores_json').notNull(),
    averageScore: doublePrecision('average_score').notNull(),
    comment: text('comment'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('player_initial_vote_unique').on(table.playerId, table.adminUserId),
  ]
);

export const adminNotifications = pgTable(
  'admin_notifications',
  {
    id: serial('id').primaryKey(),
    recipientUserId: integer('recipient_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    groupId: integer('group_id').references(() => peladaGroups.id, { onDelete: 'cascade' }),
    playerId: integer('player_id')
      .references(() => players.id, { onDelete: 'cascade' })
      .notNull(),
    joinRequestId: integer('join_request_id'),
    type: text('type').notNull().default('initial_rating_vote'),
    title: text('title').notNull(),
    message: text('message').notNull(),
    read: boolean('read').notNull().default(false),
    voted: boolean('voted').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('admin_notif_recipient_player_type_unique').on(
      table.recipientUserId,
      table.playerId,
      table.type
    ),
  ]
);

export const peladaJoinRequests = pgTable(
  'pelada_join_requests',
  {
    id: serial('id').primaryKey(),
    groupId: integer('group_id')
      .references(() => peladaGroups.id, { onDelete: 'cascade' })
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    playerId: integer('player_id')
      .references(() => players.id, { onDelete: 'cascade' })
      .notNull(),
    requestedCategory: text('requested_category').notNull().default('mensalista'), // 'mensalista' | 'avulso' | 'eventual'
    requestedPeladaId: integer('requested_pelada_id').references(() => peladas.id, { onDelete: 'set null' }),
    message: text('message'),
    scoresJson: text('scores_json'),
    status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
    respondedByUserId: integer('responded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    responseNote: text('response_note'),
    respondedAt: timestamp('responded_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('join_request_group_user_unique').on(table.groupId, table.userId)]
);

export const playerSummaryEmails = pgTable(
  'player_summary_emails',
  {
    id: serial('id').primaryKey(),
    groupId: integer('group_id')
      .references(() => peladaGroups.id, { onDelete: 'cascade' })
      .notNull(),
    peladaId: integer('pelada_id').references(() => peladas.id, { onDelete: 'set null' }),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    playerId: integer('player_id')
      .references(() => players.id, { onDelete: 'cascade' })
      .notNull(),
    toEmail: text('to_email').notNull(),
    subject: text('subject').notNull(),
    bodyText: text('body_text').notNull(),
    statsJson: text('stats_json'),
    status: text('status').notNull().default('sent'),
    sentAt: timestamp('sent_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('summary_email_group_pelada_player_unique').on(
      table.groupId,
      table.peladaId,
      table.playerId
    ),
  ]
);

export const inviteEmails = pgTable('invite_emails', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  playerId: integer('player_id').references(() => players.id, { onDelete: 'set null' }),
  groupId: integer('group_id').references(() => peladaGroups.id, { onDelete: 'set null' }),
  invitedByUserId: integer('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  avulsoFee: doublePrecision('avulso_fee'),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  bodyText: text('body_text').notNull(),
  inviteLink: text('invite_link').notNull(),
  status: text('status').notNull().default('sent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const peladaFinanceEntries = pgTable('pelada_finance_entries', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id')
    .references(() => peladaGroups.id, { onDelete: 'cascade' })
    .notNull(),
  peladaId: integer('pelada_id').references(() => peladas.id, { onDelete: 'set null' }),
  entryType: text('entry_type').notNull(), // 'cash_box' | 'income' | 'expense' | 'pending_debt'
  title: text('title').notNull(),
  description: text('description'),
  amount: doublePrecision('amount').notNull().default(0),
  status: text('status').notNull().default('settled'), // 'settled' | 'pending'
  attachmentUrl: text('attachment_url'),
  entryDate: text('entry_date').notNull(),
  createdByUserId: integer('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const peladaParticipantPayments = pgTable('pelada_participant_payments', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id')
    .references(() => peladaGroups.id, { onDelete: 'cascade' })
    .notNull(),
  peladaId: integer('pelada_id').references(() => peladas.id, { onDelete: 'set null' }),
  playerId: integer('player_id')
    .references(() => players.id, { onDelete: 'cascade' })
    .notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'set null' }),
  paymentType: text('payment_type').notNull().default('diaria'), // 'mensalidade' | 'diaria'
  referenceLabel: text('reference_label').notNull(),
  amount: doublePrecision('amount').notNull().default(0),
  status: text('status').notNull().default('pending'), // 'pending' | 'paid'
  paidAt: timestamp('paid_at'),
  confirmedByUserId: integer('confirmed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  confirmedByRole: text('confirmed_by_role'),
  notes: text('notes'),
  attachmentUrl: text('attachment_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  usedAt: timestamp('used_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const passwordResetEmails = pgTable('password_reset_emails', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),
  toEmail: text('to_email').notNull(),
  subject: text('subject').notNull(),
  bodyText: text('body_text').notNull(),
  resetLink: text('reset_link').notNull(),
  status: text('status').notNull().default('sent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one, many }) => ({
  player: one(players, {
    fields: [users.id],
    references: [players.userId],
  }),
  evaluationsGiven: many(playerEvaluations),
}));

export const playersRelations = relations(players, ({ one, many }) => ({
  user: one(users, {
    fields: [players.userId],
    references: [users.id],
  }),
  attendances: many(peladaAttendances),
  evaluationsReceived: many(playerEvaluations),
}));

export const seasonsRelations = relations(seasons, ({ many }) => ({
  peladas: many(peladas),
}));

export const peladasRelations = relations(peladas, ({ one, many }) => ({
  season: one(seasons, {
    fields: [peladas.seasonId],
    references: [seasons.id],
  }),
  teams: many(peladaTeams),
  attendances: many(peladaAttendances),
  matches: many(matches),
}));
