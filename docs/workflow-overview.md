# Workflow Overview

Neurcode CLI supports two primary workflows.

## A) Policy-Only Governance (local-first)

Use this when you want deterministic policy checks without depending on remote plan APIs.

```bash
neurcode policy install soc2
neurcode policy lock --no-dashboard
neurcode policy compile --no-dashboard --intent "Do not use console.log; Do not use TODO"
neurcode verify --policy-only
```

Recommended for:

- workshops/cohorts
- offline demos
- contributor onboarding

## B) Plan-Enforced Delivery (cloud-assisted)

Use this for full plan adherence + governance workflows.

```bash
neurcode login
neurcode init
neurcode plan "Describe intended change"
neurcode prompt
neurcode verify --record --enforce-change-contract --compiled-policy neurcode.policy.compiled.json
neurcode ship "Deliver scoped change" --max-fix-attempts 2
```

Recommended for:

- production delivery workflows
- tracked ticket/PR execution
- adherence and evidence reporting

## C) Imported plan workflow (Codex/Claude/Cursor/ChatGPT)

```bash
neurcode contract import --provider codex --auto-detect --list-candidates
neurcode contract import --provider codex --auto-detect --no-confirm
neurcode verify --record --enforce-change-contract
```

## Notes for maintainers

- Use `policy lock --no-dashboard` for OSS reproducibility when contributors may not be logged in.
- Use `--require-deterministic-match` only when policy intent statements are compatible with deterministic templates.
- Run `pnpm ci:oss` before merging OSS changes.

