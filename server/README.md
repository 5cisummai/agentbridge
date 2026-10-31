# clithread gateway

TypeScript relay: Better Auth (OAuth 2.1 + MCP 2026-07-28), Postgres, WebSocket JSON-RPC hub, MCP tools.

MCP HTTP serves **2026-07-28** and, for now, **legacy 2025-era clients** via `createMcpHandler({ legacy: "stateless" })` so Grok/Cursor-class clients that still use `initialize` can connect. Legacy session GET/DELETE still return 405 in this mode. Prefer tightening back to `legacy: "reject"` once those clients negotiate the new protocol.

**Environment variables and end-to-end setup:** [`../docs/SETUP.md`](../docs/SETUP.md).

## Local dev

```bash
cd server
cp .env.example .env
docker compose -f ../docker-compose.yml up -d postgres
pnpm install   # if pnpm blocks builds: pnpm approve-builds
pnpm exec drizzle-kit push # fresh local database; review the proposed schema
pnpm --dir ../web build    # OAuth UI (React) for /sign-in /consent /device
pnpm lint      # oxlint (see .oxlintrc.json)
pnpm dev
```

The gateway serves the built SPA from `../web/dist` (or `WEB_DIST`). Rebuild the UI after changes, or run `pnpm --dir ../web build --watch` alongside `pnpm dev`.

### Environment (summary)

Copy `cp .env.example .env`. Validated in `src/env.ts`.

| Required             | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| `DATABASE_URL`       | Postgres                                                   |
| `BETTER_AUTH_SECRET` | Session signing (min 32 chars)                             |
| `BETTER_AUTH_URL`    | Public gateway origin                                      |
| `MCP_RESOURCE`       | MCP OAuth resource URL (typically `{BETTER_AUTH_URL}/mcp`) |

Optional: `GITHUB_*`, `GOOGLE_*`, `RESEND_API_KEY`, `RESEND_FROM`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `MAX_THREADS_PER_DEVICE`, `MAX_EVENTS_PER_THREAD`, `APPROVAL_TIMEOUT_MS`, `PORT`, `NODE_ENV`. Unset `RESEND_API_KEY` → verification links logged to stdout.

Undocumented in schema but used: `WEB_DIST` (SPA root). See SETUP.md for production URL alignment and troubleshooting.

Repo-root Prettier (`pnpm format` from the monorepo root) formats markdown and TypeScript across the tree.

The checked-in schema includes Better Auth tables. After changing auth plugins,
regenerate their schema and review the migration. This repository has no Drizzle
migration journal, so `db:migrate` alone does not bootstrap a database.

## Upgrade from the original schema

Drain active threads and stop the gateway and runners first. Back up the database,
then apply the reviewed upgrade once to a database containing the original gateway
and auth tables:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f drizzle/0001_review_fixes.sql
```

This adds the event cursor and approval delivery state, aligns auth columns with
the installed provider, and converts legacy auth array strings into PostgreSQL
arrays. Restart the upgraded gateway and runners and spawn new threads. Do not
run this upgrade after pushing the new schema into an existing database: the
upgrade expects the original text columns. Fresh databases use the schema push
path above instead.

Old retained events seed the new client cursor, but old event history has no
trustworthy runner replay watermark because server and runner sequences shared
one namespace. The migration leaves that watermark at -1. Draining old threads
avoids ambiguous replays across the protocol upgrade.

## Event delivery

The runner sends ordered `thread.event` JSON-RPC requests with stable runner
sequence numbers. The gateway validates device ownership, locks the thread row,
assigns an independent monotonically increasing client cursor, and acknowledges
only after the transaction commits. Duplicate replays at or below the durable
runner watermark are acknowledged without adding events, even after retention
trims the original rows. Gaps in runner sequences are permitted for bounded
buffer eviction; out-of-order unique events are unsupported.

`approval.submit` persists an approval idempotently before its canonical runner
`approval_required` event. The ordered event acknowledgement therefore covers the
submission as well. The gateway generates only timeout events. Resolved decisions
remain in a database outbox until the runner acknowledges `approval.resolve`;
the timeout job retries undelivered decisions every 30 seconds. Repeated delivery
uses the same approval ID and the runner must handle it idempotently.

Replay survives WebSocket reconnects within the runner process. Its pending queue
is not durable across runner process restarts. The server's event retention and
the runner's bounded buffer can discard older output; this is not an unlimited
output archive.

## Mock runner

After enrolling a device (runner `enroll` or `POST /v1/devices/enroll` with a user OAuth token):

```bash
DEVICE_ID=<from enroll> DEVICE_SECRET=<from enroll> pnpm mock-runner
# optional: GATEWAY_URL=ws://localhost:8787/ws
```

## MCP

- Resource: `MCP_RESOURCE` (default `http://localhost:8787/mcp`)
- Endpoint: `POST /mcp` with OAuth access token (`requireMcpAuth` + `@better-auth/mcp`)
- Scopes: `agentbridge:devices`, `agentbridge:threads`, `agentbridge:profiles`, `agentbridge:approvals`, `agentbridge:admin`
