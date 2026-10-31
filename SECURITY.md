# Security Policy

## Supported versions

This project is early and moving quickly. Security fixes land on the default branch (`main`). There is no long-term support window yet—upgrade to the latest `main` (or release tag, when published) when a fix ships.

## What this software does

clithread relays authenticated MCP clients to a **device runner** that can spawn PTY-backed CLI processes. Treat a compromised gateway, leaked device credential, or over-scoped OAuth token as **remote code execution on the enrolled device**.

## Deploying safely

- Generate a strong unique `BETTER_AUTH_SECRET` (32+ random bytes). Never reuse the compose/example placeholder in production.
- Do not expose the default docker-compose Postgres password (`agentbridge`) or any example secrets beyond local development.
- Prefer TLS everywhere in production (`BETTER_AUTH_URL` / `MCP_RESOURCE` should be `https://` origins you control).
- Scope OAuth clients and MCP tool scopes to least privilege.
- Keep device credentials and runner config files private (the runner expects restrictive file modes on secret paths).
- Lock down runner profile cwd allowlists and which CLIs a device may spawn.
- Assume runners and gateways must be upgraded together across protocol/schema changes—see [`server/README.md`](server/README.md).

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems.

Email **ajay.saravanan@outlook.com** with:

- A short description of the issue and its impact
- Steps to reproduce or a proof of concept if you have one
- Affected commit, tag, or approximate version

You should get an acknowledgement within a few days. We will coordinate a fix and disclosure timing with you. Please give us a reasonable window to patch before public discussion.

If you prefer not to use email once the public repository is live, open a **private** security advisory on the GitHub repo (Security → Advisories) if that feature is enabled.
