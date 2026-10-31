# Contributing to clithread

Thanks for helping improve clithread.

## Ground rules

- Discuss large design changes against [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before a big PR when you can.
- Keep PRs focused. Prefer small, reviewable changes over mixed refactors + features.
- Do not commit secrets, `.env` files, private keys, or real device credentials.
- Match existing style in the package you touch (`server/` TypeScript, `runner/` Rust).
- Format from the repo root with Prettier before opening a PR. Lint `server/` with Oxlint.

## Development setup

Environment variables, OAuth alignment, email verification, and enroll flows: **[`docs/SETUP.md`](docs/SETUP.md)**.

### Formatting (repo root)

```bash
pnpm install
pnpm format          # write
pnpm format:check    # CI-style check
```

Config: [`.prettierrc.json`](.prettierrc.json), [`.prettierignore`](.prettierignore).

### Gateway (`server/`)

```bash
cd server
cp .env.example .env
docker compose -f ../docker-compose.yml up -d postgres
pnpm install
pnpm exec drizzle-kit push
pnpm --dir ../web build
pnpm lint            # oxlint
pnpm test
pnpm dev
```

### Runner (`runner/`)

```bash
cd runner
cargo test
cargo build
```

### Cutting a runner release

1. Bump the version in [`runner/Cargo.toml`](runner/Cargo.toml).
2. Update the installer default and pinned install examples to the same
   version.
3. Commit the version change and push it to the default branch.
4. Create and push a matching tag:

   ```bash
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

5. Confirm the **Release runner** workflow publishes four binaries and
   `SHA256SUMS` on GitHub.
6. Smoke-test the installer on a supported platform:

   ```bash
   CLITHREAD_VERSION=X.Y.Z bash runner/scripts/install.sh
   export PATH="${CLITHREAD_INSTALL_DIR:-$HOME/.local/bin}:$PATH"
   clithread --help
   ```

## Pull requests

1. Fork (or branch) from `main`.
2. Make your change with tests when behavior changes—gateway Vitest tests under `server/test/`, runner tests under `runner/tests/`.
3. Open a PR using the template. Describe **why**, not only what.
4. Keep the default branch green: run the relevant test suite locally before requesting review.

## Reporting bugs and proposing features

Use GitHub issues. Security vulnerabilities go through [`SECURITY.md`](SECURITY.md), not public issues.

## License

By contributing, you agree that your contributions are licensed under the Apache License, Version 2.0 (see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE)).
