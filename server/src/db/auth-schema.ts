import {
  boolean,
  bigint,
  integer,
  jsonb,
  uniqueIndex,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** Auth schema aligned with the installed Better Auth plugins. */
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

/** Better Auth rate limit counters (when rateLimit.storage = "database"). */
export const rateLimit = pgTable("rateLimit", {
  key: text("key").primaryKey().notNull(),
  count: integer("count").notNull(),
  lastRequest: bigint("lastRequest", { mode: "number" }).notNull(),
});

export const jwks = pgTable("jwks", {
  expiresAt: timestamp("expiresAt"),
  alg: text("alg"),
  crv: text("crv"),

  id: text("id").primaryKey(),
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey").notNull(),
  createdAt: timestamp("createdAt").notNull(),
});

export const oauthClient = pgTable("oauthClient", {
  subjectType: text("subjectType"),
  backchannelLogoutUri: text("backchannelLogoutUri"),
  backchannelLogoutSessionRequired: boolean("backchannelLogoutSessionRequired"),
  jwks: text("jwks"),
  jwksUri: text("jwksUri"),
  requirePKCE: boolean("requirePKCE"),
  dpopBoundAccessTokens: boolean("dpopBoundAccessTokens"),
  referenceId: text("referenceId"),
  metadata: jsonb("metadata"),

  id: text("id").primaryKey(),
  clientId: text("clientId").notNull().unique(),
  clientSecret: text("clientSecret"),
  disabled: boolean("disabled"),
  skipConsent: boolean("skipConsent"),
  enableEndSession: boolean("enableEndSession"),
  scopes: text("scopes").array(),
  userId: text("userId"),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
  name: text("name"),
  uri: text("uri"),
  icon: text("icon"),
  contacts: text("contacts").array(),
  tos: text("tos"),
  policy: text("policy"),
  softwareId: text("softwareId"),
  softwareVersion: text("softwareVersion"),
  softwareStatement: text("softwareStatement"),
  redirectUris: text("redirectUris").array(),
  postLogoutRedirectUris: text("postLogoutRedirectUris").array(),
  tokenEndpointAuthMethod: text("tokenEndpointAuthMethod"),
  grantTypes: text("grantTypes").array(),
  responseTypes: text("responseTypes").array(),
  applicationType: text("applicationType"),
  clientDiscoveryId: text("clientDiscoveryId"),
  clientCredentialsScopes: text("clientCredentialsScopes").array(),
  type: text("type"),
  public: boolean("public"),
});

export const oauthAccessToken = pgTable("oauthAccessToken", {
  authorizationCodeId: text("authorizationCodeId"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requestedUserInfoClaims").array(),
  revoked: timestamp("revoked"),
  confirmation: jsonb("confirmation"),

  id: text("id").primaryKey(),
  token: text("token").notNull(),
  clientId: text("clientId").notNull(),
  sessionId: text("sessionId"),
  userId: text("userId"),
  referenceId: text("referenceId"),
  refreshId: text("refreshId"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt"),
  scopes: text("scopes").array(),
});

export const oauthRefreshToken = pgTable("oauthRefreshToken", {
  authorizationCodeId: text("authorizationCodeId"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requestedUserInfoClaims").array(),
  rotatedAt: timestamp("rotatedAt"),
  rotationReplayResponse: text("rotationReplayResponse"),
  rotationReplayExpiresAt: timestamp("rotationReplayExpiresAt"),
  authTime: timestamp("authTime"),
  confirmation: jsonb("confirmation"),

  id: text("id").primaryKey(),
  token: text("token").notNull(),
  clientId: text("clientId").notNull(),
  sessionId: text("sessionId"),
  userId: text("userId"),
  referenceId: text("referenceId"),
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt"),
  scopes: text("scopes").array(),
  revoked: timestamp("revoked"),
});

export const oauthConsent = pgTable("oauthConsent", {
  referenceId: text("referenceId"),
  resources: text("resources").array(),
  requestedUserInfoClaims: text("requestedUserInfoClaims").array(),

  id: text("id").primaryKey(),
  clientId: text("clientId").notNull(),
  userId: text("userId").notNull(),
  scopes: text("scopes").array(),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
  consentGiven: boolean("consentGiven"),
});

export const oauthClientAssertion = pgTable("oauthClientAssertion", {
  id: text("id").primaryKey(),
  clientId: text("clientId"),
  value: text("value"),
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
  resources: text("resources").array(),
});

export const oauthResource = pgTable("oauthResource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("accessTokenTtl"),
  refreshTokenTtl: integer("refreshTokenTtl"),
  signingAlgorithm: text("signingAlgorithm"),
  signingKeyId: text("signingKeyId"),
  allowedScopes: text("allowedScopes").array(),
  customClaims: jsonb("customClaims"),
  dpopBoundAccessTokensRequired: boolean(
    "dpopBoundAccessTokensRequired",
  ).default(false),
  disabled: boolean("disabled").default(false),
  createdAt: timestamp("createdAt"),
  updatedAt: timestamp("updatedAt"),
  policyVersion: integer("policyVersion").default(1),
  metadata: jsonb("metadata"),
});

export const oauthClientResource = pgTable(
  "oauthClientResource",
  {
    id: text("id").primaryKey(),
    clientId: text("clientId")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resourceId")
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("createdAt"),
  },
  (t) => [
    uniqueIndex("oauthClientResource_client_resource_idx").on(
      t.clientId,
      t.resourceId,
    ),
  ],
);
