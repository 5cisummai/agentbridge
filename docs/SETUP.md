# agentbridge setup guide

Step-by-step instructions for running the gateway, web UI, runner, and MCP clients locally or in production.

## Prerequisites

| Component | Requirement |
|-----------|-------------|
| Gateway | **Node.js 22+**, **pnpm**, **Docker** (for Postgres) |
| Web UI | Built with Vite; needs `pnpm --dir web build` before the gateway can serve auth pages |
| Runner | **Rust** toolchain (`cargo build`) |
| Database | PostgreSQL 16 (compose file provided) |

From the repo root, install shared tooling once:

```bash
pnpm install
cd server && pnpm install
cd ../web && pnpm install
```

---

## 1. Gateway environment variables

Copy the template and edit values:

```bash
cd server
cp .env.example .env
```

The gateway validates env on startup (`server/src/env.ts`). Invalid or missing required vars fail fast.

### Required

| Variable | Example (local) | Purpose |
|----------|-----------------|--------|
| `DATABASE_URL` | `postgres://agentbridge:agentbridge@localhost:5432/agentbridge` | Postgres connection for auth + hub state |
| `BETTER_AUTH_SECRET` | 32+ random characters | Signs sessions and tokens. **Never use the example string in production.** Generate with e.g. `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | `http://localhost:8787` | Public origin of the gateway (OAuth redirects, cookies, trusted origin). Must match what users type in the browser. |
| `MCP_RESOURCE` | `http://localhost:8787/mcp` | OAuth **resource identifier** for MCP. Access tokens are bound to this URL. MCP clients must use the same resource when registering and connecting. |

**URL alignment (important):** For a single local gateway, all three URLs share the same host/port:

- Browser / OAuth: `BETTER_AUTH_URL` → `http://localhost:8787`
- MCP HTTP endpoint: `POST` to `{origin}/mcp` → same host as `MCP_RESOURCE`
- WebSocket hub: `ws://localhost:8787/ws` (derived from `BETTER_AUTH_URL` on the runner)

If you put the gateway behind a reverse proxy or TLS terminator, set `BETTER_AUTH_URL` and `MCP_RESOURCE` to the **public HTTPS** origin (e.g. `https://bridge.example.com` and `https://bridge.example.com/mcp`). Mismatch between `BETTER_AUTH_URL`, `MCP_RESOURCE`, and what the MCP client uses is the most common auth failure.

### Optional (gateway)

| Variable | Default | Purpose |
|----------|---------|--------|
| `PORT` | `8787` | HTTP listen port |
| `NODE_ENV` | `development` | `development` \| `production` \| `test` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | (unset) | GitHub OAuth on sign-in. Omit both to hide GitHub. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | (unset) | Google OAuth. Omit both to hide Google. |
| `ALLOW_UNAUTHENTICATED_CLIENT_REGISTRATION` | `false` in production | Public MCP client dynamic registration. Keep disabled unless your client ecosystem requires it; local development enables it automatically. |
| `RESEND_API_KEY` | (unset) | Sends real verification emails via Resend. Required when `NODE_ENV=production`; local development can print verification links to the gateway console. |
| `RESEND_FROM` | `agentbridge <onboarding@resend.dev>` | From address when using Resend |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | (unset) | OpenTelemetry trace export (HTTP) |
| `MAX_THREADS_PER_DEVICE` | `8` | Hub limit per device |
| `MAX_EVENTS_PER_THREAD` | `10000` | Event retention cap per thread |
| `APPROVAL_TIMEOUT_MS` | `900000` (15 min) | Approval expiry |

### Rate limiting

- **`/api/auth/*`**: Better Auth rate limits with counters stored in Postgres (`rateLimit` table). Enabled in development and production; disabled in `NODE_ENV=test`. Stricter limits on sign-in, sign-up, and verification email paths.
- **Cloudflare edge rules**: Apply rate limiting before traffic reaches the gateway. The origin must only accept traffic from Cloudflare; otherwise these rules can be bypassed.

For a Cloudflare-proxied production gateway, create these Security > Rate limiting rules and tune thresholds from logs:

| Expression | Starting limit | Action |
|------------|----------------|--------|
| `http.request.method eq "POST" and starts_with(http.request.uri.path, "/api/auth/")` | 30 requests / 60 seconds per IP | Block for 60 seconds |
| `http.request.method eq "POST" and http.request.uri.path eq "/v1/devices/enroll"` | 20 requests / 60 seconds per IP | Block for 60 seconds |
| `http.request.method eq "POST" and http.request.uri.path eq "/mcp"` | 300 requests / 60 seconds per IP | Block for 60 seconds |
| `http.request.uri.path eq "/ws"` | 30 requests / 60 seconds per IP | Block for 60 seconds |

These edge limits absorb volumetric abuse; Better Auth's Postgres limits remain the authoritative protection for authentication. Lock down the origin firewall/security group to Cloudflare IPs and use `CF-Connecting-IP` only after that restriction is in place.

### Gateway-only (not in `.env.example`, read by code)

| Variable | Purpose |
|----------|--------|
| `WEB_DIST` | Absolute path to built SPA (`index.html` + assets). Docker sets `/app/public`. Local dev usually needs no override if `web/dist` exists. |

---

## 2. Start Postgres and the gateway (local)

```bash
# From repo root
docker compose up -d postgres

cd server
cp .env.example .env   # if you have not already
pnpm install
pnpm exec drizzle-kit push   # first-time DB: review SQL, apply schema
pnpm --dir ../web build        # required for /sign-in, /consent, /device
pnpm dev
```

Check:

- `GET http://localhost:8787/` — home UI (or “Web UI not built” if you skipped the web build)
- Health/tests: `cd server && pnpm test`

**Email verification:** Sign-up requires a verified email. Without `RESEND_API_KEY`, watch the **gateway terminal** for the verification link after sign-up.

**UI iteration:** In two terminals:

```bash
pnpm --dir web build --watch
pnpm --dir server dev
```

---

## 3. Docker Compose (Postgres + gateway image)

```bash
# Postgres only (typical local dev)
docker compose up -d postgres

# Postgres + gateway container (UI baked into image at build time)
export BETTER_AUTH_SECRET="$(openssl rand -base64 32)"   # recommended even locally
docker compose up -d --build
```

Compose injects `DATABASE_URL` for the gateway service and passes through OAuth/email vars from your shell (see `docker-compose.yml`). Defaults still use weak Postgres credentials — **local only**.

---

## 4. Create a user account

1. Open `http://localhost:8787/sign-up` (or `/sign-in`).
2. Register with email/password (or GitHub/Google if configured).
3. Verify email via Resend. In local development only, the **console link** is used when `RESEND_API_KEY` is unset.
4. You need this user before enrolling a runner device (device flow binds to your account).

---

## 5. Runner setup

### Build and gateway URL

```bash
cd runner
cargo build --release
export AGENTBRIDGE_GATEWAY_URL=http://localhost:8787   # overrides config file
./target/release/agentbridge enroll --name "$(hostname)"
```

`AGENTBRIDGE_GATEWAY_URL` overrides `gateway_url` in the runner config file for that process. Persisted config lives at:

| OS | Config | Device credential | SQLite data |
|----|--------|-------------------|-------------|
| macOS | `~/Library/Application Support/agentbridge/config.toml` | `.../device.json` (0600) | `~/Library/Application Support/agentbridge/runner.sqlite` |
| Linux | `$XDG_CONFIG_HOME/agentbridge/config.toml` | `.../device.json` | `$XDG_DATA_HOME/agentbridge/runner.sqlite` |

### Enroll flow

1. CLI prints a **device code** and opens or points you to `{BETTER_AUTH_URL}/device`.
2. Sign in as the user who should own the device.
3. Approve the code in the browser.
4. Runner stores `device_id` + secret in `device.json`. Enrollment requires the `agentbridge:devices` OAuth scope.

### Run the runner

```bash
./target/release/agentbridge run
```

Connects to `{gateway}/ws` with `device.hello` using the enrolled credential.

### Runner config file (`config.toml`)

| Key | Default | Meaning |
|-----|---------|--------|
| `gateway_url` | `http://localhost:8787` | HTTP(S) base URL (WS URL is derived) |
| `heartbeat_interval_secs` | `15` | Hub heartbeat |
| `max_threads` | compile-time default | Local PTY thread cap |

### Runner environment

| Variable | Purpose |
|----------|--------|
| `AGENTBRIDGE_GATEWAY_URL` | Overrides `gateway_url` for enroll/run |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional OTLP HTTP traces |
| `AGENTBRIDGE_TEST_DIR` | Test-only; redirects config/data dirs |

### CLI API keys (stay on the device)

Secrets for Codex/Claude/etc. are **not** stored on the gateway. Set them in runner profiles:

```bash
agentbridge profiles set-env codex OPENAI_API_KEY=sk-...
agentbridge roots add /path/to/allowed/workspace
agentbridge profiles list
agentbridge status
```

OAuth client id for enroll is fixed: **`agentbridge-runner`** (public native client, device-code grant). Its device-code token is explicitly scoped for enrollment.

---

## 6. Connect an MCP client

| Setting | Value (local) |
|---------|----------------|
| MCP URL | `http://localhost:8787/mcp` (must match `MCP_RESOURCE`) |
| Auth | OAuth 2.1 (Better Auth MCP plugin); dynamic client registration is supported, but unauthenticated public registration is disabled in production unless explicitly enabled |
| Scopes | `agentbridge:devices`, `agentbridge:threads`, `agentbridge:profiles`, `agentbridge:approvals`, `agentbridge:admin` (+ `openid`, `profile`, `offline_access` as needed) |

Typical flow:

1. MCP client discovers OAuth metadata from the gateway.
2. User signs in via `/sign-in` and consents at `/consent`.
3. Client calls MCP tools; gateway forwards to the enrolled runner over WebSocket.

The gateway currently allows **legacy MCP clients** via `legacy: "stateless"` for older `initialize` behavior; prefer clients that speak MCP 2026-07-28 when possible. See [`server/README.md`](../server/README.md).

---

## 7. Mock runner (gateway testing without Rust)

After a real enroll (you need `device_id` + secret from enrollment):

```bash
cd server
DEVICE_ID=<uuid> DEVICE_SECRET=<secret> pnpm mock-runner
```

| Variable | Default | Purpose |
|----------|---------|--------|
| `DEVICE_ID` | (required) | From enroll response |
| `DEVICE_SECRET` | (required) | From enroll response |
| `GATEWAY_URL` | `ws://localhost:8787/ws` | WebSocket hub URL |

---

## 8. Production checklist

- [ ] Strong unique `BETTER_AUTH_SECRET` and database credentials
- [ ] `BETTER_AUTH_URL` and `MCP_RESOURCE` use your public HTTPS origin
- [ ] TLS terminates in front of the gateway; cookies and OAuth redirects use HTTPS
- [ ] `RESEND_API_KEY` + verified domain for email (verification required on sign-up)
- [ ] Social OAuth apps configured with callback URLs for your public origin
- [ ] Runner `gateway_url` / `AGENTBRIDGE_GATEWAY_URL` points at the same public gateway
- [ ] Restrict network access to Postgres; back up before schema upgrades
- [ ] Read [`SECURITY.md`](../SECURITY.md)

---

## 9. Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| “Web UI not built” | Run `pnpm --dir web build` |
| Invalid environment on start | Missing var or `BETTER_AUTH_SECRET` shorter than 32 chars |
| OAuth / MCP 401 or wrong audience | `MCP_RESOURCE` does not match client resource URL |
| Sign-up works but cannot sign in | Email not verified; check Resend or gateway logs for link |
| Runner enroll fails after approve | `AGENTBRIDGE_GATEWAY_URL` wrong; token must include `MCP_RESOURCE` audience |
| `device.hello` rejected | Wrong `device.json`, or device owned by another user |
| Drizzle migrate empty DB | Use `drizzle-kit push` for fresh DBs; see server README for SQL upgrade path |

---

## Related docs

- [`README.md`](../README.md) — repo overview
- [`server/README.md`](../server/README.md) — protocol, migrations, MCP details
- [`runner/README.md`](../runner/README.md) — runner commands
- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — design decisions
