# Neurcode CLI OSS

[![OSS CI](https://github.com/sujit-jaunjal/neurcode-cli-oss/actions/workflows/ci.yml/badge.svg)](https://github.com/sujit-jaunjal/neurcode-cli-oss/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@neurcode-ai/cli)](https://www.npmjs.com/package/@neurcode-ai/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Public, sanitized repository for the Neurcode CLI runtime.

This repository is generated from the private `neurcode` monorepo and synced to the `@neurcode-ai/cli` command surface.

Current exported CLI package version in this repo: `0.9.50`.

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

- Private API/control-plane implementation
- Internal workspace sources outside the public CLI package
- Local runtime artifacts and credential-bearing files

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

### 1) Login + policy-first governance (recommended)

```bash
neurcode login
neurcode init
neurcode policy install soc2
neurcode policy compile --intent "Do not use console.log; Do not use TODO"
neurcode verify --policy-only
```

Run these commands inside a git repository. If you are in a new folder:

```bash
git init
git add .
git commit -m "chore: baseline"
```

### 2) Plan-enforced delivery (requires login/API access)

```bash
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

## Docs

- Command reference: [docs/cli-commands.md](./docs/cli-commands.md)
- 15-min setup: [docs/getting-started-15-min.md](./docs/getting-started-15-min.md)
- Workflow guide: [docs/workflow-overview.md](./docs/workflow-overview.md)
- OSS release runbook: [docs/open-source-release.md](./docs/open-source-release.md)
- OSS architecture boundaries: [docs/architecture/oss-architecture.md](./docs/architecture/oss-architecture.md)

## Related repositories

- OSS CLI runtime: [sujit-jaunjal/neurcode-cli-oss](https://github.com/sujit-jaunjal/neurcode-cli-oss)
- OSS GitHub Action package: [sujit-jaunjal/neurcode-actions](https://github.com/sujit-jaunjal/neurcode-actions)
