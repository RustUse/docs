import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const docsRoot = path.resolve(path.dirname(scriptPath), '..');
const publicRoot = path.join(docsRoot, 'public');
const reposRoot = process.env.RUSTUSE_REPOS_ROOT
  ? path.resolve(process.env.RUSTUSE_REPOS_ROOT)
  : path.resolve(docsRoot, '..');
const checkMode = process.argv.includes('--check');
const allowMissingWorkspaces = process.argv.includes(
  '--allow-missing-workspaces',
);
const siteOrigin = 'https://rustuse.org';

const generatedRegions = {
  crates: {
    begin: '<!-- BEGIN GENERATED RUSTUSE CRATES -->',
    end: '<!-- END GENERATED RUSTUSE CRATES -->',
    heading: '## RustUse crates',
  },
  sets: {
    begin: '<!-- BEGIN GENERATED RUSTUSE SETS -->',
    end: '<!-- END GENERATED RUSTUSE SETS -->',
    heading: '## RustUse sets',
  },
};

const llmsRootPath = path.join(publicRoot, 'llms.txt');
const llmsFullPath = path.join(publicRoot, 'llms-full.txt');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function normalizeNewlines(content) {
  return `${content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd()}\n`;
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function relativeOutputPath(filePath) {
  return normalizePath(path.relative(docsRoot, filePath));
}

function isRustUseName(name) {
  return /^use-[a-z0-9][a-z0-9-]*$/.test(name);
}

function compareNames(left, right) {
  return left.localeCompare(right, 'en');
}

function uniqueSortedNames(names) {
  return [...new Set(names)].sort(compareNames);
}

function uniqueSortedCrates(crates) {
  const cratesByKey = new Map();

  for (const crateEntry of crates) {
    cratesByKey.set(`${crateEntry.set}\0${crateEntry.name}`, crateEntry);
  }

  return [...cratesByKey.values()].sort((left, right) => {
    const nameComparison = compareNames(left.name, right.name);

    return nameComparison === 0
      ? compareNames(left.set, right.set)
      : nameComparison;
  });
}

function discoverSetWorkspaces() {
  if (!existsSync(reposRoot)) {
    fail(`RustUse repository root does not exist: ${reposRoot}`);
  }

  return readdirSync(reposRoot, { withFileTypes: true })
    .filter((entry) => {
      if (!entry.isDirectory()) {
        return false;
      }

      if (entry.name.startsWith('.')) {
        return false;
      }

      if (!isRustUseName(entry.name)) {
        return false;
      }

      return existsSync(path.join(reposRoot, entry.name, 'Cargo.toml'));
    })
    .map((entry) => ({
      name: entry.name,
      path: path.join(reposRoot, entry.name),
    }))
    .sort((left, right) => compareNames(left.name, right.name));
}

function readCargoMetadata(workspacePath) {
  try {
    return JSON.parse(
      execFileSync(
        'cargo',
        ['metadata', '--format-version', '1', '--no-deps'],
        {
          cwd: workspacePath,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      ),
    );
  } catch (error) {
    const stderr = error.stderr?.toString().trim();
    console.warn(
      `Unable to read Cargo metadata for ${workspacePath}; falling back to manifest scanning.${stderr ? `\n${stderr}` : ''}`,
    );
    return undefined;
  }
}

function packageManifestDir(packageRecord) {
  return path.dirname(path.resolve(packageRecord.manifest_path));
}

function packageLivesInSetCrateDir(packageRecord, setPath) {
  const relativeManifestDir = normalizePath(
    path.relative(setPath, packageManifestDir(packageRecord)),
  );

  return (
    relativeManifestDir === '' ||
    /^crates\/use-[^/]+$/.test(relativeManifestDir)
  );
}

function workspacePackages(metadata, setPath) {
  const workspaceIndex = new Map(
    metadata.workspace_members.map((packageId, index) => [packageId, index]),
  );

  return metadata.packages
    .filter(
      (packageRecord) =>
        workspaceIndex.has(packageRecord.id) &&
        isRustUseName(packageRecord.name) &&
        packageLivesInSetCrateDir(packageRecord, setPath),
    )
    .sort(
      (left, right) =>
        (workspaceIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (workspaceIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
}

function packageNameFromManifest(manifestPath) {
  if (!existsSync(manifestPath)) {
    return undefined;
  }

  const lines = readFileSync(manifestPath, 'utf8').split(/\r?\n/);
  let inPackageSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^\[[^\]]+\]$/.test(trimmed)) {
      if (inPackageSection) {
        return undefined;
      }

      inPackageSection = trimmed === '[package]';
      continue;
    }

    if (!inPackageSection) {
      continue;
    }

    const nameMatch = /^name\s*=\s*"([^"]+)"/.exec(trimmed);

    if (nameMatch) {
      return nameMatch[1];
    }
  }

  return undefined;
}

function discoverCrateNamesByScanning(setWorkspace) {
  const crateNames = new Set([setWorkspace.name]);
  const rootPackageName = packageNameFromManifest(
    path.join(setWorkspace.path, 'Cargo.toml'),
  );

  if (rootPackageName && isRustUseName(rootPackageName)) {
    crateNames.add(rootPackageName);
  }

  const cratesRoot = path.join(setWorkspace.path, 'crates');

  if (!existsSync(cratesRoot)) {
    return [...crateNames];
  }

  for (const entry of readdirSync(cratesRoot, { withFileTypes: true }).sort(
    (left, right) => compareNames(left.name, right.name),
  )) {
    if (!entry.isDirectory() || !isRustUseName(entry.name)) {
      continue;
    }

    const manifestPath = path.join(cratesRoot, entry.name, 'Cargo.toml');

    if (!existsSync(manifestPath)) {
      continue;
    }

    const packageName = packageNameFromManifest(manifestPath) ?? entry.name;

    if (isRustUseName(packageName)) {
      crateNames.add(packageName);
    }
  }

  return [...crateNames];
}

function discoverCrateNames(setWorkspace) {
  const metadata = readCargoMetadata(setWorkspace.path);

  if (!metadata) {
    return discoverCrateNamesByScanning(setWorkspace);
  }

  const crateNames = workspacePackages(metadata, setWorkspace.path).map(
    (packageRecord) => packageRecord.name,
  );

  crateNames.push(setWorkspace.name);

  return crateNames;
}

function buildInventoryFromWorkspaces() {
  const setWorkspaces = discoverSetWorkspaces();

  if (setWorkspaces.length === 0) {
    fail(`No sibling RustUse set workspaces found under ${reposRoot}.`);
  }

  const sets = uniqueSortedNames(
    setWorkspaces.map((setWorkspace) => setWorkspace.name),
  );
  const crates = [];

  for (const setWorkspace of setWorkspaces) {
    for (const crateName of uniqueSortedNames(
      discoverCrateNames(setWorkspace),
    )) {
      crates.push({ name: crateName, set: setWorkspace.name });
    }
  }

  return {
    crates: uniqueSortedCrates(crates),
    sets,
  };
}

function extractSectionText(content, heading, { required = true } = {}) {
  const headingIndex = content.indexOf(heading);

  if (headingIndex === -1) {
    if (required) {
      fail(`Missing required LLM context section heading: ${heading}`);
    }

    return undefined;
  }

  const afterHeadingIndex = headingIndex + heading.length;
  const rest = content.slice(afterHeadingIndex);
  const nextHeadingMatch = /\n##\s+/.exec(rest);
  const sectionEnd = nextHeadingMatch
    ? afterHeadingIndex + nextHeadingMatch.index
    : content.length;

  return content.slice(afterHeadingIndex, sectionEnd);
}

function extractGeneratedRegionText(content, region, { required = true } = {}) {
  const beginIndex = content.indexOf(region.begin);
  const endIndex = content.indexOf(region.end);

  if ((beginIndex === -1) !== (endIndex === -1)) {
    fail(
      `Incomplete generated region markers for ${region.heading}. Expected both ${region.begin} and ${region.end}.`,
    );
  }

  if (beginIndex !== -1) {
    if (beginIndex > endIndex) {
      fail(`Generated region markers are out of order for ${region.heading}.`);
    }

    return content.slice(beginIndex + region.begin.length, endIndex);
  }

  return extractSectionText(content, region.heading, { required });
}

function parseExistingSetLinks(content, { required = true } = {}) {
  const regionText = extractGeneratedRegionText(
    content,
    generatedRegions.sets,
    {
      required,
    },
  );

  if (regionText === undefined) {
    return [];
  }

  const setNames = [];
  const setLinkPattern =
    /^- \[(use-[a-z0-9][a-z0-9-]*)\]\(https:\/\/rustuse\.org\/(use-[a-z0-9][a-z0-9-]*)\/\)(?:\s+- .*)?$/gm;

  for (const match of regionText.matchAll(setLinkPattern)) {
    if (match[1] === match[2]) {
      setNames.push(match[1]);
    }
  }

  return uniqueSortedNames(setNames);
}

function parseExistingCrateLinks(content, { required = true } = {}) {
  const regionText = extractGeneratedRegionText(
    content,
    generatedRegions.crates,
    { required },
  );

  if (regionText === undefined) {
    return [];
  }

  const crateLinks = [];
  const crateLinkPattern =
    /^- \[(use-[a-z0-9][a-z0-9-]*)\]\(https:\/\/rustuse\.org\/(use-[a-z0-9][a-z0-9-]*)(?:\/(use-[a-z0-9][a-z0-9-]*))?\/\)(?:\s+- .*)?$/gm;

  for (const match of regionText.matchAll(crateLinkPattern)) {
    const crateName = match[3] ?? match[2];

    if (match[1] === crateName) {
      crateLinks.push({ name: crateName, set: match[2] });
    }
  }

  return uniqueSortedCrates(crateLinks);
}

function readExistingContent(filePath) {
  return existsSync(filePath)
    ? normalizeNewlines(readFileSync(filePath, 'utf8'))
    : undefined;
}

function parseExistingInventoryForMissingWorkspaces() {
  const rootContent = readExistingContent(llmsRootPath);
  const fullContent = readExistingContent(llmsFullPath);

  if (!rootContent) {
    fail(
      `Missing llms.txt at ${llmsRootPath}. Run npm run generate:llms first.`,
    );
  }

  const sets = parseExistingSetLinks(rootContent);
  const crates = fullContent
    ? parseExistingCrateLinks(fullContent)
    : parseExistingCrateLinks(rootContent, { required: false });

  return { crates, sets };
}

function preserveMissingWorkspaceEntries(inventory, existingInventory) {
  const discoveredSetNames = new Set(inventory.sets);
  const missingSetNames = existingInventory.sets.filter(
    (setName) => !discoveredSetNames.has(setName),
  );

  if (missingSetNames.length === 0) {
    return inventory;
  }

  console.warn(
    `Preserving ${missingSetNames.length} existing LLM set(s) because matching local workspaces are unavailable: ${missingSetNames.join(', ')}`,
  );

  const missingSetNameSet = new Set(missingSetNames);

  return {
    crates: uniqueSortedCrates([
      ...inventory.crates,
      ...existingInventory.crates.filter((crateEntry) =>
        missingSetNameSet.has(crateEntry.set),
      ),
    ]),
    sets: uniqueSortedNames([...inventory.sets, ...missingSetNames]),
  };
}

function siteUrl(pathname) {
  return `${siteOrigin}${pathname}`;
}

function setUrl(setName) {
  return siteUrl(`/${setName}/`);
}

function setAliasUrl(setName) {
  return siteUrl(`/sets/${setName}/`);
}

function crateUrl(crateEntry) {
  return crateEntry.name === crateEntry.set
    ? setUrl(crateEntry.set)
    : siteUrl(`/${crateEntry.set}/${crateEntry.name}/`);
}

function workspaceRustdocsUrl(setName) {
  return siteUrl(`/api/workspaces/${setName}/`);
}

function formatSetLabel(setName) {
  return setName.replace(/^use-/, '').replace(/-/g, ' ');
}

function cratesForSet(inventory, setName) {
  return inventory.crates.filter((crateEntry) => crateEntry.set === setName);
}

function renderSetList(setNames) {
  return setNames
    .map((setName) => `- [${setName}](${setUrl(setName)})`)
    .join('\n');
}

function renderCrateList(crates) {
  return crates
    .map((crateEntry) => {
      const detail =
        crateEntry.name === crateEntry.set
          ? 'facade set'
          : `child crate of ${crateEntry.set}`;

      return `- [${crateEntry.name}](${crateUrl(crateEntry)}) - ${detail}`;
    })
    .join('\n');
}

function generatedBlock(region, body) {
  return `${region.begin}\n${body}\n${region.end}`;
}

function renderGeneratedSets(setNames) {
  return generatedBlock(generatedRegions.sets, renderSetList(setNames));
}

function renderGeneratedCrates(crates) {
  return generatedBlock(generatedRegions.crates, renderCrateList(crates));
}

function renderRustUseHeading() {
  return `# RustUse\n\nComposable sets of primitive Rust utility crates for fellow crustaceans.`;
}

function renderPrimaryLinks() {
  return `## Primary links\n\n- Primary site: https://rustuse.org/\n- Onboarding docs: https://rustuse.org/onboarding/\n- Set docs overview: https://rustuse.org/sets/\n- Crate docs overview: https://rustuse.org/crates/\n- Contributing: https://rustuse.org/contributing/\n- GitHub organization: https://github.com/RustUse`;
}

function renderWorkspaceRustdocsPatterns() {
  return `## Workspace Rustdocs\n\nWorkspace Rustdocs follow these patterns:\n\n- https://rustuse.org/api/workspaces/{set}/\n- https://rustuse.org/api/workspaces/{set}/{crate_module}/index.html\n\nExample:\n\n- https://rustuse.org/api/workspaces/use-math/\n- https://rustuse.org/api/workspaces/use-math/use_combinatorics/index.html`;
}

function renderCommonRustUseContext() {
  return `${renderRustUseHeading()}\n\n${renderPrimaryLinks()}\n\n${renderWorkspaceRustdocsPatterns()}`;
}

function renderLlmsRootIndex(inventory) {
  return normalizeNewlines(`${renderCommonRustUseContext()}

## RustUse sets

${renderGeneratedSets(inventory.sets)}

## Full context

- [Full RustUse documentation bundle including all available crates](https://rustuse.org/llms-full.txt)

The root \`llms.txt\` intentionally lists only primary links, workspace Rustdoc patterns, and facade sets. Use \`llms-full.txt\` when crate-level context is needed.
`);
}

function renderLlmsFullIndex(inventory) {
  return normalizeNewlines(`${renderCommonRustUseContext()}

## RustUse sets

${renderGeneratedSets(inventory.sets)}

## RustUse crates

All known facade crates and child crates generated from the RustUse workspace/site registry.

${renderGeneratedCrates(inventory.crates)}
`);
}

function renderSetLinks(setName) {
  return `## Set links\n\n- Canonical set page: ${setUrl(setName)}\n- Set overview alias: ${setAliasUrl(setName)}\n- Workspace Rustdocs: ${workspaceRustdocsUrl(setName)}\n- Repository: https://github.com/RustUse/${setName}\n- Root LLM routing map: https://rustuse.org/llms.txt\n- Full RustUse context: https://rustuse.org/llms-full.txt`;
}

function renderParentRustUseLinks() {
  return `## Parent RustUse links\n\n- Primary site: https://rustuse.org/\n- Onboarding docs: https://rustuse.org/onboarding/\n- Set docs overview: https://rustuse.org/sets/\n- Crate docs overview: https://rustuse.org/crates/\n- Contributing: https://rustuse.org/contributing/\n- GitHub organization: https://github.com/RustUse`;
}

function renderSetLlmsIndex(setName, inventory) {
  const setCrates = cratesForSet(inventory, setName);

  return normalizeNewlines(`# ${setName}

RustUse ${formatSetLabel(setName)} utilities and facade set.

${renderSetLinks(setName)}

${renderParentRustUseLinks()}

## Set crates

Current facade and child crates generated from the ${setName} workspace inventory.

${renderGeneratedCrates(setCrates)}

## Full set context

- [Full ${setName} LLM context](https://rustuse.org/${setName}/llms-full.txt)

The set \`llms.txt\` keeps routing, workspace Rustdocs, and crate links for this set. Use \`${setName}/llms-full.txt\` when fuller set-level context is needed.
`);
}

function renderSetLlmsFull(setName, inventory) {
  const setCrates = cratesForSet(inventory, setName);

  return normalizeNewlines(`# ${setName}

Expanded LLM context for the RustUse ${formatSetLabel(setName)} set.

${renderSetLinks(setName)}

${renderParentRustUseLinks()}

## Workspace Rustdocs

- ${workspaceRustdocsUrl(setName)}
- ${siteUrl(`/api/workspaces/${setName}/{crate_module}/index.html`)}

## Crate-level context

All known facade and child crates generated from the ${setName} workspace inventory.

${renderGeneratedCrates(setCrates)}

## Routing notes

The canonical short routes are ${siteUrl(`/${setName}/llms.txt`)} and ${siteUrl(`/${setName}/llms-full.txt`)}. The /sets/${setName}/ aliases serve this exact generated content so the two paths cannot drift.
`);
}

function buildLlmsOutputs(inventory) {
  const outputs = [
    { content: renderLlmsRootIndex(inventory), filePath: llmsRootPath },
    { content: renderLlmsFullIndex(inventory), filePath: llmsFullPath },
  ];

  for (const setName of inventory.sets) {
    const setIndex = renderSetLlmsIndex(setName, inventory);
    const setFull = renderSetLlmsFull(setName, inventory);

    outputs.push(
      {
        content: setIndex,
        filePath: path.join(publicRoot, setName, 'llms.txt'),
      },
      {
        content: setFull,
        filePath: path.join(publicRoot, setName, 'llms-full.txt'),
      },
      {
        content: setIndex,
        filePath: path.join(publicRoot, 'sets', setName, 'llms.txt'),
      },
      {
        content: setFull,
        filePath: path.join(publicRoot, 'sets', setName, 'llms-full.txt'),
      },
    );
  }

  return outputs;
}

function changedOutputs(outputs) {
  return outputs.filter((output) => {
    const currentContent = readExistingContent(output.filePath);

    return currentContent !== output.content;
  });
}

function writeLlmsOutputs(outputs) {
  const changed = changedOutputs(outputs);

  for (const output of changed) {
    mkdirSync(path.dirname(output.filePath), { recursive: true });
    writeFileSync(output.filePath, output.content, 'utf8');
  }

  return changed;
}

let inventory = buildInventoryFromWorkspaces();

if (allowMissingWorkspaces) {
  inventory = preserveMissingWorkspaceEntries(
    inventory,
    parseExistingInventoryForMissingWorkspaces(),
  );
}

const llmsOutputs = buildLlmsOutputs(inventory);
const staleOutputs = changedOutputs(llmsOutputs);

if (checkMode) {
  if (staleOutputs.length > 0) {
    console.error(
      `${staleOutputs.length} LLM context file(s) are stale. Run npm run generate:llms from the docs repo and commit the updated files.`,
    );

    for (const output of staleOutputs.slice(0, 20)) {
      console.error(`- ${relativeOutputPath(output.filePath)}`);
    }

    if (staleOutputs.length > 20) {
      console.error(`- ...and ${staleOutputs.length - 20} more`);
    }

    process.exit(1);
  }

  console.log(
    `LLM context files are current (${llmsOutputs.length} files, ${inventory.sets.length} sets, ${inventory.crates.length} crates).`,
  );
  process.exit(0);
}

const writtenOutputs = writeLlmsOutputs(llmsOutputs);

if (writtenOutputs.length > 0) {
  console.log(
    `Updated ${writtenOutputs.length} of ${llmsOutputs.length} LLM context file(s) (${inventory.sets.length} sets, ${inventory.crates.length} crates).`,
  );
} else {
  console.log(
    `LLM context files are already current (${llmsOutputs.length} files, ${inventory.sets.length} sets, ${inventory.crates.length} crates).`,
  );
}
