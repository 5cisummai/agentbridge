ALTER TABLE threads ADD COLUMN event_seq integer NOT NULL DEFAULT 0;
ALTER TABLE threads ADD COLUMN runner_seq integer NOT NULL DEFAULT -1;
UPDATE threads SET event_seq = COALESCE((SELECT max(seq) FROM thread_events WHERE thread_id = threads.id), 0);
ALTER TABLE approvals ADD COLUMN delivered_at timestamp with time zone;

-- OAuth Provider 1.7 resource binding models (existing auth tables are prerequisites).
CREATE TABLE IF NOT EXISTS "oauthResource" (
  "id" text PRIMARY KEY, "identifier" text NOT NULL UNIQUE, "name" text NOT NULL,
  "accessTokenTtl" integer, "refreshTokenTtl" integer,
  "signingAlgorithm" text, "signingKeyId" text, "allowedScopes" text[],
  "customClaims" jsonb, "dpopBoundAccessTokensRequired" boolean DEFAULT false,
  "disabled" boolean DEFAULT false, "createdAt" timestamp, "updatedAt" timestamp,
  "policyVersion" integer DEFAULT 1, "metadata" jsonb
);
CREATE TABLE IF NOT EXISTS "oauthClientResource" (
  "id" text PRIMARY KEY,
  "clientId" text NOT NULL REFERENCES "oauthClient"("clientId") ON DELETE CASCADE,
  "resourceId" text NOT NULL REFERENCES "oauthResource"("identifier") ON DELETE CASCADE,
  "metadata" jsonb, "createdAt" timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS "oauthClientResource_client_resource_idx"
  ON "oauthClientResource" ("clientId", "resourceId");

-- Align existing auth columns with the installed provider.
ALTER TABLE "jwks" ADD COLUMN IF NOT EXISTS "expiresAt" timestamp;
ALTER TABLE "jwks" ADD COLUMN IF NOT EXISTS "alg" text;
ALTER TABLE "jwks" ADD COLUMN IF NOT EXISTS "crv" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "subjectType" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "backchannelLogoutUri" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "backchannelLogoutSessionRequired" boolean;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "jwks" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "jwksUri" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "requirePKCE" boolean;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "dpopBoundAccessTokens" boolean;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "referenceId" text;
ALTER TABLE "oauthClient" ADD COLUMN IF NOT EXISTS "metadata" jsonb;
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "authorizationCodeId" text;
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "resources" text;
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "requestedUserInfoClaims" text;
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "rotatedAt" timestamp;
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "rotationReplayResponse" text;
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "rotationReplayExpiresAt" timestamp;
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "authTime" timestamp;
ALTER TABLE "oauthRefreshToken" ADD COLUMN IF NOT EXISTS "confirmation" jsonb;
ALTER TABLE "oauthAccessToken" ADD COLUMN IF NOT EXISTS "authorizationCodeId" text;
ALTER TABLE "oauthAccessToken" ADD COLUMN IF NOT EXISTS "resources" text;
ALTER TABLE "oauthAccessToken" ADD COLUMN IF NOT EXISTS "requestedUserInfoClaims" text;
ALTER TABLE "oauthAccessToken" ADD COLUMN IF NOT EXISTS "revoked" timestamp;
ALTER TABLE "oauthAccessToken" ADD COLUMN IF NOT EXISTS "confirmation" jsonb;
ALTER TABLE "oauthConsent" ADD COLUMN IF NOT EXISTS "referenceId" text;
ALTER TABLE "oauthConsent" ADD COLUMN IF NOT EXISTS "resources" text;
ALTER TABLE "oauthConsent" ADD COLUMN IF NOT EXISTS "requestedUserInfoClaims" text;
ALTER TABLE "oauthClientAssertion" ALTER COLUMN "clientId" DROP NOT NULL;
ALTER TABLE "oauthClientAssertion" ALTER COLUMN "value" DROP NOT NULL;

CREATE FUNCTION pg_temp.review_text_array(value text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN value IS NULL THEN NULL WHEN left(value, 1) = '['
 THEN ARRAY(SELECT jsonb_array_elements_text(value::jsonb)) ELSE string_to_array(value, ' ') END
$$;
ALTER TABLE "oauthClient" ALTER COLUMN "scopes" TYPE text[] USING pg_temp.review_text_array("scopes");
ALTER TABLE "oauthClient" ALTER COLUMN "contacts" TYPE text[] USING pg_temp.review_text_array("contacts");
ALTER TABLE "oauthClient" ALTER COLUMN "redirectUris" TYPE text[] USING pg_temp.review_text_array("redirectUris");
ALTER TABLE "oauthClient" ALTER COLUMN "postLogoutRedirectUris" TYPE text[] USING pg_temp.review_text_array("postLogoutRedirectUris");
ALTER TABLE "oauthClient" ALTER COLUMN "grantTypes" TYPE text[] USING pg_temp.review_text_array("grantTypes");
ALTER TABLE "oauthClient" ALTER COLUMN "responseTypes" TYPE text[] USING pg_temp.review_text_array("responseTypes");
ALTER TABLE "oauthClient" ALTER COLUMN "clientCredentialsScopes" TYPE text[] USING pg_temp.review_text_array("clientCredentialsScopes");
ALTER TABLE "oauthAccessToken" ALTER COLUMN "scopes" TYPE text[] USING pg_temp.review_text_array("scopes");
ALTER TABLE "oauthAccessToken" ALTER COLUMN "resources" TYPE text[] USING pg_temp.review_text_array("resources");
ALTER TABLE "oauthAccessToken" ALTER COLUMN "requestedUserInfoClaims" TYPE text[] USING pg_temp.review_text_array("requestedUserInfoClaims");
ALTER TABLE "oauthRefreshToken" ALTER COLUMN "scopes" TYPE text[] USING pg_temp.review_text_array("scopes");
ALTER TABLE "oauthRefreshToken" ALTER COLUMN "resources" TYPE text[] USING pg_temp.review_text_array("resources");
ALTER TABLE "oauthRefreshToken" ALTER COLUMN "requestedUserInfoClaims" TYPE text[] USING pg_temp.review_text_array("requestedUserInfoClaims");
ALTER TABLE "oauthConsent" ALTER COLUMN "scopes" TYPE text[] USING pg_temp.review_text_array("scopes");
ALTER TABLE "oauthConsent" ALTER COLUMN "resources" TYPE text[] USING pg_temp.review_text_array("resources");
ALTER TABLE "oauthConsent" ALTER COLUMN "requestedUserInfoClaims" TYPE text[] USING pg_temp.review_text_array("requestedUserInfoClaims");
ALTER TABLE "deviceCode" ALTER COLUMN "resources" TYPE text[] USING pg_temp.review_text_array("resources");
