# agentbridge

**agentbridge** lets MCP clients (coding agents and IDEs) remotely control long-lived CLI threads on user devices through a relay gateway.

An MCP client talks to the **TypeScript gateway** (OAuth + MCP tools). The gateway routes work over WebSocket JSON-RPC to a **Rust runner** on a registered device. The runner spawns PTY-backed processes for configured CLIs (Codex, Claude Code, Cursor agent, or custom profiles) and streams a normalized event feed back.

This is not remote-SSH into an IDE. It is a neutral bridge: any CLI profile, your gateway, cloud or self-hosted.

**Setup:** Detailed env vars, enroll, and MCP steps are in **[`docs/SETUP.md`](docs/SETUP.md)**.

## Repository layout

| Path                                           | Role                                                        |
| ---------------------------------------------- | ----------------------------------------------------------- |
| [`server/`](server/)                           | Gateway — Better Auth, Postgres, MCP HTTP, WebSocket hub    |
| [`web/`](web/)                                 | React OAuth UI (sign-in, consent, device) served by gateway |
| [`runner/`](runner/)                           | Device runner — enroll, outbound WS, PTY threads, profiles  |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Product and technical decision log                          |
| [`docker-compose.yml`](docker-compose.yml)     | Local Postgres (+ optional gateway image)                   |

## Quick start (local)

### 1. Configure the gateway

```bash
cd server
cp .env.example .env
# Edit .env — see docs/SETUP.md for every variable
```

Minimum local values (defaults in `.env.example`):

| Variable             | Local value                                                     | Notes                                                   |
| -------------------- | --------------------------------------------------------------- | ------------------------------------------------------- |
| `DATABASE_URL`       | `postgres://agentbridge:agentbridge@localhost:5432/agentbridge` | Matches `docker-compose.yml` Postgres                   |
| `BETTER_AUTH_SECRET` | 32+ characters                                                  | Example string is **dev-only**                          |
| `BETTER_AUTH_URL`    | `http://localhost:8787`                                         | Must match browser URL                                  |
| `MCP_RESOURCE`       | `http://localhost:8787/mcp`                                     | MCP OAuth resource; keep in sync with `BETTER_AUTH_URL` |

Without `RESEND_API_KEY`, email verification links appear in the **gateway log** after sign-up.

### 2. Start Postgres, database, UI, gateway

```bash
docker compose up -d postgres
cd server
pnpm install
pnpm exec drizzle-kit push   # first-time only; review proposed schema
pnpm --dir ../web build      # required for /sign-in, /consent, /device
pnpm dev
```

Gateway: `http://localhost:8787`. Protocol and upgrades: [`server/README.md`](server/README.md).

UI watch mode: `pnpm --dir web build --watch` plus `pnpm --dir server dev`.

### 3. Account + runner

1. Sign up at `/sign-up`, verify email (Resend or console link).
2. Install and enroll a device:

The pinned installer below is available after the `v0.1.0` GitHub release is
published. Until then, use the source-build fallback below.

```bash
curl -fsSL https://raw.githubusercontent.com/5cisummai/agentbridge/v0.1.0/runner/scripts/install.sh | bash
export PATH="${AGENTBRIDGE_INSTALL_DIR:-$HOME/.local/bin}:$PATH"
export AGENTBRIDGE_GATEWAY_URL=http://localhost:8787
agentbridge enroll --name "$(hostname)"
# Approve at http://localhost:8787/device
agentbridge run
```

Release binaries and `SHA256SUMS` are published on the
[GitHub Releases page](https://github.com/5cisummai/agentbridge/releases).

For local development or platforms without a release asset, build from source with
`cd runner && cargo build --release` and use `./target/release/agentbridge`.

3. Point an MCP client at `MCP_RESOURCE` (`http://localhost:8787/mcp`) with OAuth. Scopes and client setup: [`docs/SETUP.md`](docs/SETUP.md).

`docker-compose.yml` Postgres credentials and placeholder secrets are **local development only**.

## Tooling

From the repo root:

```bash
pnpm install
pnpm format          # Prettier write
pnpm format:check
pnpm lint            # Oxlint in server/
```

Gateway-only: `cd server && pnpm lint`. Config lives in [`.prettierrc.json`](.prettierrc.json) and [`server/.oxlintrc.json`](server/.oxlintrc.json).

## Package note

`server/package.json` sets `"private": true` so the gateway package is not published to npm by accident. Cloning and self-hosting this repo is intentional; publishing `@agentbridge/server` is not.

## Security

Remote device control is powerful. Read [`SECURITY.md`](SECURITY.md) before deploying, and report vulnerabilities there.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Copyright 2026 Ajay Saravanan. Licensed under the [Apache License, Version 2.0](LICENSE).
