# agentbridge runner

Rust device runner: outbound WebSocket to the gateway, PTY-backed CLI threads, SQLite profiles, cwd allowlist.

## Build

```bash
cd runner
cargo build --release
# binary: target/release/agentbridge
```

## Enroll

With the gateway running ([`server/`](../server/)):

```bash
export AGENTBRIDGE_GATEWAY_URL=http://localhost:8787
agentbridge enroll --name "$(hostname)"
```

User approves the device code at `{gateway}/device`. Credentials are stored at:

- macOS: `~/Library/Application Support/agentbridge/device.json` (mode 0600)
- Linux: `$XDG_CONFIG_HOME/agentbridge/device.json`

## Run

```bash
agentbridge run
```

Connects to `wss://…/ws`, sends `device.hello`, handles hub JSON-RPC (`thread.*`, `profile.*`, `workspace.*`, `approval.resolve`), emits `thread.event` and `approval.submit`.

## Local management

```bash
agentbridge status
agentbridge roots list|add /path|remove /path
agentbridge profiles list
agentbridge profiles set-env codex OPENAI_API_KEY=sk-...
```

## Tests

```bash
cargo test
```

## Protocol

Matches the gateway hub in [`server/src/hub/registry.ts`](../server/src/hub/registry.ts) and MCP forwards in [`server/src/mcp/register-tools.ts`](../server/src/mcp/register-tools.ts).

OAuth device enroll:

1. `POST /api/auth/device/code` (`client_id=agentbridge-runner`)
2. Poll `POST /api/auth/oauth2/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code`
3. `POST /v1/devices/enroll` with user Bearer token

## Telemetry

Set `OTEL_EXPORTER_OTLP_ENDPOINT` for OTLP HTTP export (optional).
