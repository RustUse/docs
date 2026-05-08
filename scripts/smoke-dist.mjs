import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const distRoot = path.join(repoRoot, 'dist');
const rustdocSourcesPath = path.join(repoRoot, 'docs', 'rustdoc-sources.json');

if (!existsSync(distRoot)) {
  console.error('Build output not found at dist/. Run "npm run build" first.');
  process.exit(1);
}

const expectedSiteFiles = [
  { path: '404.html', mustInclude: ['404'] },
  { path: 'index.html', mustInclude: ['RustUse'] },
  { path: 'api-reference/index.html', mustInclude: ['API Reference'] },
  { path: 'contributing/index.html', mustInclude: ['Contributing'] },
  { path: 'crates/index.html', mustInclude: ['Crates'] },
  { path: 'onboarding/index.html', mustInclude: ['Onboarding'] },
  { path: 'sets/index.html', mustInclude: ['Sets'] },
  { path: 'sets/use-math/index.html', mustInclude: ['use-math'] },
  { path: 'use-math/index.html', mustInclude: ['Copy full crate'] },
  {
    path: 'use-math/use-combinatorics/index.html',
    mustInclude: ['Copy full crate'],
  },
  {
    path: 'use-math/use-geometry/index.html',
    mustInclude: ['Copy full crate'],
  },
  { path: 'sitemap-index.xml', mustInclude: ['sitemap'] },
];

const rustdocSources = JSON.parse(readFileSync(rustdocSourcesPath, 'utf8'));
const expectedApiFiles = [{ path: 'api/rustuse-rustdoc-shell.css' }];

for (const source of rustdocSources.sources ?? []) {
  expectedApiFiles.push({
    path: path.posix.join('api', source.bundleSlug, 'index.html'),
  });
  expectedApiFiles.push({
    path: path.posix.join('api', source.bundleSlug, 'theme.css'),
  });

  for (const crateName of source.publishedCrates ?? []) {
    expectedApiFiles.push({
      path: path.posix.join('api', crateName, 'index.html'),
    });
    expectedApiFiles.push({
      path: path.posix.join('api', crateName, 'rustuse-source.json'),
      validateJson: true,
    });
  }
}

const problems = [];
let checks = 0;

function readDistFile(relativePath) {
  return readFileSync(path.join(distRoot, ...relativePath.split('/')), 'utf8');
}

function checkFile({
  path: relativePath,
  mustInclude = [],
  validateJson = false,
}) {
  const absolutePath = path.join(distRoot, ...relativePath.split('/'));
  checks += 1;

  if (!existsSync(absolutePath)) {
    problems.push(`Missing built artifact: ${relativePath}`);
    return;
  }

  if (validateJson) {
    try {
      JSON.parse(readDistFile(relativePath));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push(`Invalid JSON artifact: ${relativePath} (${message})`);
    }
    return;
  }

  if (mustInclude.length === 0) {
    return;
  }

  const content = readDistFile(relativePath);
  for (const snippet of mustInclude) {
    if (!content.includes(snippet)) {
      problems.push(`Expected ${relativePath} to include "${snippet}".`);
    }
  }
}

for (const file of [...expectedSiteFiles, ...expectedApiFiles]) {
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
