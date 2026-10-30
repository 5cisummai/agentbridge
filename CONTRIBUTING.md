# Contributing to agentbridge

Thanks for helping improve agentbridge.

## Ground rules

- Discuss large design changes against [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before a big PR when you can.
- Keep PRs focused. Prefer small, reviewable changes over mixed refactors + features.
- Do not commit secrets, `.env` files, private keys, or real device credentials.
- Match existing style in the package you touch (`server/` TypeScript, `runner/` Rust).

## Development setup

### Gateway (`server/`)

```bash
cd server
cp .env.example .env
docker compose -f ../docker-compose.yml up -d postgres
pnpm install
pnpm exec drizzle-kit push
pnpm test
pnpm dev
```

### Runner (`runner/`)

```bash
cd runner
cargo test
cargo build
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
