# Coolify production deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing `clithread.dev` production stack under Coolify, preserve its PostgreSQL volume, and make merged `main` changes deploy automatically.

**Architecture:** Coolify will deploy a repository-owned production Compose file containing PostgreSQL, a migration image, and the gateway. The PostgreSQL service will use the existing external `agentbridge-deploy_pgdata` volume. The existing Cloudflare Tunnel will remain a separate token-managed service and route the public hostname to Coolify's host proxy.

**Tech Stack:** Docker Compose, Coolify 4.5.1, Node 22, pnpm, PostgreSQL 16, Cloudflare Tunnel, GitHub App/webhook integration, Aside browser automation.

## Global Constraints

- Preserve the existing Docker volume `agentbridge-deploy_pgdata`.
- Keep `https://clithread.dev` as the public gateway and MCP URL.
- Keep secrets out of Git; store them in Coolify or the private tunnel environment.
- Keep the old Compose file and environment backup available for rollback.
- Do not expose the Coolify dashboard directly on a public host port.
- Only merged pushes to protected `main` may trigger production deployment.

---

### Task 1: Add the repository-owned production deployment definition

**Files:**
- Create: `deploy/coolify/docker-compose.yml`
- Modify: `server/Dockerfile`
- Create: `deploy/coolify/README.md`

**Interfaces:**
- `deploy/coolify/docker-compose.yml` consumes Coolify environment variables:
  `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL`,
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `MCP_RESOURCE`, `RESEND_API_KEY`,
  `RESEND_FROM`, and optional OAuth variables.
- The Compose file produces `postgres`, `migrate`, and `gateway` services.
- `server/Dockerfile` produces a `migrate` target that runs the checked-in
  Drizzle schema against `DATABASE_URL`.

- [ ] **Step 1: Add the Coolify Compose file**

  Define PostgreSQL with health checks and:

  ```yaml
  volumes:
    pgdata:
      external: true
      name: agentbridge-deploy_pgdata
  ```

  Build `migrate` and `gateway` from the repository root with
  `server/Dockerfile`. Make `gateway` depend on `migrate` completing
  successfully and expose no host port. Use a gateway health check against
  `http://127.0.0.1:8787/healthz`.

- [ ] **Step 2: Add the migration image target**

  Extend `server/Dockerfile` after the dependency stage with a `migrate` stage
  that copies `server/tsconfig.json`, `server/drizzle.config.ts`,
  `server/src`, and `server/drizzle`, then runs:

  ```dockerfile
  CMD ["pnpm", "exec", "drizzle-kit", "push", "--force"]
  ```

  Keep the existing `runner` stage as the production gateway image.

- [ ] **Step 3: Document required Coolify variables and rollback behavior**

  Document that the external volume must exist before the first deployment,
  that secrets are entered in Coolify rather than committed, and that the
  captured legacy Compose stack is the rollback path.

- [ ] **Step 4: Validate the Compose model locally**

  Run:

  ```bash
  docker compose -f deploy/coolify/docker-compose.yml config
  ```

  Expected result: the file parses after supplying placeholder values for all
  required variables, and the external volume is named
  `agentbridge-deploy_pgdata`.

- [ ] **Step 5: Commit the deployment definition**

  ```bash
  git add deploy/coolify server/Dockerfile
  git commit -m "Add Coolify production deployment"
  ```

### Task 2: Make the Cloudflare Tunnel compatible with Coolify

**Files:**
- Create: `deploy/tunnel/docker-compose.yml`
- Create: `deploy/tunnel/.env.example`

**Interfaces:**
- The tunnel Compose file consumes `TUNNEL_TOKEN`.
- The remotely managed tunnel configuration routes
  `clithread.dev` to the host's Coolify proxy and
  `coolify.clithread.dev` to the Coolify dashboard.

- [ ] **Step 1: Add a minimal token-managed tunnel Compose file**

  Define one `cloudflare/cloudflared:latest` service with
  `restart: unless-stopped`, the tunnel token command, and host-gateway access
  needed to reach the Coolify proxy.

- [ ] **Step 2: Add a non-secret environment example**

  Document only `TUNNEL_TOKEN=` and never copy the real token into the
  repository.

- [ ] **Step 3: Commit the tunnel definition**

  ```bash
  git add deploy/tunnel
  git commit -m "Document Coolify Cloudflare tunnel service"
  ```

### Task 3: Configure Coolify and GitHub through Aside

**External resources:**
- Coolify dashboard at `http://100.92.135.101:8000`
- GitHub repository `5cisummai/clithread`

- [ ] **Step 1: Open the Coolify dashboard with Aside**

  Use Aside to open the dashboard and stop if it requires a user login,
  GitHub authorization, or an unrecognized confirmation. Do not guess or
  bypass an authentication prompt.

- [ ] **Step 2: Configure the public instance URL**

  Set the Coolify instance URL to `https://coolify.clithread.dev` only after
  the Cloudflare route is ready. Keep the dashboard protected by Coolify
  authentication.

- [ ] **Step 3: Connect GitHub**

  Authorize the Coolify GitHub App for `5cisummai/clithread`, select the
  repository, and configure the production branch as `main`.

- [ ] **Step 4: Create the production Compose resource**

  Create a project/resource using:

  ```text
  Compose file: deploy/coolify/docker-compose.yml
  Branch: main
  Auto deploy: enabled
  ```

  Enter production secrets and public URLs in Coolify environment variables.
  Do not deploy yet while the legacy stack owns the PostgreSQL volume.

### Task 4: Back up and perform the production cutover

**Remote files:**
- `/home/ubuntu/agentbridge-deploy/docker-compose.yml`
- `/home/ubuntu/agentbridge-deploy/.env`
- `/home/ubuntu/agentbridge-deploy/.env.pre-coolify`
- `/home/ubuntu/backups/clithread/`

- [ ] **Step 1: Capture the rollback inputs**

  On `homeserver`, create a timestamped directory, copy the legacy Compose
  file and environment file with mode `0600`, and run a custom-format dump:

  ```bash
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p /home/ubuntu/backups/clithread
  chmod 700 /home/ubuntu/backups/clithread
  docker compose -f /home/ubuntu/agentbridge-deploy/docker-compose.yml \
    exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
    -Fc > "/home/ubuntu/backups/clithread/${stamp}.dump"
  ```

  Verify the dump is non-empty without printing secrets.

- [ ] **Step 2: Stop only the legacy gateway and database stack**

  Stop the old gateway and Postgres containers without removing the external
  volume. Keep the tunnel process available until the new Coolify proxy route
  is verified.

- [ ] **Step 3: Deploy the Coolify resource**

  Trigger the first deployment from Coolify and wait for the migration service
  to complete and the gateway health check to pass. If the migration or health
  check fails, stop the new resource and restart the captured legacy Compose
  stack.

- [ ] **Step 4: Update the managed Cloudflare routes**

  Point `clithread.dev` to the Coolify proxy and add
  `coolify.clithread.dev` to the Coolify dashboard origin. Add the proxied
  `coolify.clithread.dev` DNS record in the existing `clithread.dev` zone.

- [ ] **Step 5: Verify the cutover**

  Run:

  ```bash
  curl -fsS https://clithread.dev/healthz
  curl -fsS https://clithread.dev/api/auth/.well-known/oauth-authorization-server
  curl -sS -o /tmp/mcp-body -w "%{http_code}\n" \
    -X POST https://clithread.dev/mcp \
    -H 'content-type: application/json' -d '{}'
  ```

  Expected results are health `{"ok":true}`, OAuth metadata with issuer
  `https://clithread.dev/api/auth`, and MCP status `401`.

### Task 5: Enable and verify push-to-deploy

- [ ] **Step 1: Enable auto-deploy in Coolify**

  Confirm the resource tracks `main` and that the GitHub webhook/App delivery
  is successful.

- [ ] **Step 2: Merge the rebrand/deployment PR**

  Use Aside for any browser confirmation required by GitHub. Do not merge if
  required checks are failing or GitHub reports a conflict.

- [ ] **Step 3: Verify the deployment**

  Confirm the merge commit creates a Coolify deployment and that the public
  health, OAuth, MCP, and WebSocket checks remain successful.

- [ ] **Step 4: Commit operational notes**

  ```bash
  git add deploy/coolify deploy/tunnel docs/superpowers
  git commit -m "Document Coolify cutover"
  ```

## Rollback

If the Coolify deployment fails, stop its resource, restore the previous
Cloudflare route, and run the captured legacy Compose file using the preserved
environment file. Do not delete `agentbridge-deploy_pgdata`. Restore from the
custom-format dump only if the volume itself is damaged.
