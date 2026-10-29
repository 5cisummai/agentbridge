CREATE TYPE "thread_status" AS ENUM('running', 'exited', 'killed');
CREATE TYPE "approval_status" AS ENUM('pending', 'approved', 'denied', 'timeout');

CREATE TABLE IF NOT EXISTS "devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "owner_user_id" text NOT NULL,
  "name" text NOT NULL,
  "credential_hash" text NOT NULL,
  "online" boolean DEFAULT false NOT NULL,
  "last_seen_at" timestamp with time zone,
  "capabilities" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "devices_owner_user_id_idx" ON "devices" ("owner_user_id");

CREATE TABLE IF NOT EXISTS "user_defaults" (
  "user_id" text PRIMARY KEY NOT NULL,
  "default_device_id" uuid REFERENCES "devices"("id") ON DELETE set null
);

CREATE TABLE IF NOT EXISTS "threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE cascade,
  "owner_user_id" text NOT NULL,
  "profile" text NOT NULL,
  "cwd" text NOT NULL,
  "name" text,
  "status" "thread_status" DEFAULT 'running' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "exited_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "threads_device_id_idx" ON "threads" ("device_id");
CREATE INDEX IF NOT EXISTS "threads_owner_user_id_idx" ON "threads" ("owner_user_id");

CREATE TABLE IF NOT EXISTS "thread_events" (
  "thread_id" uuid NOT NULL REFERENCES "threads"("id") ON DELETE cascade,
  "seq" integer NOT NULL,
  "type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  PRIMARY KEY ("thread_id", "seq")
);

CREATE INDEX IF NOT EXISTS "thread_events_thread_id_idx" ON "thread_events" ("thread_id");

CREATE TABLE IF NOT EXISTS "approvals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "thread_id" uuid NOT NULL REFERENCES "threads"("id") ON DELETE cascade,
  "device_id" uuid NOT NULL REFERENCES "devices"("id") ON DELETE cascade,
  "status" "approval_status" DEFAULT 'pending' NOT NULL,
  "prompt" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "resolved_at" timestamp with time zone,
  "note" text
);

CREATE INDEX IF NOT EXISTS "approvals_status_idx" ON "approvals" ("status");
CREATE INDEX IF NOT EXISTS "approvals_thread_id_idx" ON "approvals" ("thread_id");

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" text NOT NULL,
  "device_id" uuid,
  "thread_id" uuid,
  "action" text NOT NULL,
  "profile_id" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "audit_events_user_id_idx" ON "audit_events" ("user_id");
