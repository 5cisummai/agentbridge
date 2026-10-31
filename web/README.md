# clithread web

React (Vite) OAuth UI for the gateway: `/`, `/sign-in`, `/sign-up`, `/consent`, `/device`.

The gateway serves **`web/dist`** after build (or `WEB_DIST` in Docker). Without a build, auth routes show “Web UI not built”.

**Gateway env (OAuth URLs, Resend, social login):** [`../docs/SETUP.md`](../docs/SETUP.md).

## Build

From repo root:

```bash
pnpm --dir web install
pnpm --dir web build                 # → web/dist/
pnpm --dir web build --watch         # with `pnpm --dir server dev`
```

Or from this directory:

```bash
pnpm install
pnpm build
pnpm build --watch
```

Restart or watch-build before testing OAuth flows. Same-origin (`BETTER_AUTH_URL`) keeps auth cookies on the gateway.

## UI tooling

```bash
pnpm exec shadcn add …     # add more UI primitives
```
