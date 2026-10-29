import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const threadStatusEnum = pgEnum("thread_status", [
  "running",
  "exited",
  "killed",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "pending",
  "approved",
  "denied",
  "timeout",
]);

export const devices = pgTable(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id").notNull(),
    name: text("name").notNull(),
    credentialHash: text("credential_hash").notNull(),
    online: boolean("online").notNull().default(false),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    capabilities: jsonb("capabilities").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("devices_owner_user_id_idx").on(t.ownerUserId)],
);

export const userDefaults = pgTable("user_defaults", {
  userId: text("user_id").primaryKey(),
  defaultDeviceId: uuid("default_device_id").references(() => devices.id, {
    onDelete: "set null",
  }),
});

export const threads = pgTable(
  "threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    ownerUserId: text("owner_user_id").notNull(),
    profile: text("profile").notNull(),
    cwd: text("cwd").notNull(),
    name: text("name"),
    status: threadStatusEnum("status").notNull().default("running"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    exitedAt: timestamp("exited_at", { withTimezone: true }),
  },
  (t) => [
    index("threads_device_id_idx").on(t.deviceId),
    index("threads_owner_user_id_idx").on(t.ownerUserId),
  ],
);

export const threadEvents = pgTable(
  "thread_events",
  {
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.threadId, t.seq] }),
    index("thread_events_thread_id_idx").on(t.threadId),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => threads.id, { onDelete: "cascade" }),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    status: approvalStatusEnum("status").notNull().default("pending"),
    prompt: text("prompt").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    note: text("note"),
  },
  (t) => [
    index("approvals_status_idx").on(t.status),
    index("approvals_thread_id_idx").on(t.threadId),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    deviceId: uuid("device_id"),
    threadId: uuid("thread_id"),
    action: text("action").notNull(),
    profileId: text("profile_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_events_user_id_idx").on(t.userId)],
);
