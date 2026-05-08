import { execFileSync } from 'node:child_process';
import process from 'node:process';

const repoRoot = process.cwd();

function resolveCommand(command) {
  if (process.platform === 'win32' && command === 'git') {
    return 'git.exe';
  }

  return command;
}

function runGit(args) {
  return execFileSync(resolveCommand('git'), args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

try {
  runGit(['rev-parse', '--is-inside-work-tree']);
  runGit(['config', 'core.hooksPath', '.githooks']);
  console.log('Configured core.hooksPath to .githooks');
} catch {
  console.log(
    'Skipping git hook setup because this directory is not an active git worktree.',
  );
}
