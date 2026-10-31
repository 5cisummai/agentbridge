# Coolify production deployment

This Compose file is the production deployment for `clithread.dev`.
Coolify should track the `main` branch and use this file as its Compose path.

Required Coolify variables:

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL=https://clithread.dev`
- `MCP_RESOURCE=https://clithread.dev/mcp`

Email delivery variables:

- `RESEND_API_KEY`
- `RESEND_FROM=clithread <noreply@clithread.dev>`

Optional OAuth variables:

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

The `pgdata` volume is intentionally external and must already exist as
`agentbridge-deploy_pgdata`. This keeps the current production database when
the legacy Compose stack is replaced by Coolify.

Before the first deployment, create a PostgreSQL dump and preserve the legacy
Compose file and environment file. If the Coolify deployment fails, stop its
resource and restart the legacy stack without deleting the external volume.
