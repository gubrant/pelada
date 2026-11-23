import { createPool, isDatabaseConfigured } from './index.ts';

declare global {
  var _schemaInitPromise: Promise<void> | undefined;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL UNIQUE,
  "password_hash" text NOT NULL,
  "name" text NOT NULL,
  "role" text DEFAULT 'member' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "member_profiles" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE cascade,
  "full_name" text NOT NULL,
  "nickname" text,
  "age" integer,
  "dominant_foot" text DEFAULT 'Destro' NOT NULL,
  "preferred_position" text DEFAULT 'Coringa' NOT NULL,
  "phone" text,
  "photo_url" text,
  "emergency_contact_name" text,
  "emergency_contact_phone" text,
  "blood_type" text DEFAULT 'Não sei',
  "medical_notes" text,
  "pre_existing_conditions" text,
  "routine_medications" text,
  "allergies" text,
  "init_dribbling" double precision DEFAULT 6 NOT NULL,
  "init_physical" double precision DEFAULT 6 NOT NULL,
  "init_passing" double precision DEFAULT 6 NOT NULL,
  "init_attack" double precision DEFAULT 6 NOT NULL,
  "init_defense" double precision DEFAULT 6 NOT NULL,
  "init_shooting" double precision DEFAULT 6 NOT NULL,
  "init_overall" double precision DEFAULT 6 NOT NULL,
  "profile_completed" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "weekly_peladas" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "weekday" text NOT NULL,
  "start_time" text NOT NULL,
  "end_time" text NOT NULL,
  "location" text NOT NULL,
  "address" text,
  "players_per_team" integer DEFAULT 5 NOT NULL,
  "default_teams_count" integer DEFAULT 2 NOT NULL,
  "max_players" integer,
  "pix_key" text DEFAULT '' NOT NULL,
  "avulso_fee" double precision DEFAULT 0 NOT NULL,
  "mensalista_fee" double precision DEFAULT 0 NOT NULL,
  "notes" text,
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "pelada_memberships" (
  "id" serial PRIMARY KEY NOT NULL,
  "pelada_id" integer NOT NULL REFERENCES "weekly_peladas"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "category" text DEFAULT 'avulso' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "dribbling" double precision DEFAULT 6 NOT NULL,
  "physical" double precision DEFAULT 6 NOT NULL,
  "passing" double precision DEFAULT 6 NOT NULL,
  "attack" double precision DEFAULT 6 NOT NULL,
  "defense" double precision DEFAULT 6 NOT NULL,
  "shooting" double precision DEFAULT 6 NOT NULL,
  "overall" double precision DEFAULT 6 NOT NULL,
  "joined_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "pelada_memberships_pelada_user_idx"
  ON "pelada_memberships" USING btree ("pelada_id", "user_id");

CREATE TABLE IF NOT EXISTS "pelada_encounters" (
  "id" serial PRIMARY KEY NOT NULL,
  "pelada_id" integer NOT NULL REFERENCES "weekly_peladas"("id") ON DELETE cascade,
  "title" text NOT NULL,
  "event_date" text NOT NULL,
  "start_time" text NOT NULL,
  "end_time" text NOT NULL,
  "max_players" integer,
  "status" text DEFAULT 'open' NOT NULL,
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "encounter_attendances" (
  "id" serial PRIMARY KEY NOT NULL,
  "encounter_id" integer NOT NULL REFERENCES "pelada_encounters"("id") ON DELETE cascade,
  "membership_id" integer NOT NULL REFERENCES "pelada_memberships"("id") ON DELETE cascade,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "status" text NOT NULL,
  "category_snapshot" text DEFAULT 'avulso' NOT NULL,
  "confirmed_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "encounter_attendances_enc_user_idx"
  ON "encounter_attendances" USING btree ("encounter_id", "user_id");

CREATE TABLE IF NOT EXISTS "encounter_team_draws" (
  "id" serial PRIMARY KEY NOT NULL,
  "encounter_id" integer NOT NULL REFERENCES "pelada_encounters"("id") ON DELETE cascade,
  "teams_count" integer NOT NULL,
  "players_per_team" integer NOT NULL,
  "teams_json" text NOT NULL,
  "drawn_by_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "finance_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "pelada_id" integer NOT NULL REFERENCES "weekly_peladas"("id") ON DELETE cascade,
  "encounter_id" integer REFERENCES "pelada_encounters"("id") ON DELETE set null,
  "related_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "type" text NOT NULL,
  "category" text NOT NULL,
  "description" text NOT NULL,
  "amount" double precision NOT NULL,
  "transaction_date" text NOT NULL,
  "receipt_image_url" text,
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp DEFAULT now() NOT NULL
);
`;

export async function ensureSchema(): Promise<void> {
  if (!isDatabaseConfigured()) {
    return;
  }
  if (!global._schemaInitPromise) {
    const pool = createPool();
    global._schemaInitPromise = (async () => {
      const check = await pool.query<{ exists: string | null }>(
        "SELECT to_regclass('public.users') AS exists"
      );
      if (check.rows[0]?.exists) {
        return;
      }
      await pool.query(SCHEMA_SQL);
    })().catch((err) => {
      global._schemaInitPromise = undefined;
      throw err;
    });
  }
  return global._schemaInitPromise;
}
