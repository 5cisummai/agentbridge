# Coolify production deployment design

## Goal

Make the `main` branch of `5cisummai/clithread` the source of truth for the
homeserver production deployment. Coolify will build and redeploy the gateway
after a successful GitHub push, while `clithread.dev` remains served through
the existing Cloudflare Tunnel.

## Current constraints

- Coolify 4.5.1 is already installed on `homeserver` and owns the host proxy.
- The current production stack is a separate Docker Compose project.
- Production data is in the Docker volume `agentbridge-deploy_pgdata`.
- The Cloudflare Tunnel and its token already work for `clithread.dev`.
- GitHub `main` is protected; deployment follows a merged change, not an
  unreviewed direct push.

## Architecture

The repository will contain a production Compose definition under
`deploy/coolify/`. It will define:

1. PostgreSQL using the existing external `agentbridge-deploy_pgdata` volume.
2. A migration service that blocks the gateway until the schema is current.
3. The gateway built from `server/Dockerfile`, with production secrets
   supplied by Coolify environment variables.

The Cloudflare Tunnel remains a small, separately managed service. Its public
routes will be:

- `clithread.dev` to Coolify's proxy, with the original Host header preserved.
- `coolify.clithread.dev` to the Coolify dashboard through the tunnel; the
  dashboard will not be directly exposed on the public interface.

Coolify will use its GitHub integration to track `5cisummai/clithread` on
`main` and enable automatic deployments. The repository's GitHub checks remain
the validation gate before merge.

## Cutover and rollback

Before cutover:

- Create a verified PostgreSQL dump.
- Capture the current Compose file and environment configuration.
- Configure the Coolify application without stopping the current stack.

During cutover:

- Stop the old gateway/Postgres stack without deleting its volume.
- Deploy the Coolify stack using the external volume.
- Verify database connectivity, gateway health, OAuth metadata, MCP
  authentication behavior, WebSocket upgrade, and the public Cloudflare route.

If deployment fails, stop the Coolify stack and restart the captured Compose
stack. The database volume and old configuration remain available for this
rollback.

## Secrets and access

Secrets stay out of Git. Coolify will hold the database credentials,
Better Auth secret, Resend API key, OAuth credentials, and Cloudflare Tunnel
token. Browser-based GitHub/Coolify authorization will be performed through
Aside when required.

## Acceptance criteria

- A merge to `main` creates a Coolify deployment automatically.
- The deployment reaches a healthy state without recreating production data.
- `https://clithread.dev/healthz` returns success.
- OAuth metadata and `/mcp` continue to use `https://clithread.dev`.
- WebSocket clients receive `101 Switching Protocols`.
- The Coolify dashboard is reachable only through its intended hostname and
  authentication.
- A documented rollback remains possible without deleting the production
  volume.
