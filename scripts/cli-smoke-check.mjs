#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const cliPath = join(repoRoot, 'packages/cli/dist/index.js');

function runCli(args, options = {}) {
  const cwd = options.cwd || repoRoot;
  return execFileSync('node', [cliPath, ...args], {
    cwd,
    encoding: 'utf-8',
    env: {
      ...process.env,
      FORCE_COLOR: '0',
      // Avoid inheriting a maintainer API key during smoke checks.
      NEURCODE_API_KEY: options.apiKey || 'invalid',
    },
  });
}

function assertContains(haystack, needle, context) {
  if (!haystack.includes(needle)) {
    throw new Error(`Missing expected text in ${context}: ${needle}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run() {
  const rootHelp = runCli(['--help']);
  // Root help lists first-run runtime commands in Commander form and older
  // compatibility commands as curated bullets (`* neurcode <cmd>`). Match the
  // current public surface, not retired verify-first flows.
  const requiredCommands = [
    'activate [options] [agent]',
    'agent',
    'run [options] [agent]',
    'runtime',
    'sync [options]',
    'admission',
    'demo',
    'start [options] [intent...]',
    'replay [options]',
    'eval',
  ];
  for (const command of requiredCommands) {
    assertContains(rootHelp, command, 'root help output');
  }

  for (const command of ['generate', 'fix', 'patch', 'export', 'daemon']) {
    const compatibilityHelp = runCli([command, '--help']);
    assertContains(compatibilityHelp, `Usage: neurcode ${command}`, `${command} compatibility help output`);
  }

  const agentHelp = runCli(['agent', '--help']);
  const requiredAgentCommands = [
    'bootstrap [options] [agent]',
    'walkthrough [options] [agent]',
    'start [options] [agent]',
    'check [options] <filePath>',
    'approve [options] <path>',
    'guard',
  ];
  for (const command of requiredAgentCommands) {
    assertContains(agentHelp, command, 'agent help output');
  }

  const runtimeHelp = runCli(['runtime', '--help']);
  for (const command of ['cloud-status [options]', 'reset-stale-cloud [options]']) {
    assertContains(runtimeHelp, command, 'runtime help output');
  }

  const admissionHelp = runCli(['admission', '--help']);
  for (const command of ['export [options] [sessionId]', 'latest [options]']) {
    assertContains(admissionHelp, command, 'admission help output');
  }

  const verifyHelp = runCli(['verify', '--help']);
  const requiredVerifyFlags = [
    '--ci',
    '--policy-only',
    '--compiled-policy <path>',
    '--enforce-change-contract',
    '--require-runtime-guard',
  ];
  for (const flag of requiredVerifyFlags) {
    assertContains(verifyHelp, flag, 'verify compatibility help output');
  }

  const policyList = runCli(['policy', 'list']);
  for (const pack of ['fintech', 'hipaa', 'soc2', 'startup-fast', 'node', 'python', 'java', 'frontend']) {
    assertContains(policyList.toLowerCase(), pack, 'policy list output');
  }

  const tmpRoot = mkdtempSync(join(os.tmpdir(), 'neurcode-cli-smoke-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: tmpRoot, encoding: 'utf-8' });

    const walkthroughRaw = runCli(['agent', 'walkthrough', 'codex', '--json'], { cwd: tmpRoot });
    const walkthrough = JSON.parse(walkthroughRaw);
    assert(
      walkthrough.dashboardPairing?.status === 'local_only' || walkthrough.dashboardPairing?.status === 'connected',
      'agent walkthrough should report dashboard pairing status',
    );
    assert(
      Array.isArray(walkthrough.steps) && walkthrough.steps.some((step) => step.id === 'connect'),
      'agent walkthrough should include the repo connect step',
    );
    assert(
      Array.isArray(walkthrough.acceptance) && walkthrough.acceptance.length > 0,
      'agent walkthrough should include acceptance criteria',
    );

    mkdirSync(join(tmpRoot, '.codex/plans'), { recursive: true });
    writeFileSync(
      join(tmpRoot, '.codex/plans/sample-plan.md'),
      '# Sample Plan\\n1. Update auth middleware\\n2. Add test coverage\\n',
      'utf-8',
    );

    const candidateListRaw = runCli(
      ['contract', 'import', '--provider', 'codex', '--auto-detect', '--list-candidates', '--json'],
      { cwd: tmpRoot },
    );
    const candidateList = JSON.parse(candidateListRaw);
    assert(candidateList.success === true, 'contract auto-detect candidate listing must succeed');
    assert(candidateList.provider === 'codex', 'contract auto-detect provider should be codex');
    assert(candidateList.candidateCount >= 1, 'contract auto-detect should find at least one plan file');
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log('✅ CLI smoke check passed: runtime command surface, walkthrough, and local auto-detect behavior validated.');
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ CLI smoke check failed: ${message}`);
  process.exit(1);
}
