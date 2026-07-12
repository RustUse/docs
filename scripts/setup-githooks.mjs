import { execFileSync } from 'node:child_process';
import process from 'node:process';

const repoRoot = process.cwd();

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function isGitWorktree() {
  try {
    return runGit(['rev-parse', '--is-inside-work-tree']) === 'true';
  } catch {
    return false;
  }
}

if (!isGitWorktree()) {
  console.log(
    'Skipping git hook setup because this directory is not an active git worktree.',
  );
  process.exit(0);
}

try {
  const currentHooksPath = runGit([
    'config',
    '--local',
    '--get',
    'core.hooksPath',
  ]);

  if (currentHooksPath === '.githooks') {
    console.log('Git hooks are already configured.');
    process.exit(0);
  }
} catch {
  // A missing core.hooksPath value is expected before initial setup.
}

try {
  runGit(['config', '--local', 'core.hooksPath', '.githooks']);
  console.log('Configured core.hooksPath to .githooks');
} catch (error) {
  console.error('Failed to configure core.hooksPath.');
  throw error;
}
