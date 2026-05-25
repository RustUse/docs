import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const docsRoot = path.resolve(path.dirname(scriptPath), '..');
const reposRoot = process.env.RUSTUSE_REPOS_ROOT
  ? path.resolve(process.env.RUSTUSE_REPOS_ROOT)
  : path.resolve(docsRoot, '..');
const checkMode = process.argv.includes('--check');
const allowMissingWorkspaces = process.argv.includes(
  '--allow-missing-workspaces',
);

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

function llmsPathCandidates() {
  const candidates = [
    path.join(docsRoot, 'public', 'llms.txt'),
    path.join(docsRoot, 'docs', 'public', 'llms.txt'),
    path.join(docsRoot, 'llms.txt'),
    path.resolve(process.cwd(), 'public', 'llms.txt'),
    path.resolve(process.cwd(), 'docs', 'public', 'llms.txt'),
    path.resolve(process.cwd(), 'llms.txt'),
  ];

  return [...new Set(candidates)];
}

function findLlmsPath() {
  const existingPath = llmsPathCandidates().find((candidatePath) =>
    existsSync(candidatePath),
  );

  if (!existingPath) {
    fail(
      `Unable to locate an existing llms.txt. Checked: ${llmsPathCandidates().join(', ')}`,
    );
  }

  return existingPath;
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

function extractSectionText(content, heading) {
  const headingIndex = content.indexOf(heading);

  if (headingIndex === -1) {
    fail(`Missing required llms.txt section heading: ${heading}`);
  }

  const afterHeadingIndex = headingIndex + heading.length;
  const rest = content.slice(afterHeadingIndex);
  const nextHeadingMatch = /\n##\s+/.exec(rest);
  const sectionEnd = nextHeadingMatch
    ? afterHeadingIndex + nextHeadingMatch.index
    : content.length;

  return content.slice(afterHeadingIndex, sectionEnd);
}

function extractGeneratedRegionText(content, region) {
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

  return extractSectionText(content, region.heading);
}

function parseExistingSetLinks(content) {
  const regionText = extractGeneratedRegionText(content, generatedRegions.sets);
  const setNames = [];
  const setLinkPattern =
    /^- \[(use-[a-z0-9][a-z0-9-]*)\]\(https:\/\/rustuse\.org\/(use-[a-z0-9][a-z0-9-]*)\/\)$/gm;

  for (const match of regionText.matchAll(setLinkPattern)) {
    if (match[1] === match[2]) {
      setNames.push(match[1]);
    }
  }

  return uniqueSortedNames(setNames);
}

function parseExistingCrateLinks(content) {
  const regionText = extractGeneratedRegionText(
    content,
    generatedRegions.crates,
  );
  const crateLinks = [];
  const crateLinkPattern =
    /^- \[(use-[a-z0-9][a-z0-9-]*)\]\(https:\/\/rustuse\.org\/(use-[a-z0-9][a-z0-9-]*)(?:\/(use-[a-z0-9][a-z0-9-]*))?\/\)$/gm;

  for (const match of regionText.matchAll(crateLinkPattern)) {
    const crateName = match[3] ?? match[2];

    if (match[1] === crateName) {
      crateLinks.push({ name: crateName, set: match[2] });
    }
  }

  return uniqueSortedCrates(crateLinks);
}

function parseExistingInventory(content) {
  return {
    crates: parseExistingCrateLinks(content),
    sets: parseExistingSetLinks(content),
  };
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
    `Preserving ${missingSetNames.length} existing llms.txt set(s) because matching local workspaces are unavailable: ${missingSetNames.join(', ')}`,
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

function renderSetList(setNames) {
  return setNames
    .map((setName) => `- [${setName}](https://rustuse.org/${setName}/)`)
    .join('\n');
}

function renderCrateList(crates) {
  return crates
    .map((crateEntry) => {
      const url =
        crateEntry.name === crateEntry.set
          ? `https://rustuse.org/${crateEntry.set}/`
          : `https://rustuse.org/${crateEntry.set}/${crateEntry.name}/`;

      return `- [${crateEntry.name}](${url})`;
    })
    .join('\n');
}

function generatedBlock(region, body) {
  return `${region.begin}\n${body}\n${region.end}`;
}

function replaceMarkedRegion(content, region, body) {
  const beginIndex = content.indexOf(region.begin);
  const endIndex = content.indexOf(region.end);

  if ((beginIndex === -1) !== (endIndex === -1)) {
    fail(
      `Incomplete generated region markers for ${region.heading}. Expected both ${region.begin} and ${region.end}.`,
    );
  }

  if (beginIndex === -1) {
    return undefined;
  }

  if (beginIndex > endIndex) {
    fail(`Generated region markers are out of order for ${region.heading}.`);
  }

  return `${content.slice(0, beginIndex)}${generatedBlock(region, body)}${content.slice(endIndex + region.end.length)}`;
}

function replaceUnmarkedSection(content, region, body) {
  const headingIndex = content.indexOf(region.heading);

  if (headingIndex === -1) {
    fail(`Missing required llms.txt section heading: ${region.heading}`);
  }

  const afterHeadingIndex = headingIndex + region.heading.length;
  const rest = content.slice(afterHeadingIndex);
  const nextHeadingMatch = /\n##\s+/.exec(rest);
  const sectionEnd = nextHeadingMatch
    ? afterHeadingIndex + nextHeadingMatch.index
    : content.length;
  const tail = content.slice(sectionEnd).replace(/^\n+/, '');

  return `${content.slice(0, afterHeadingIndex)}\n\n${generatedBlock(region, body)}\n\n${tail}`;
}

function replaceGeneratedRegion(content, region, body) {
  return (
    replaceMarkedRegion(content, region, body) ??
    replaceUnmarkedSection(content, region, body)
  );
}

function renderLlmsContent(originalContent, inventory) {
  let nextContent = normalizeNewlines(originalContent);

  nextContent = replaceGeneratedRegion(
    nextContent,
    generatedRegions.sets,
    renderSetList(inventory.sets),
  );
  nextContent = replaceGeneratedRegion(
    nextContent,
    generatedRegions.crates,
    renderCrateList(inventory.crates),
  );

  return normalizeNewlines(nextContent);
}

const llmsPath = findLlmsPath();
const originalContent = normalizeNewlines(readFileSync(llmsPath, 'utf8'));
let inventory = buildInventoryFromWorkspaces();

if (allowMissingWorkspaces) {
  inventory = preserveMissingWorkspaceEntries(
    inventory,
    parseExistingInventory(originalContent),
  );
}

const nextContent = renderLlmsContent(originalContent, inventory);

if (checkMode) {
  if (nextContent !== originalContent) {
    console.error(
      `${path.relative(docsRoot, llmsPath)} is stale. Run npm run generate:llms from the docs repo and commit the updated file.`,
    );
    process.exit(1);
  }

  console.log(
    `llms.txt is current (${inventory.sets.length} sets, ${inventory.crates.length} crates).`,
  );
  process.exit(0);
}

if (nextContent !== originalContent) {
  writeFileSync(llmsPath, nextContent, 'utf8');
  console.log(
    `Updated ${path.relative(docsRoot, llmsPath)} (${inventory.sets.length} sets, ${inventory.crates.length} crates).`,
  );
} else {
  console.log(
    `llms.txt is already current (${inventory.sets.length} sets, ${inventory.crates.length} crates).`,
  );
}
