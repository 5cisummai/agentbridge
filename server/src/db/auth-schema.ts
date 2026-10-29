import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Placeholder until `pnpm auth:generate` runs; CLI overwrites this file. */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull(),
  image: text("image"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt"),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("createdAt").notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
});

export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export const oauthClient = pgTable("oauthClient", {
  id: text("id").primaryKey(),
  clientId: text("clientId").notNull().unique(),
  clientSecret: text("clientSecret"),
  disabled: boolean("disabled"),
  skipConsent: boolean("skipConsent"),
  enableEndSession: boolean("enableEndSession"),
  scopes: text("scopes"),
  userId: text("userId"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: text("contacts"),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("softwareId"),
  softwareVersion: text("softwareVersion"),
  softwareStatement: text("softwareStatement"),
  redirectUris: text("redirectUris"),
  postLogoutRedirectUris: text("postLogoutRedirectUris"),
  tokenEndpointAuthMethod: text("tokenEndpointAuthMethod"),
  grantTypes: text("grantTypes"),
  responseTypes: text("responseTypes"),
  applicationType: text("applicationType"),
  clientDiscoveryId: text("clientDiscoveryId"),
  clientCredentialsScopes: text("clientCredentialsScopes"),
  type: text("type"),
  public: boolean("public"),
});

export const oauthAccessToken = pgTable("oauthAccessToken", {
  id: text("id").primaryKey(),
  token: text("token").notNull(),
  clientId: text("clientId").notNull(),
  sessionId: text("sessionId"),
  userId: text("userId"),
  referenceId: text("referenceId"),
  refreshId: text("refreshId"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt"),
  scopes: text("scopes"),
});

export const oauthRefreshToken = pgTable("oauthRefreshToken", {
  id: text("id").primaryKey(),
  token: text("token").notNull(),
  clientId: text("clientId").notNull(),
  sessionId: text("sessionId"),
  userId: text("userId"),
  referenceId: text("referenceId"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt"),
  scopes: text("scopes"),
  revoked: timestamp("revoked"),
});

export const oauthConsent = pgTable("oauthConsent", {
  id: text("id").primaryKey(),
  clientId: text("clientId").notNull(),
  userId: text("userId").notNull(),
  scopes: text("scopes"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
  consentGiven: boolean("consentGiven"),
});

export const oauthClientAssertion = pgTable("oauthClientAssertion", {
  id: text("id").primaryKey(),
  clientId: text("clientId").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
});

export const deviceCode = pgTable("deviceCode", {
  id: text("id").primaryKey(),
  deviceCode: text("deviceCode").notNull().unique(),
  userCode: text("userCode").notNull().unique(),
  userId: text("userId"),
  expiresAt: timestamp("expiresAt").notNull(),
  status: text("status"),
  lastPolledAt: timestamp("lastPolledAt"),
  pollingInterval: integer("pollingInterval"),
  clientId: text("clientId"),
  scope: text("scope"),
  oauthClientId: text("oauthClientId"),
  resources: text("resources"),
});
