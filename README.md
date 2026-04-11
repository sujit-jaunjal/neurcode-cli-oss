# Neurcode CLI OSS

[![OSS CI](https://github.com/sujit-jaunjal/neurcode-cli-oss/actions/workflows/ci.yml/badge.svg)](https://github.com/sujit-jaunjal/neurcode-cli-oss/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@neurcode-ai/cli)](https://www.npmjs.com/package/@neurcode-ai/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Public, sanitized repository for the Neurcode CLI runtime.

This repo is synced to the `@neurcode-ai/cli` command surface and is intended for open-source usage, contributor onboarding, and enterprise governance demos.

Current exported CLI package version in this repo: `0.9.43`.

## Why this repository exists

`neurcode-cli-oss` provides a safe open-source boundary for CLI runtime behavior without exposing private control-plane internals.

It is designed for:

- OSS contributors who want to test CLI flows and propose improvements
- maintainers who need repeatable safety gates before merge
- instructors running workshops/cohorts with predictable commands

## Included vs excluded

Included:

- published CLI runtime artifacts (`packages/cli/dist`)
- OSS-safe docs and governance files
- repository safety checks and boundary validation scripts

Excluded:

- private backend/control-plane internals
- private monorepo workspaces not part of OSS CLI surface
- local runtime/cache/credential artifacts

## Quick start

```bash
pnpm install
pnpm ci:oss
node packages/cli/dist/index.js --help
```

`pnpm ci:oss` runs:

- `oss:check` (secret/artifact safety)
- `oss:check:boundary` (export boundary integrity)
- `cli:help` (runtime command help)
- `cli:smoke` (command surface + auto-detect smoke checks)

## CLI workflow modes

### 1) Local governance mode (best for workshops / no login required)

```bash
neurcode policy install soc2
neurcode policy lock --no-dashboard
neurcode policy compile --no-dashboard --intent "Do not use console.log; Do not use TODO"
neurcode verify --policy-only
```

Use this for deterministic local policy checks during onboarding sessions.

### 2) Cloud-assisted plan mode (requires login/API access)

```bash
neurcode login
neurcode init
neurcode plan "Implement org-level RBAC"
neurcode prompt
neurcode verify --record --compiled-policy neurcode.policy.compiled.json --enforce-change-contract
neurcode ship "Implement org-level RBAC" --max-fix-attempts 2
```

## External plan import (Codex/Claude/Cursor/ChatGPT)

List auto-detected candidate plans:

```bash
neurcode contract import --provider codex --auto-detect --list-candidates --json
```

Import detected plan into verify flow:

```bash
neurcode contract import --provider codex --auto-detect --no-confirm
```

Tip: place plan artifacts under `.codex/plans`, `.claude/plans`, `.cursor/plans`, or `.neurcode/import`.

## Docs

- Command reference: [docs/cli-commands.md](./docs/cli-commands.md)
- 15-min setup: [docs/getting-started-15-min.md](./docs/getting-started-15-min.md)
- Workflow guide: [docs/workflow-overview.md](./docs/workflow-overview.md)
- OSS release runbook: [docs/open-source-release.md](./docs/open-source-release.md)
- OSS architecture boundaries: [docs/architecture/oss-architecture.md](./docs/architecture/oss-architecture.md)

## Enterprise OSS standards in this repo

- CI on pull requests and main pushes
- Dependabot for npm + GitHub Actions
- issue and pull request templates
- CODEOWNERS
- code of conduct, security, support, and contribution docs

## Contributing

1. Create an issue for bug/feature discussion.
2. Branch from `main`.
3. Run `pnpm ci:oss` before opening your PR.
4. Open PR with verification notes and risk summary.
5. Maintainers review and merge.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for full details.

## Related repositories

- OSS CLI runtime: [sujit-jaunjal/neurcode-cli-oss](https://github.com/sujit-jaunjal/neurcode-cli-oss)
- OSS GitHub Action package: [sujit-jaunjal/neurcode-actions](https://github.com/sujit-jaunjal/neurcode-actions)
