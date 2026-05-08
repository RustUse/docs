import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const stagedOnly = process.argv.includes('--staged');
const ignoredPrefixes = [
  '.astro/',
  '.cache/',
  'dist/',
  'node_modules/',
  'public/api/',
];

const prettierExtensions = new Set([
  '.astro',
  '.css',
  '.cjs',
  '.cts',
  '.js',
  '.json',
  '.md',
  '.mdx',
  '.mjs',
  '.mts',
  '.ts',
  '.yaml',
  '.yml',
]);
const eslintExtensions = new Set([
  '.astro',
  '.cjs',
  '.cts',
  '.js',
  '.mjs',
  '.mts',
  '.ts',
]);
const stylelintExtensions = new Set(['.astro', '.css']);

function resolveCommand(command) {
  if (process.platform === 'win32' && command === 'git') {
    return 'git.exe';
  }

  return command;
}

function runCommand(command, args, options = {}) {
  return execFileSync(resolveCommand(command), args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    ...options,
  }).trim();
}

function hasHeadCommit() {
  try {
    runCommand('git', ['rev-parse', '--verify', 'HEAD']);
    return true;
  } catch {
    return false;
  }
}

function getGitPaths(args) {
  try {
    const output = runCommand('git', ['-c', 'core.safecrlf=false', ...args]);
    return output ? output.split(/\r?\n/).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function isIgnored(filePath) {
  return ignoredPrefixes.some((prefix) => filePath.startsWith(prefix));
}

function collectChangedFiles() {
  const relativePaths = new Set();

  if (stagedOnly) {
    for (const filePath of getGitPaths([
      'diff',
      '--cached',
      '--name-only',
      '--diff-filter=ACMRTUXB',
      '--relative',
    ])) {
      relativePaths.add(normalizePath(filePath));
    }

    return [...relativePaths].filter((filePath) => !isIgnored(filePath));
  }

  if (hasHeadCommit()) {
    for (const filePath of getGitPaths([
      'diff',
      'HEAD',
      '--name-only',
      '--diff-filter=ACMRTUXB',
      '--relative',
    ])) {
      relativePaths.add(normalizePath(filePath));
    }
  } else {
    for (const filePath of getGitPaths([
      'diff',
      '--name-only',
      '--diff-filter=ACMRTUXB',
      '--relative',
    ])) {
      relativePaths.add(normalizePath(filePath));
    }
  }

  for (const filePath of getGitPaths([
    'ls-files',
    '--others',
    '--exclude-standard',
  ])) {
    relativePaths.add(normalizePath(filePath));
  }

  return [...relativePaths].filter((filePath) => !isIgnored(filePath));
}

function localBinary(binaryName) {
  const extension = process.platform === 'win32' ? '.cmd' : '';
  return path.join(
    repoRoot,
    'node_modules',
    '.bin',
    `${binaryName}${extension}`,
  );
}

function runLocalBinary(binaryName, args) {
  const nodeEntrypoints = {
    eslint: path.join(repoRoot, 'node_modules', 'eslint', 'bin', 'eslint.js'),
    prettier: path.join(
      repoRoot,
      'node_modules',
      'prettier',
      'bin',
      'prettier.cjs',
    ),
    stylelint: path.join(
      repoRoot,
      'node_modules',
      'stylelint',
      'bin',
      'stylelint.mjs',
    ),
  };

  const nodeEntrypoint = nodeEntrypoints[binaryName];
  if (nodeEntrypoint) {
    execFileSync(process.execPath, [nodeEntrypoint, ...args], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    return;
  }

  const binaryPath = localBinary(binaryName);
  const command = existsSync(binaryPath)
    ? binaryPath
    : resolveCommand(binaryName);

  execFileSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function filterByExtension(filePaths, allowedExtensions) {
  return filePaths.filter((filePath) =>
    allowedExtensions.has(path.extname(filePath)),
  );
}

function printStep(message) {
  console.log(message);
}

function runIfNeeded(label, filePaths, runner) {
  if (filePaths.length === 0) {
    printStep(`${label}: skipped (no matching changed files)`);
    return;
  }

  printStep(`${label}: ${filePaths.length} file(s)`);
  runner(filePaths);
}

const changedFiles = collectChangedFiles();

if (changedFiles.length === 0) {
  console.log('No changed authored files to verify.');
  process.exit(0);
}

console.log(
  `${stagedOnly ? 'Staged' : 'Changed'} authored files: ${changedFiles.length}`,
);

const prettierFiles = filterByExtension(changedFiles, prettierExtensions);
const eslintFiles = filterByExtension(changedFiles, eslintExtensions);
const stylelintFiles = filterByExtension(changedFiles, stylelintExtensions);

runIfNeeded('Prettier', prettierFiles, (filePaths) => {
  runLocalBinary('prettier', ['--check', ...filePaths]);
});

runIfNeeded('ESLint', eslintFiles, (filePaths) => {
  runLocalBinary('eslint', [
    '--cache',
    '--cache-location',
    './.cache/eslint/.eslintcache',
    ...filePaths,
  ]);
});

runIfNeeded('Stylelint', stylelintFiles, (filePaths) => {
  runLocalBinary('stylelint', filePaths);
});

console.log('Changed-file verification passed.');
