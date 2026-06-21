# 15-Minute Enterprise Evaluation

> Start with the [canonical zero-friction quickstart](./quickstart-zero-friction.md).
> This page is the extended evaluator checklist, not a second installation path.

This is the fastest honest way to decide whether Neurcode is worth a pilot. In
under 15 minutes, with **no founder on the call, no cloud account, and no
GitHub Actions**, you will:

- run the complete governance loop on a safe throwaway fixture
- observe a protected-boundary **BLOCK** and exact-path approval in the safe fixture (the neighbor stays blocked); only the Claude Code hook path claims a host-level hard pre-write deny
- export a **source-free AI Change Record** and confirm a leak scan finds no source
- read an honest readiness verdict (founder demo / design-partner pilot / serious enterprise pilot)
- optionally connect a repo to the dashboard for live visibility

Neurcode is **AI change accountability for engineering teams**: agents can move
fast, but sensitive boundaries, exact approvals, repo impact, and source-free
evidence stay accountable from local runtime to PR and dashboard. It is *not* an
"AI file blocker" — read [What Neurcode Proves (and Does Not Prove)](./what-neurcode-proves.md)
before you score anything.

---

## Prerequisites

- **Node.js ≥ 20** (required). On Node 18 you will see `EBADENGINE` warnings; upgrade before evaluating.
- A terminal. A git repository is only needed for the *real-repo* step — the fixture demo scaffolds its own.
- No account, no API key, no network egress of source. The fixture demo is fully local.

Check your version first:

```bash
node -v   # must be v20+
npx -y @neurcode-ai/cli@latest --version
```

If `node -v` is below 20, install Node 20 (e.g. `nvm install 20 && nvm use 20`)
before continuing.

---

## Step 1 — Run the whole evaluation in one command

```bash
npx -y @neurcode-ai/cli@latest eval demo --fixture --agent codex
#   --agent  claude | codex | cursor | vscode | copilot
```

This scaffolds a throwaway fixture (with a `CODEOWNERS` boundary), starts a
governed session, and drives the full loop. It **never touches your source** and
uploads nothing. Expected output ends like this:

```
Enterprise Self-Serve Evaluation — demo complete
  agent codex · Cooperative guard + source-free supervisor evidence

  ✓ Fixture scaffolded
  ✓ Governed session live
  ✓ Safe edit allowed
  ✓ Protected boundary blocked — Blocked src/billing/charge.py (boundary)
  ✓ Exact-path approval — Approved src/billing/charge.py (exact-only: yes, 1 path)
  ✓ Approved path allowed
  ✓ Neighbor containment — Neighbor src/billing/refund.py stayed blocked
  ✓ AI Change Record exported — .neurcode-admission/<id>.json (2 blocked, 1 approved)
  – Backend receipt verified — No signing key configured (self-attested local record, honest default)
  ✓ Source-free scan — Clean across report, summary, and guided artifacts

  Core governance loop held (9/12 checkpoints).

  Readiness:
    Founder demo: ready
    Design-partner pilot: ready_with_caveats
    Serious enterprise pilot: not_ready
```

The two `~`/`–` checkpoints (repo-brain depth on a 4-file fixture, and backend
receipt signing) are **honest, expected** on a local fixture with no signing key
— they are not failures. On a real repo with a configured signing key they
upgrade.

Artifacts are written under `.neurcode/eval/` (gitignored, source-free):

- `enterprise-eval-report.md` — the human-readable evaluation report
- `eval-demo-summary.json` — the machine summary you can paste into the dashboard

---

## Step 2 — Choose your agent

Re-run with the agent your team actually uses. The enforcement label changes
honestly per agent — Neurcode never overclaims:

| Agent | What the demo shows | Enforcement label |
|---|---|---|
| `claude` | Hooks **hard-deny** the protected write before it lands | Hard pre-write deny |
| `codex` / `cursor` | Cooperative `edit.before` check + local guard supervisor + source-free evidence | Supervised / evidence |
| `vscode` / `copilot` | Companion / Copilot-hook path; sessions become reviewable evidence | Supervised / evidence |

```bash
npx -y @neurcode-ai/cli@latest eval demo --fixture --agent claude
```

---

## Step 3 — Stuck on install? Run the preflight

```bash
npx -y @neurcode-ai/cli@latest eval doctor --agent codex
```

`eval doctor` is a buyer-friendly preflight: Node, npm, CLI, repo, fixture, and
trust posture, each with a one-line recovery step. It exits non-zero only when
something would actually block the demo.

---

## Step 4 — See it in the dashboard (optional, local-only is fine)

Neurcode runs in two honest modes:

- **Local-only** — everything above works with zero account. The evaluation
  report and summary live on your machine. This is enough to score the product.
- **Dashboard-connected** — for shared visibility (timeline, approvals, evidence),
  connect a workspace.

To render your local result without connecting anything, open the dashboard
**Enterprise Evaluation** page and **paste/upload `.neurcode/eval/eval-demo-summary.json`**.
The page renders the same checkpoints, trust posture, and verdict — no source,
no live bridge required.

To get **live** visibility (the session, the block, the exact-path approval as
they happen), pair a repo:

```bash
npx -y @neurcode-ai/cli@latest activate claude --connect <token>   # generated by Runtime Control Plane -> Connect repo
```

The dashboard clearly labels whether you are in local-only or connected mode and
never presents a dead bridge as if it were live.

---

## Step 5 — Run it on your real repository (read-only)

The fixture proves the mechanics. To see the *shape of your own repo's*
boundaries, owners, and reviewer questions — without ever editing your source —
run the guided evaluation in real mode:

```bash
cd your-repository
npx -y @neurcode-ai/cli@latest eval start --agent codex     # read-only; never edits your source
npx -y @neurcode-ai/cli@latest eval status                  # progress + per-step facts
npx -y @neurcode-ai/cli@latest eval next                    # exactly the next command to run
npx -y @neurcode-ai/cli@latest eval export                  # source-free shareable report
```

`eval export` writes a report containing **paths, owners, symbol names, hashes,
verdicts, and tiers only — no source**. It is safe to share with security or
attach to a pilot decision.

---

## What is deterministic, and what is advisory

Score Neurcode against what it actually claims. The short version:

- **Deterministic** — path/boundary rules, CODEOWNERS/static ownership routing,
  exact-path approvals, source-free hashes and receipts, static import/fan-in
  facts, compiled rule checks.
- **Advisory** — natural-language policy interpretation, duplicate/reuse
  similarity, reviewer questions, semantic correctness, architecture guidance.

Neurcode does not claim false-positive-free results, does not claim your source
code is deployment-safe, and uses backend HMAC receipts when custody is
configured.
The full, testable breakdown is in
[What Neurcode Proves (and Does Not Prove)](./what-neurcode-proves.md).

---

## Troubleshooting & next steps

- [What Neurcode Proves (and Does Not Prove)](./what-neurcode-proves.md) — the trust/determinism/limits page
- [Enterprise Evaluation troubleshooting](./enterprise-eval-troubleshooting.md)
- [Zero-friction quickstart](./quickstart-zero-friction.md) — the one-screen version of this page
- [Guarantees and limits (deep, testable)](./guarantees-and-limits.md)

> Compatibility note: the older `neurcode verify` / `plan` / `ship` /
> `remediation-export` commands from the pre-runtime era remain callable for
> existing CI, but the runtime evaluation above is the current product surface.
> Lead a first-time evaluator with `eval demo`, not with the legacy verify path.
