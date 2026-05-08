import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const packageJsonPath = path.join(repoRoot, 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

const portChecks = [
  {
    label: 'Astro dev port 4321',
    port: 4321,
    suggestion:
      'Stop the existing dev server on port 4321 or run Astro with a different port.',
  },
  {
    label: 'Preview port 8080',
    port: 8080,
    suggestion:
      'Stop the existing preview server on port 8080 or use a different preview port.',
  },
];

function resolveCommand(command) {
  if (process.platform === 'win32' && command === 'npm') {
    return 'npm.cmd';
  }

  return command;
}

function runCommand(command, args) {
  try {
    return {
      ok: true,
      stdout: execFileSync(resolveCommand(command), args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (error) {
    return {
      error,
      ok: false,
      stdout: '',
    };
  }
}

function parseRequiredNodeVersion() {
  const engine = packageJson?.engines?.node;
  const match =
    typeof engine === 'string'
      ? engine.match(/^>=\s*(\d+)\.(\d+)\.(\d+)$/)
      : null;

  if (!match) {
    return null;
  }

  return match.slice(1).map((segment) => Number.parseInt(segment, 10));
}

function parseVersion(version) {
  return version
    .replace(/^v/, '')
    .split('.')
    .map((segment) => Number.parseInt(segment, 10));
}

function compareVersions(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;

    if (leftValue > rightValue) {
      return 1;
    }

    if (leftValue < rightValue) {
      return -1;
    }
  }

  return 0;
}

function parseEnvFile(filePath) {
  const pairs = new Map();
  const content = readFileSync(filePath, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key) {
      pairs.set(key, value);
    }
  }

  return pairs;
}

function formatStatus(status) {
  switch (status) {
    case 'pass':
      return 'PASS';
    case 'warn':
      return 'WARN';
    case 'fail':
      return 'FAIL';
    default:
      return 'SKIP';
  }
}

async function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (error) => {
      if (error && typeof error === 'object' && 'code' in error) {
        resolve(error.code !== 'EADDRINUSE');
        return;
      }

      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => resolve(true));
    });

    server.listen(port, '127.0.0.1');
  });
}

function printCheck({ details = [], label, status, summary, suggestion }) {
  console.log(`${formatStatus(status)} ${label}`);
  console.log(`  ${summary}`);

  for (const detail of details) {
    console.log(`  ${detail}`);
  }

  if (suggestion) {
    console.log(`  Fix: ${suggestion}`);
  }

  console.log('');
}

async function main() {
  const checks = [];
  const requiredNodeVersion = parseRequiredNodeVersion();

  if (requiredNodeVersion) {
    const currentNodeVersion = parseVersion(process.versions.node);
    const satisfiesNode =
      compareVersions(currentNodeVersion, requiredNodeVersion) >= 0;

    checks.push({
      label: 'Node.js version',
      status: satisfiesNode ? 'pass' : 'fail',
      summary: satisfiesNode
        ? `Running Node.js ${process.versions.node}; package.json requires >= ${requiredNodeVersion.join('.')}.`
        : `Running Node.js ${process.versions.node}; package.json requires >= ${requiredNodeVersion.join('.')}.`,
      suggestion: satisfiesNode
        ? undefined
        : `Switch to Node.js ${requiredNodeVersion.join('.')} or newer before running the docs workflow.`,
    });
  }

  const npmVersionFromEnvironment =
    typeof process.env.npm_config_user_agent === 'string'
      ? (process.env.npm_config_user_agent.match(/npm\/(\S+)/)?.[1] ?? null)
      : null;
  const npmVersion = npmVersionFromEnvironment
    ? { ok: true, stdout: npmVersionFromEnvironment }
    : runCommand('npm', ['--version']);
  checks.push({
    label: 'npm availability',
    status: npmVersion.ok ? 'pass' : 'fail',
    summary: npmVersion.ok
      ? `npm ${npmVersion.stdout} is available.`
      : 'npm is not available on PATH.',
    suggestion: npmVersion.ok
      ? undefined
      : 'Install npm alongside the required Node.js version.',
  });

  const rustcVersion = runCommand('rustc', ['--version']);
  checks.push({
    label: 'Rust compiler',
    status: rustcVersion.ok ? 'pass' : 'fail',
    summary: rustcVersion.ok
      ? `${rustcVersion.stdout} is available.`
      : 'rustc is not available on PATH.',
    suggestion: rustcVersion.ok
      ? undefined
      : 'Install the Rust stable toolchain before building generated API docs.',
  });

  const cargoVersion = runCommand('cargo', ['--version']);
  checks.push({
    label: 'Cargo',
    status: cargoVersion.ok ? 'pass' : 'fail',
    summary: cargoVersion.ok
      ? `${cargoVersion.stdout} is available.`
      : 'cargo is not available on PATH.',
    suggestion: cargoVersion.ok
      ? undefined
      : 'Install Cargo via the Rust toolchain before running build:api or build.',
  });

  const siblingWorkspacePath = path.resolve(repoRoot, '../use-math');
  checks.push({
    label: 'Local use-math workspace',
    status: existsSync(siblingWorkspacePath) ? 'pass' : 'warn',
    summary: existsSync(siblingWorkspacePath)
      ? `Found local sibling workspace at ${siblingWorkspacePath}.`
      : 'Local sibling workspace is missing; build:api will fall back to cloning GitHub.',
    suggestion: existsSync(siblingWorkspacePath)
      ? undefined
      : 'Clone the sibling ../use-math workspace if you want faster local Rustdoc rebuilds and local source edits.',
  });

  for (const portCheck of portChecks) {
    const available = await isPortAvailable(portCheck.port);
    checks.push({
      label: portCheck.label,
      status: available ? 'pass' : 'warn',
      summary: available
        ? `Port ${portCheck.port} is available.`
        : `Port ${portCheck.port} is already in use.`,
      suggestion: available ? undefined : portCheck.suggestion,
    });
  }

  const dockerConfigFiles = [
    'Dockerfile',
    'docker-compose.yml',
    'docker-compose.yaml',
    'compose.yml',
    'compose.yaml',
  ].filter((fileName) => existsSync(path.join(repoRoot, fileName)));

  if (dockerConfigFiles.length === 0) {
    checks.push({
      label: 'Docker availability',
      status: 'skip',
      summary:
        'No Docker or Compose files are defined in this repo, so Docker checks are skipped.',
    });
  } else {
    const dockerVersion = runCommand('docker', ['--version']);
    checks.push({
      label: 'Docker availability',
      status: dockerVersion.ok ? 'pass' : 'warn',
      summary: dockerVersion.ok
        ? `${dockerVersion.stdout} is available.`
        : `Docker config files exist (${dockerConfigFiles.join(', ')}), but docker is not available on PATH.`,
      suggestion: dockerVersion.ok
        ? undefined
        : 'Install Docker Desktop or remove the Docker-dependent workflow from this repo.',
    });
  }

  const envTemplatePaths = [
    '.env.example',
    '.env.local.example',
    '.env.shared-db.example',
    '.env.ollama.example',
  ]
    .map((fileName) => path.join(repoRoot, fileName))
    .filter((filePath) => existsSync(filePath));

  if (envTemplatePaths.length === 0) {
    checks.push({
      label: '.env completeness',
      status: 'skip',
      summary:
        'This repo does not define an .env template, so environment completeness checks are skipped.',
    });
    checks.push({
      label: 'Database reachability',
      status: 'skip',
      summary:
        'No database configuration was found in this repo, so DB reachability checks are skipped.',
    });
  } else {
    const templateEntries = new Set();
    for (const envTemplatePath of envTemplatePaths) {
      for (const key of parseEnvFile(envTemplatePath).keys()) {
        templateEntries.add(key);
      }
    }

    const envPath = path.join(repoRoot, '.env');
    const currentEnv = existsSync(envPath) ? parseEnvFile(envPath) : new Map();
    const missingKeys = [...templateEntries].filter(
      (key) => !currentEnv.has(key),
    );

    checks.push({
      label: '.env completeness',
      status: missingKeys.length === 0 ? 'pass' : 'warn',
      summary:
        missingKeys.length === 0
          ? 'The current .env file covers all keys from the repo templates.'
          : `The current .env file is missing ${missingKeys.length} key(s) from the repo templates.`,
      details:
        missingKeys.length === 0
          ? []
          : [`Missing keys: ${missingKeys.join(', ')}`],
      suggestion:
        missingKeys.length === 0
          ? undefined
          : 'Copy the missing keys from the repo .env template into .env before starting local services.',
    });

    const dbUrl =
      currentEnv.get('DATABASE_URL') ?? currentEnv.get('POSTGRES_URL') ?? null;
    checks.push({
      label: 'Database reachability',
      status: dbUrl ? 'warn' : 'skip',
      summary: dbUrl
        ? 'A database URL was found, but this repo has no built-in DB probe yet.'
        : 'No database URL was found in .env, so DB reachability checks are skipped.',
      suggestion: dbUrl
        ? 'Add a repo-specific DB probe only if this docs workspace gains a real database dependency.'
        : undefined,
    });
  }

  console.log('RustUse docs dev doctor\n');

  for (const check of checks) {
    printCheck(check);
  }

  const counts = {
    fail: checks.filter((check) => check.status === 'fail').length,
    pass: checks.filter((check) => check.status === 'pass').length,
    skip: checks.filter((check) => check.status === 'skip').length,
    warn: checks.filter((check) => check.status === 'warn').length,
  };

  console.log(
    `Summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.fail} fail, ${counts.skip} skip.`,
  );

  if (counts.fail > 0) {
    process.exit(1);
  }
}

await main();
