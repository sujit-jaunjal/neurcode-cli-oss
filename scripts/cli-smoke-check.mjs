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
  const requiredCommands = [
    'check [options]',
    'plan [options] <intent...>',
    'prompt [options] [plan-id]',
    'verify [options]',
    'policy',
    'contract',
    'ship [options] <goal...>',
  ];
  for (const command of requiredCommands) {
    assertContains(rootHelp, command, 'root help output');
  }

  const verifyHelp = runCli(['verify', '--help']);
  const requiredVerifyFlags = [
    '--policy-only',
    '--compiled-policy <path>',
    '--enforce-change-contract',
    '--require-runtime-guard',
  ];
  for (const flag of requiredVerifyFlags) {
    assertContains(verifyHelp, flag, 'verify help output');
  }

  const policyList = runCli(['policy', 'list']);
  for (const pack of ['fintech', 'hipaa', 'soc2', 'startup-fast', 'node', 'python', 'java', 'frontend']) {
    assertContains(policyList.toLowerCase(), pack, 'policy list output');
  }

  const tmpRoot = mkdtempSync(join(os.tmpdir(), 'neurcode-cli-smoke-'));
  try {
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
  }
  finally {
    rmSync(tmpRoot, { recursive: true, force: true });
  }

  console.log('✅ CLI smoke check passed: command surface and local auto-detect behavior validated.');
}

try {
  run();
}
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`❌ CLI smoke check failed: ${message}`);
  process.exit(1);
}
