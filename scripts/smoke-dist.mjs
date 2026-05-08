import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { getSmokeChecks, validateSourceArtifact } from './smoke-contract.mjs';

const repoRoot = process.cwd();
const distRoot = path.join(repoRoot, 'dist');

if (!existsSync(distRoot)) {
  console.error('Build output not found at dist/. Run "npm run build" first.');
  process.exit(1);
}

const problems = [];
let checks = 0;
const smokeChecks = getSmokeChecks(repoRoot);

function readDistFile(relativePath) {
  return readFileSync(path.join(distRoot, ...relativePath.split('/')), 'utf8');
}

function checkFile({
  distPath,
  mustInclude = [],
  sourceArtifact,
}) {
  const absolutePath = path.join(distRoot, ...distPath.split('/'));
  checks += 1;

  if (!existsSync(absolutePath)) {
    problems.push(`Missing built artifact: ${distPath}`);
    return;
  }

  if (sourceArtifact) {
    try {
      validateSourceArtifact(readDistFile(distPath), sourceArtifact);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push(`Invalid JSON artifact: ${distPath} (${message})`);
    }
    return;
  }

  if (mustInclude.length === 0) {
    return;
  }

  const content = readDistFile(distPath);
  for (const snippet of mustInclude) {
    if (!content.includes(snippet)) {
      problems.push(`Expected ${distPath} to include "${snippet}".`);
    }
  }
}

for (const file of smokeChecks) {
  checkFile(file);
}

if (problems.length > 0) {
  console.error('Build smoke check failed.');
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log(`Build smoke check passed (${checks} checks).`);
