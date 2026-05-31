import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const apiRoot = path.join(repoRoot, 'public', 'api');
const rustdocSourcesPath = path.join(repoRoot, 'docs', 'rustdoc-sources.json');
const rustdocShellCssPath = path.join(apiRoot, 'rustuse-rustdoc-shell.css');

function run(command, args) {
  try {
    execFileSync(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch (error) {
    if (typeof error.status === 'number') {
      process.exit(error.status);
    }

    console.error(error.message);
    process.exit(1);
  }
}

function runNpm(args) {
  if (process.env.npm_execpath) {
    run(process.execPath, [process.env.npm_execpath, ...args]);
    return;
  }

  if (process.platform === 'win32') {
    run(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', 'npm', ...args]);
    return;
  }

  run('npm', args);
}

function normalizeApiSlug(value) {
  return value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function routeIndexPath(route) {
  return path.join(
    apiRoot,
    ...normalizeApiSlug(route).split('/'),
    'index.html',
  );
}

function relativePath(filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/');
}

function readRustdocSources() {
  return JSON.parse(readFileSync(rustdocSourcesPath, 'utf8')).sources ?? [];
}

function missingApiOutputs() {
  const missing = [];

  if (!existsSync(rustdocShellCssPath)) {
    missing.push(relativePath(rustdocShellCssPath));
  }

  for (const source of readRustdocSources()) {
    if (!source || typeof source !== 'object') {
      continue;
    }

    const sourceName =
      typeof source.name === 'string' && source.name.length > 0
        ? source.name
        : null;
    const bundleSlug =
      typeof source.bundleSlug === 'string' && source.bundleSlug.length > 0
        ? source.bundleSlug
        : sourceName;

    if (!bundleSlug) {
      continue;
    }

    const workspaceIndexPath = routeIndexPath(bundleSlug);
    if (!existsSync(workspaceIndexPath)) {
      missing.push(relativePath(workspaceIndexPath));
    }

    if (!Array.isArray(source.publishedCrates)) {
      continue;
    }

    for (const crateName of source.publishedCrates) {
      if (typeof crateName !== 'string' || crateName.length === 0) {
        continue;
      }

      const crateIndexPath = routeIndexPath(crateName);
      if (!existsSync(crateIndexPath)) {
        missing.push(relativePath(crateIndexPath));
      }
    }
  }

  return missing;
}

const astroArgs = [];
let rebuildApi = process.env.RUSTUSE_REBUILD_API === '1';

for (const arg of process.argv.slice(2)) {
  if (arg === '--fresh' || arg === '--rebuild-api') {
    rebuildApi = true;
    continue;
  }

  astroArgs.push(arg);
}

const missing = missingApiOutputs();

if (rebuildApi) {
  console.log('Rebuilding generated API docs before starting Astro dev.');
  runNpm(['run', 'build:api']);
} else if (missing.length > 0) {
  const sample = missing.slice(0, 3).join(', ');
  const suffix = missing.length > 3 ? `, and ${missing.length - 3} more` : '';
  console.log(
    `Generated API docs are missing (${sample}${suffix}). Building them once before starting Astro dev.`,
  );
  runNpm(['run', 'build:api']);
} else {
  console.log(
    'Using existing generated API docs in public/api. Run `npm run dev:fresh` to rebuild them.',
  );
}

runNpm(['run', 'astro', '--', 'dev', ...astroArgs]);
