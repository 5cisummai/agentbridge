# agentbridge

**agentbridge** lets MCP clients (coding agents and IDEs) remotely control long-lived CLI threads on user devices through a relay gateway.

An MCP client talks to the **TypeScript gateway** (OAuth + MCP tools). The gateway routes work over WebSocket JSON-RPC to a **Rust runner** on a registered device. The runner spawns PTY-backed processes for configured CLIs (Codex, Claude Code, Cursor agent, or custom profiles) and streams a normalized event feed back.

This is not remote-SSH into an IDE. It is a neutral bridge: any CLI profile, your gateway, cloud or self-hosted.

## Repository layout

| Path                                           | Role                                                       |
| ---------------------------------------------- | ---------------------------------------------------------- |
| [`server/`](server/)                           | Gateway — Better Auth, Postgres, MCP HTTP, WebSocket hub   |
| [`runner/`](runner/)                           | Device runner — enroll, outbound WS, PTY threads, profiles |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Product and technical decision log                         |
| [`docker-compose.yml`](docker-compose.yml)     | Local Postgres (+ optional gateway image)                  |

## Quick start (local)

### 1. Gateway

```bash
cd server
cp .env.example .env
docker compose -f ../docker-compose.yml up -d postgres
pnpm install
pnpm exec drizzle-kit push   # fresh local DB; review the proposed schema
pnpm dev
```

Gateway defaults to `http://localhost:8787`. Details, upgrades, and MCP notes: [`server/README.md`](server/README.md).

`docker-compose.yml` uses local-dev Postgres credentials (`agentbridge` / `agentbridge`) and a placeholder `BETTER_AUTH_SECRET`. **Do not use those values in production.**

### 2. Runner

```bash
cd runner
cargo build --release
export AGENTBRIDGE_GATEWAY_URL=http://localhost:8787
./target/release/agentbridge enroll --name "$(hostname)"
./target/release/agentbridge run
```

Approve the device at `{gateway}/device`. Full runner docs: [`runner/README.md`](runner/README.md).

## Package note

`server/package.json` sets `"private": true` so the gateway package is not published to npm by accident. Cloning and self-hosting this repo is intentional; publishing `@agentbridge/server` is not.

## Security

Remote device control is powerful. Read [`SECURITY.md`](SECURITY.md) before deploying, and report vulnerabilities there.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

Copyright 2026 Ajay Saravanan. Licensed under the [Apache License, Version 2.0](LICENSE).
