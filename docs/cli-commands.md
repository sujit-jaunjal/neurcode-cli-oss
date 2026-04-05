# Neurcode CLI Command Reference

This is the repository-canonical command reference for `@neurcode-ai/cli`.

Before diving into flags, start with:
- [15-Minute Quickstart](./getting-started-15-min.md)
- [Workflow Overview](./workflow-overview.md)

## Install

```bash
npm install -g @neurcode-ai/cli@latest
neurcode --version
neurcode start
```

## Primary Workflow (Recommended)

```bash
neurcode init
neurcode policy compile --intent "No auth bypass, no secret literals" --require-deterministic-match
neurcode plan "Add org-level RBAC" --ticket NEU-123
neurcode prompt
neurcode verify --record --compiled-policy neurcode.policy.compiled.json --enforce-change-contract
neurcode ship "Harden auth middleware" --max-fix-attempts 3 --test-command "pnpm test:ci"
```

`neurcode start` prints this guided flow and optional next steps.

## Identity and Scope

```bash
neurcode login
neurcode logout
neurcode whoami
neurcode init
neurcode config --show
neurcode repo list
```

## Advanced Planning and Delivery

```bash
neurcode plan-slo status
neurcode apply <plan-id>
neurcode simulate --base origin/main
neurcode policy install soc2
neurcode policy compile --intent "No auth bypass" --require-deterministic-match
neurcode audit evidence --no-include-events --out .neurcode/evidence.json
```

## Repository Q&A

```bash
neurcode ask "Where is orgId resolved in auth middleware?"
neurcode ask "Which files inject x-org-id?" --max-citations 20
neurcode ask "Is this repo multi-tenant?" --proof
neurcode ask "How is policy hash computed?" --json
```

## Simulator (Pre-Merge Risk)

```bash
neurcode simulate
neurcode simulate --staged
neurcode simulate --base origin/main --json
neurcode simulate --max-impacted 80 --depth 4
```

## Policy Packs

```bash
neurcode policy list
neurcode policy status
neurcode policy install fintech
neurcode policy bootstrap node
neurcode policy bootstrap frontend --intent "No client-side secret leakage"
neurcode policy install soc2 --force
neurcode policy uninstall
```

## Verification Feedback (FP/FN Loop)

```bash
neurcode feedback submit <verification-id> --type false_positive --reason "Expected migration exception" --rule no_console_log --file src/migrate.ts
neurcode feedback list <verification-id> --status pending
neurcode feedback inbox --status pending --org-wide
neurcode feedback stats --org-wide --days 30 --limit 10
neurcode feedback review <verification-id> <feedback-id> --decision approved --note "Confirmed false positive"
```

## Compliance Evidence Export

```bash
neurcode audit evidence
neurcode audit evidence --no-include-events --limit 5000
neurcode audit evidence --action verification.completed --from 2026-04-01T00:00:00.000Z --to 2026-04-30T23:59:59.999Z
neurcode audit evidence --out .neurcode/evidence/april.json
neurcode audit evidence --json
```

## Brain (Context/Memory)

```bash
neurcode brain status
neurcode brain mode --storage-mode no-code
neurcode brain doctor "is userid used instead of org id in cli workflow"
neurcode brain graph "who touched auth last quarter" --days 120
neurcode brain export --format md
neurcode brain clear --scope project --yes
```

## Session and Revert

```bash
neurcode watch
neurcode repo link ../backend --alias backend
neurcode repo list
neurcode repo unlink backend
neurcode session list
neurcode session status --session-id <session-id>
neurcode session end --session-id <session-id>
neurcode revert versions src/file.ts --limit 20
neurcode revert src/file.ts --to-version 3 --backup
```

## Analysis and Mapping

```bash
neurcode check --staged
neurcode map
neurcode plan-slo status --json
neurcode doctor
```

## High-Value Flags

- `plan`: `--ticket`, `--issue`, `--pr`, `--force-plan`, `--no-cache`
- `ask`: `--json`, `--verbose`, `--max-citations`, `--no-cache`
- `ask`: `--proof` (concise answer + evidence digest)
- `simulate`: `--staged`, `--head`, `--base`, `--max-impacted`, `--depth`, `--json`
- `audit evidence`: `--include-events`, `--limit`, `--action`, `--actor-user-id`, `--target-type`, `--from`, `--to`, `--out`, `--json`
- `verify`: `--plan-id`, `--policy-only`, `--staged`, `--base`, `--record`, `--json`
- `verify`: `--compiled-policy`, `--change-contract`, `--enforce-change-contract`, `--require-runtime-guard`, `--runtime-guard`, `--async`, `--verify-job-poll-ms`, `--verify-job-timeout-ms`, `--verify-idempotency-key`, `--verify-job-max-attempts`
- `ship`: `--max-fix-attempts`, `--test-command`, `--skip-tests`, `--allow-dirty`, `--json`
- `repo link`: `--alias`, `--json`
- `policy install`: `--force` (replace existing installed pack)
- `policy compile`: `--require-deterministic-match` (fail if intent text cannot be deterministically enforced)
- `feedback inbox`: `--status`, `--mine`, `--org-wide`, `--limit`, `--json`
- `feedback stats`: `--status`, `--days`, `--limit`, `--mine`, `--org-wide`, `--json`
- `brain mode`: `--storage-mode full|no-code`

## Command Discovery

```bash
neurcode --help
neurcode <command> --help
```

## Private Repo Guardrails (Workspace Scripts)

```bash
pnpm guardrails:install-hooks
pnpm guardrails:check-hooks
pnpm ci:main-push-policy
```

If command behavior in this file ever diverges from runtime behavior, treat runtime (`packages/cli/src/index.ts`) as source of truth and update this document.
