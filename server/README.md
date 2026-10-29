# agentbridge gateway

TypeScript relay: Better Auth (OAuth 2.1 + MCP 2026-07-28), Postgres, WebSocket JSON-RPC hub, MCP tools.

## Local dev

```bash
cd server
cp .env.example .env
docker compose -f ../docker-compose.yml up -d postgres
pnpm install   # if pnpm blocks builds: pnpm approve-builds
pnpm auth:generate
pnpm db:generate && pnpm db:migrate
pnpm dev
```

Generate Better Auth tables after changing plugins, then apply Drizzle migrations for gateway tables.

## Mock runner

After enrolling a device (`POST /v1/devices/enroll` with a user OAuth token):

```bash
DEVICE_ID=... DEVICE_SECRET=... pnpm mock-runner
```

## MCP

- Resource: `MCP_RESOURCE` (default `http://localhost:8787/mcp`)
- Endpoint: `POST /mcp` with OAuth access token (`requireMcpAuth` + `@better-auth/mcp`)
- Scopes: `agentbridge:devices`, `agentbridge:threads`, `agentbridge:profiles`, `agentbridge:approvals`, `agentbridge:admin`
