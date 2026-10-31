# clithread runner

Rust device runner: outbound WebSocket to the gateway, PTY-backed CLI threads, SQLite profiles, cwd allowlist.

**Full setup (env vars, paths, MCP, production):** [`../docs/SETUP.md`](../docs/SETUP.md).

## Install

Install the pinned release for supported Linux and macOS targets after the
`v0.1.0` GitHub release is published:

```bash
curl -fsSL https://raw.githubusercontent.com/5cisummai/clithread/v0.1.0/runner/scripts/install.sh | bash
export PATH="${CLITHREAD_INSTALL_DIR:-$HOME/.local/bin}:$PATH"
```

Set `CLITHREAD_VERSION` to install another release, or
`CLITHREAD_VERIFY=1` to verify the downloaded binary against its
`SHA256SUMS` file.

## Build from source

```bash
cd runner
cargo build --release
# binary: target/release/clithread
```

## Gateway URL

The runner must target the same gateway you use in the browser for OAuth.

| Source                       | Precedence                        |
| ---------------------------- | --------------------------------- |
| `CLITHREAD_GATEWAY_URL` env  | Overrides config for this process |
| `gateway_url` in config file | Default when env unset            |

Local example:

```bash
export CLITHREAD_GATEWAY_URL=http://localhost:8787
```

WebSocket hub URL is derived: `http` → `ws://…/ws`, `https` → `wss://…/ws`.

## Enroll

With the gateway running ([`server/`](../server/)) and a **verified** user account:

```bash
clithread enroll --name "$(hostname)"
```

1. CLI shows a device code.
2. Open `{gateway}/device` (e.g. `http://localhost:8787/device`), sign in, approve.
3. Credentials written to `device.json` (mode 0600).

OAuth client id (fixed): **`agentbridge-runner`**.

### Credential and config paths

| OS    | Config                                                | Device credential | SQLite                                                  |
| ----- | ----------------------------------------------------- | ----------------- | ------------------------------------------------------- |
| macOS | `~/Library/Application Support/clithread/config.toml` | `.../device.json` | `~/Library/Application Support/clithread/runner.sqlite` |
| Linux | `$XDG_CONFIG_HOME/clithread/config.toml`              | `.../device.json` | `$XDG_DATA_HOME/clithread/runner.sqlite`                |

Existing installations automatically continue using their legacy
`agentbridge` data directory until a new `clithread` directory is created.

### `config.toml` keys

```toml
gateway_url = "http://localhost:8787"
heartbeat_interval_secs = 15
max_threads = 8   # default from build
```

## Run

```bash
clithread run
```

Sends `device.hello`, handles hub JSON-RPC (`thread.*`, `profile.*`, `workspace.*`, `approval.resolve`), emits `thread.event` and `approval.submit`.

## Local management

CLI secrets stay on the device (not on the gateway):

```bash
clithread status
clithread roots list|add /path|remove /path
clithread profiles list
clithread profiles set-env codex OPENAI_API_KEY=sk-...
```

## Environment variables

| Variable                      | Purpose                                              |
| ----------------------------- | ---------------------------------------------------- |
| `CLITHREAD_GATEWAY_URL`       | Override `gateway_url`                               |
| `CLITHREAD_VERSION`           | Release version to install                           |
| `CLITHREAD_INSTALL_DIR`       | Installation directory; defaults to `~/.local/bin`   |
| `CLITHREAD_INSTALL_BASE`      | Override the release download base URL               |
| `CLITHREAD_VERIFY`            | Set to `1` to verify `SHA256SUMS`                    |
| `CLITHREAD_REPO`              | Override the GitHub repository used by the installer |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Optional OTLP HTTP traces                            |
| `CLITHREAD_TEST_DIR`          | Tests only — relocates config/data dirs              |

## Tests

```bash
cargo test
```

## Protocol

Matches the gateway hub in [`server/src/hub/registry.ts`](../server/src/hub/registry.ts) and MCP forwards in [`server/src/mcp/register-tools.ts`](../server/src/mcp/register-tools.ts).

Device enroll (RFC 8628):

1. `POST /api/auth/device/code` (`client_id=agentbridge-runner`; retained for compatibility)
2. Poll `POST /api/auth/oauth2/token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code` and `resource={MCP_RESOURCE}`
3. `POST /v1/devices/enroll` with user Bearer token
