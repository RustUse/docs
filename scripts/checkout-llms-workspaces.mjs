import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const docsRoot = path.resolve(path.dirname(scriptPath), '..');
const reposRoot = process.env.RUSTUSE_REPOS_ROOT
  ? path.resolve(process.env.RUSTUSE_REPOS_ROOT)
  : path.resolve(docsRoot, '..');
const llmsPath = path.join(docsRoot, 'public', 'llms.txt');
const generatedSetsBegin = '<!-- BEGIN GENERATED RUSTUSE SETS -->';
const generatedSetsEnd = '<!-- END GENERATED RUSTUSE SETS -->';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function compareNames(left, right) {
  return left.localeCompare(right, 'en');
}

function setNamesFromLlms(content) {
  const beginIndex = content.indexOf(generatedSetsBegin);
  const endIndex = content.indexOf(generatedSetsEnd);

  if (beginIndex === -1 || endIndex === -1 || beginIndex > endIndex) {
    fail(
      `Unable to find a valid generated RustUse set region in ${llmsPath}. Run npm run generate:llms first.`,
    );
  }

  const setRegion = content.slice(
    beginIndex + generatedSetsBegin.length,
    endIndex,
  );
  const setLinkPattern =
    /^- \[(use-[a-z0-9][a-z0-9-]*)\]\(https:\/\/rustuse\.org\/\1\/\)$/gm;

  return [
    ...new Set(
      [...setRegion.matchAll(setLinkPattern)].map((match) => match[1]),
    ),
  ].sort(compareNames);
}

function cloneWorkspace(setName, targetPath) {
  const repoUrl = `https://github.com/RustUse/${setName}`;

  try {
    execFileSync('git', ['clone', '--depth', '1', repoUrl, targetPath], {
      cwd: docsRoot,
      stdio: 'inherit',
    });
    return true;
  } catch {
    console.warn(
      `Unable to clone RustUse/${setName}; preserving existing llms.txt entries for this missing workspace.`,
    );
    return false;
  }
}

if (!existsSync(llmsPath)) {
  fail(`Missing llms.txt at ${llmsPath}. Run npm run generate:llms first.`);
}

const setNames = setNamesFromLlms(readFileSync(llmsPath, 'utf8'));

if (setNames.length === 0) {
  fail(`No generated RustUse set links found in ${llmsPath}.`);
}

let existingCount = 0;
let clonedCount = 0;
let missingCount = 0;

for (const setName of setNames) {
  const targetPath = path.join(reposRoot, setName);

  if (existsSync(targetPath)) {
    existingCount += 1;
    continue;
  }

  if (cloneWorkspace(setName, targetPath)) {
    clonedCount += 1;
  } else {
    missingCount += 1;
  }
}

console.log(
  `llms.txt workspace checkout complete (${existingCount} existing, ${clonedCount} cloned, ${missingCount} unavailable).`,
);
