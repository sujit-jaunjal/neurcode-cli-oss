# Contributing to Neurcode CLI OSS

Thanks for contributing. This repository is intentionally strict on security, boundary integrity, and reproducible CLI behavior.

## Before you start

Read:

- [README.md](./README.md)
- [docs/cli-commands.md](./docs/cli-commands.md)
- [docs/workflow-overview.md](./docs/workflow-overview.md)
- [docs/architecture/oss-architecture.md](./docs/architecture/oss-architecture.md)

## Local setup

```bash
pnpm install
pnpm ci:oss
```

## Branch + PR workflow

1. Open or reference an issue.
2. Create a branch from `main`.
3. Keep PR scope to one concern (bug fix, doc update, or feature unit).
4. Run `pnpm ci:oss`.
5. Open PR with verification details.

## Required checks before PR

```bash
pnpm oss:check
pnpm oss:check:boundary
pnpm cli:help
pnpm cli:smoke
```

## Security and boundary expectations

- Never commit secrets, tokens, credentials, private keys, or real `.env` files.
- Never commit local runtime/cache artifacts (`.neurcode/`, `.pnpm-store/`, local DB files, temporary auth files).
- If a secret exposure is suspected:
  1. rotate/revoke immediately,
  2. remove from tracked files,
  3. run `pnpm oss:check`,
  4. open a remediation PR.

## Commit and PR quality bar

- Use conventional and scoped commit messages where possible (for example: `fix(oss): ignore node_modules in boundary scan`).
- Include a PR verification section:
  - exact commands run
  - expected vs actual results
  - migration/compatibility notes
  - risk and rollback notes

## Review policy

- At least one maintainer approval is required.
- CI must pass before merge.
- Maintainers may request additional evidence for policy/verify behavior changes.
