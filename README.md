# Neurcode CLI OSS

[![OSS CI](https://github.com/sujit-jaunjal/neurcode-cli-oss/actions/workflows/ci.yml/badge.svg)](https://github.com/sujit-jaunjal/neurcode-cli-oss/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/@neurcode-ai/cli)](https://www.npmjs.com/package/@neurcode-ai/cli)
[![CLI downloads](https://img.shields.io/npm/dy/@neurcode-ai/cli?label=CLI%20downloads%20%2812mo%29)](https://www.npmjs.com/package/@neurcode-ai/cli)
[![Open VSX downloads](https://img.shields.io/open-vsx/dt/sujit-jaunjal/neurcode-governance?label=Open%20VSX%20installs)](https://open-vsx.org/extension/sujit-jaunjal/neurcode-governance)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Public, sanitized repository for the Neurcode CLI runtime.

This repository is generated from the private `neurcode` monorepo and synced to the `@neurcode-ai/cli` command surface.

Current exported CLI package version in this repo: `0.20.24` (the npm badge shows the latest published registry version).

## Distribution snapshot

| Surface | Current public signal | Source |
|---|---:|---|
| Neurcode npm maintainer packages | 59,019 downloads / last 12 months across 14 packages | [`npm: neurcode`](https://www.npmjs.com/~neurcode) |
| `@neurcode-ai/cli` | 30,727 downloads / last 12 months | [`@neurcode-ai/cli`](https://www.npmjs.com/package/@neurcode-ai/cli) |
| VS Code / Cursor-compatible extension | 3,245 Open VSX installs | [`sujit-jaunjal.neurcode-governance`](https://open-vsx.org/extension/sujit-jaunjal/neurcode-governance) |

_Snapshot generated from the public npm downloads API and Open VSX API on 2026-07-06 UTC. npm downloads indicate registry install activity, not unique active users._

## Why this repository exists

`neurcode-cli-oss` provides a safe open-source boundary for CLI runtime behavior without exposing private control-plane internals.

It is designed for:

- OSS contributors who want to test CLI flows and propose improvements
- maintainers who need repeatable safety gates before merge
- instructors running workshops/cohorts with predictable commands

## Included vs excluded

Included:

- published CLI runtime artifacts (`packages/cli/dist`)
- local telemetry package consumed by the CLI (`packages/telemetry/dist`)
- OSS-safe docs and governance files
- repository safety checks and boundary validation scripts

Excluded:

- Private API/control-plane implementation
- Internal monorepo sources outside the exported CLI + telemetry packages
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

### 1) Runtime governance pilot loop (recommended)

```bash
neurcode agent walkthrough codex
neurcode agent bootstrap codex --dir .
neurcode agent start codex --goal "Make a bounded change"
neurcode agent report codex --latest
```

Run these commands inside a git repository. If you are in a new folder:

```bash
git init
git add .
git commit -m "chore: baseline"
```

### 2) Dashboard-connected runtime evidence (requires login/API access)

```bash
neurcode login
neurcode activate claude --connect <short-lived-token>
neurcode runtime cloud-status
neurcode sync --runtime
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
