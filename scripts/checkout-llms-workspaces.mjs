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
const generatedFacadesBegin = '<!-- BEGIN GENERATED RUSTUSE FACADES -->';
const generatedFacadesEnd = '<!-- END GENERATED RUSTUSE FACADES -->';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function compareNames(left, right) {
  return left.localeCompare(right, 'en');
}

function facadeNamesFromLlms(content) {
  const beginIndex = content.indexOf(generatedFacadesBegin);
  const endIndex = content.indexOf(generatedFacadesEnd);

  if (beginIndex === -1 || endIndex === -1 || beginIndex > endIndex) {
    fail(
      `Unable to find a valid generated RustUse facade region in ${llmsPath}. Run npm run generate:llms first.`,
    );
  }

  const facadeRegion = content.slice(
    beginIndex + generatedFacadesBegin.length,
    endIndex,
  );
  const facadeLinkPattern =
    /^- \[(use-[a-z0-9][a-z0-9-]*)\]\(https:\/\/rustuse\.org\/\1\/\)$/gm;

  return [
    ...new Set(
      [...facadeRegion.matchAll(facadeLinkPattern)].map((match) => match[1]),
    ),
  ].sort(compareNames);
}

function cloneWorkspace(facadeName, targetPath) {
  const repoUrl = `https://github.com/RustUse/${facadeName}`;

  try {
    execFileSync('git', ['clone', '--depth', '1', repoUrl, targetPath], {
      cwd: docsRoot,
      stdio: 'inherit',
    });
    return true;
  } catch {
    console.warn(
      `Unable to clone RustUse/${facadeName}; preserving existing llms.txt entries for this missing workspace.`,
    );
    return false;
  }
}

if (!existsSync(llmsPath)) {
  fail(`Missing llms.txt at ${llmsPath}. Run npm run generate:llms first.`);
}

const facadeNames = facadeNamesFromLlms(readFileSync(llmsPath, 'utf8'));

if (facadeNames.length === 0) {
  fail(`No generated RustUse facade links found in ${llmsPath}.`);
}

let existingCount = 0;
let clonedCount = 0;
let missingCount = 0;

for (const facadeName of facadeNames) {
  const targetPath = path.join(reposRoot, facadeName);

  if (existsSync(targetPath)) {
    existingCount += 1;
    continue;
  }

  if (cloneWorkspace(facadeName, targetPath)) {
    clonedCount += 1;
  } else {
    missingCount += 1;
  }
}

console.log(
  `llms.txt workspace checkout complete (${existingCount} existing, ${clonedCount} cloned, ${missingCount} unavailable).`,
);
