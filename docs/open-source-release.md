# Open-Source Release Runbook

This runbook prepares safe public exports from the private monorepo:

- CLI OSS repository (`sujit-jaunjal/neurcode-cli-oss`)
- GitHub Action OSS repository (`sujit-jaunjal/neurcode-actions`)

For component ownership and public/private boundaries, see:
- [docs/architecture/oss-architecture.md](./architecture/oss-architecture.md)

## 1) Pre-release security checks

Run from repo root:

```bash
pnpm oss:check
pnpm license:check
```

If it fails, remove tracked local/sensitive artifacts first.

## 2) Build and verify

```bash
pnpm build:cli
pnpm --filter @neurcode/action build
pnpm test:contracts
```

## 3) Create sanitized exports

```bash
pnpm oss:export -- --force
pnpm oss:export:action -- --force
pnpm oss:check:export:cli
pnpm oss:check:export:action
```

Default outputs:

`out/neurcode-cli-oss`
`out/neurcode-actions`

## 4) Publish as separate public repos

```bash
cd out/neurcode-cli-oss
git init
git add .
git commit -m "chore: initial oss export"
git branch -M main
git remote add origin <new-public-repo-url>
git push -u origin main
```

```bash
cd out/neurcode-actions
git init
git add .
git commit -m "chore: initial actions export"
git branch -M main
git remote add origin <new-public-actions-repo-url>
git push -u origin main
```

## 5) Required credential hygiene

If secrets were previously committed:

1. rotate/revoke credentials first,
2. purge sensitive commits from public history if needed (`git filter-repo` or BFG),
3. force-push rewritten history only with team coordination.

## 6) Recommended public branch gate

Require this check in CI for OSS branches:

```bash
pnpm oss:check
pnpm license:check
```

## 7) Automated sync (recommended)

Configure these repository secrets in the private monorepo:

- `NEURCODE_OSS_SYNC_TOKEN` (write access to `neurcode-cli-oss`)
- `NEURCODE_ACTIONS_SYNC_TOKEN` (write access to `neurcode-actions`)

Optional repository variables:

- `NEURCODE_OSS_TARGET_REPO`
- `NEURCODE_ACTIONS_TARGET_REPO`

Workflows:

- `.github/workflows/oss-cli-sync.yml`
- `.github/workflows/oss-actions-sync.yml`

## 8) SBOM + provenance (recommended)

Use the hosted workflow:

- `.github/workflows/oss-release-hardening.yml`

It produces:

- sanitized OSS export archive (`out/neurcode-cli-oss-<sha>.tgz`)
- SPDX SBOM (`out/neurcode-cli-oss.sbom.spdx.json`)
- GitHub provenance attestation for both artifacts
