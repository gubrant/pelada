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
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  role: text('role').notNull().default('member'), // 'admin' | 'member'
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const memberProfiles = pgTable('member_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  fullName: text('full_name').notNull(),
  nickname: text('nickname'),
  age: integer('age'),
  dominantFoot: text('dominant_foot').notNull().default('Destro'), // 'Destro' | 'Canhoto' | 'Ambidestro'
  preferredPosition: text('preferred_position').notNull().default('Coringa'),
  phone: text('phone'),
  photoUrl: text('photo_url'),
  emergencyContactName: text('emergency_contact_name'),
  emergencyContactPhone: text('emergency_contact_phone'),
  bloodType: text('blood_type').default('Não sei'),
  medicalNotes: text('medical_notes'),
  preExistingConditions: text('pre_existing_conditions'),
  routineMedications: text('routine_medications'),
  allergies: text('allergies'),
  initDribbling: doublePrecision('init_dribbling').notNull().default(6),
  initPhysical: doublePrecision('init_physical').notNull().default(6),
  initPassing: doublePrecision('init_passing').notNull().default(6),
  initAttack: doublePrecision('init_attack').notNull().default(6),
  initDefense: doublePrecision('init_defense').notNull().default(6),
  initShooting: doublePrecision('init_shooting').notNull().default(6),
  initOverall: doublePrecision('init_overall').notNull().default(6),
  profileCompleted: boolean('profile_completed').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const weeklyPeladas = pgTable('weekly_peladas', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  weekday: text('weekday').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  location: text('location').notNull(),
  address: text('address'),
  playersPerTeam: integer('players_per_team').notNull().default(5),
  defaultTeamsCount: integer('default_teams_count').notNull().default(2),
  maxPlayers: integer('max_players'),
  pixKey: text('pix_key').notNull().default(''),
  avulsoFee: doublePrecision('avulso_fee').notNull().default(0),
  mensalistaFee: doublePrecision('mensalista_fee').notNull().default(0),
  notes: text('notes'),
  createdByUserId: integer('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const peladaMemberships = pgTable(
  'pelada_memberships',
  {
    id: serial('id').primaryKey(),
    peladaId: integer('pelada_id')
      .notNull()
      .references(() => weeklyPeladas.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    category: text('category').notNull().default('avulso'), // 'mensalista' | 'avulso'
    active: boolean('active').notNull().default(true),
    dribbling: doublePrecision('dribbling').notNull().default(6),
    physical: doublePrecision('physical').notNull().default(6),
    passing: doublePrecision('passing').notNull().default(6),
    attack: doublePrecision('attack').notNull().default(6),
    defense: doublePrecision('defense').notNull().default(6),
    shooting: doublePrecision('shooting').notNull().default(6),
    overall: doublePrecision('overall').notNull().default(6),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('pelada_memberships_pelada_user_idx').on(table.peladaId, table.userId)]
);

export const peladaEncounters = pgTable('pelada_encounters', {
  id: serial('id').primaryKey(),
  peladaId: integer('pelada_id')
    .notNull()
    .references(() => weeklyPeladas.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  eventDate: text('event_date').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  maxPlayers: integer('max_players'),
  status: text('status').notNull().default('open'), // 'open' | 'drawn' | 'finished'
  createdByUserId: integer('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const encounterAttendances = pgTable(
  'encounter_attendances',
  {
    id: serial('id').primaryKey(),
    encounterId: integer('encounter_id')
      .notNull()
      .references(() => peladaEncounters.id, { onDelete: 'cascade' }),
    membershipId: integer('membership_id')
      .notNull()
      .references(() => peladaMemberships.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: text('status').notNull(), // 'confirmed' | 'absent'
    categorySnapshot: text('category_snapshot').notNull().default('avulso'), // 'mensalista' | 'avulso'
    confirmedAt: timestamp('confirmed_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('encounter_attendances_enc_user_idx').on(table.encounterId, table.userId)]
);

export const encounterTeamDraws = pgTable('encounter_team_draws', {
  id: serial('id').primaryKey(),
  encounterId: integer('encounter_id')
    .notNull()
    .references(() => peladaEncounters.id, { onDelete: 'cascade' }),
  teamsCount: integer('teams_count').notNull(),
  playersPerTeam: integer('players_per_team').notNull(),
  teamsJson: text('teams_json').notNull(),
  drawnByUserId: integer('drawn_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const financeTransactions = pgTable('finance_transactions', {
  id: serial('id').primaryKey(),
  peladaId: integer('pelada_id')
    .notNull()
    .references(() => weeklyPeladas.id, { onDelete: 'cascade' }),
  encounterId: integer('encounter_id').references(() => peladaEncounters.id, {
    onDelete: 'set null',
  }),
  relatedUserId: integer('related_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  type: text('type').notNull(), // 'income' | 'expense'
  category: text('category').notNull(),
  description: text('description').notNull(),
  amount: doublePrecision('amount').notNull(),
  transactionDate: text('transaction_date').notNull(),
  receiptImageUrl: text('receipt_image_url'),
  createdByUserId: integer('created_by_user_id').references(() => users.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
