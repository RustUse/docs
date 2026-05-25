import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { format, resolveConfig } from 'prettier';

const docsRoot = process.cwd();
const srcRoot = path.join(docsRoot, 'src');
const dataRoot = path.join(srcRoot, 'data');
const contentRoot = path.join(srcRoot, 'content', 'docs');
const componentsRoot = path.join(srcRoot, 'components');
const cratesIoBaseUrl = 'https://crates.io/crates';
const cratesIoApiBaseUrl = 'https://crates.io/api/v1/crates';
const cratesIoRequestConcurrency = 8;
const cratesIoRequestHeaders = {
  Accept: 'application/json',
  'User-Agent':
    'RustUse docs crate surface sync (https://github.com/RustUse/docs)',
};
const docsRsBaseUrl = 'https://docs.rs';
const catalogOutputPath = path.join(dataRoot, 'catalog.generated.js');
const rustdocSourcesPath = path.join(docsRoot, 'docs', 'rustdoc-sources.json');
const rustuseRepoUrl = 'https://github.com/RustUse/rustuse';
const rustuseManifestPath = path.resolve(docsRoot, '../rustuse/Cargo.toml');
const setWorkspaceTempRoot = path.join(
  os.tmpdir(),
  `rustuse-set-workspaces-${process.pid}`,
);
const prettierOptions =
  (await resolveConfig(path.join(docsRoot, '.prettierrc.json'))) ?? {};

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalizeRepositoryUrl(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const trimmed = value
    .trim()
    .replace(/\.git$/i, '')
    .replace(/\/+$/g, '');

  try {
    const url = new URL(trimmed);
    const pathName = url.pathname
      .replace(/\.git$/i, '')
      .replace(/\/+$/g, '')
      .toLowerCase();

    return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${pathName}`;
  } catch {
    return trimmed.toLowerCase();
  }
}

function repositoryUrlsMatch(left, right) {
  const normalizedLeft = normalizeRepositoryUrl(left);
  const normalizedRight = normalizeRepositoryUrl(right);

  return Boolean(
    normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
  );
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(concurrency, items.length);

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      await runWorker();
    }),
  );

  return results;
}

const cratesIoCrateCache = new Map();

async function fetchCratesIoCrate(packageName) {
  if (cratesIoCrateCache.has(packageName)) {
    return cratesIoCrateCache.get(packageName);
  }

  const requestUrl = `${cratesIoApiBaseUrl}/${encodeURIComponent(packageName)}`;
  let lastError;

  for (const attempt of [1, 2, 3]) {
    try {
      const response = await fetch(requestUrl, {
        headers: cratesIoRequestHeaders,
      });

      if (response.status === 404) {
        cratesIoCrateCache.set(packageName, null);
        return null;
      }

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const delayMilliseconds = Number.isFinite(retryAfter)
          ? retryAfter * 1000
          : attempt * 1000;

        if (attempt < 3) {
          await sleep(delayMilliseconds);
          continue;
        }
      }

      if (!response.ok) {
        fail(
          `Unable to query crates.io for ${packageName}: ${response.status} ${response.statusText}`,
        );
      }

      const body = await response.json();
      const crateRecord = body?.crate ?? null;
      cratesIoCrateCache.set(packageName, crateRecord);
      return crateRecord;
    } catch (error) {
      lastError = error;

      if (attempt < 3) {
        await sleep(attempt * 1000);
        continue;
      }
    }
  }

  fail(`Unable to query crates.io for ${packageName}: ${lastError.message}`);
}

function readJsonCommandOutput(command, args, cwd) {
  return JSON.parse(
    execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
  );
}

function cargoMetadata(workspacePath) {
  return readJsonCommandOutput(
    'cargo',
    ['metadata', '--format-version', '1', '--no-deps'],
    workspacePath,
  );
}

function cargoMetadataForManifest(manifestPath) {
  return readJsonCommandOutput(
    'cargo',
    [
      'metadata',
      '--manifest-path',
      manifestPath,
      '--format-version',
      '1',
      '--no-deps',
    ],
    docsRoot,
  );
}

function featureNameToSetName(featureName, sourceLabel) {
  if (
    typeof featureName !== 'string' ||
    featureName.startsWith('dep:') ||
    featureName.includes('/')
  ) {
    fail(
      `Unsupported rustuse full feature "${featureName}" in ${sourceLabel}.`,
    );
  }

  const setName = featureName.startsWith('use-')
    ? featureName
    : `use-${featureName}`;

  if (!/^use-[a-z0-9][a-z0-9-]*$/.test(setName)) {
    fail(`Unsupported RustUse set name "${setName}" from ${sourceLabel}.`);
  }

  return setName;
}

function featureNamesToSetNames(featureNames, sourceLabel) {
  const setNames = featureNames.map((featureName) =>
    featureNameToSetName(featureName, sourceLabel),
  );
  const uniqueSetNames = new Set(setNames);

  if (uniqueSetNames.size !== setNames.length) {
    fail(`Duplicate RustUse set feature found in ${sourceLabel}.`);
  }

  return setNames;
}

function extractFullFeatureNamesFromMetadata(metadata, sourceLabel) {
  const rustusePackage = metadata.packages.find(
    (pkg) => pkg.name === 'rustuse',
  );
  const fullFeature = rustusePackage?.features?.full;

  if (!Array.isArray(fullFeature) || fullFeature.length === 0) {
    fail(`Unable to find rustuse features.full in ${sourceLabel}.`);
  }

  return fullFeature;
}

function extractFullFeatureNamesFromManifest(content, sourceLabel) {
  const lines = content.split(/\r?\n/);
  let inFeatures = false;
  let collectingFullFeature = false;
  let fullFeatureText = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (/^\[[^\]]+\]$/.test(trimmed)) {
      inFeatures = trimmed === '[features]';
      collectingFullFeature = false;
      continue;
    }

    if (!inFeatures) {
      continue;
    }

    if (collectingFullFeature) {
      fullFeatureText += `\n${line}`;

      if (line.includes(']')) {
        break;
      }

      continue;
    }

    const match = /^\s*full\s*=\s*(.*)$/.exec(line);

    if (match) {
      fullFeatureText = match[1];

      if (!fullFeatureText.includes(']')) {
        collectingFullFeature = true;
      }
    }
  }

  const featureNames = [...fullFeatureText.matchAll(/"([^"]+)"/g)].map(
    (match) => match[1],
  );

  if (featureNames.length === 0) {
    fail(`Unable to parse rustuse features.full in ${sourceLabel}.`);
  }

  return featureNames;
}

function cloneRustuseSource() {
  const tempRoot = path.join(os.tmpdir(), `rustuse-surface-${process.pid}`);
  const workingDir = path.join(tempRoot, 'rustuse');

  rmSync(tempRoot, { recursive: true, force: true });
  mkdirSync(tempRoot, { recursive: true });

  console.log(`Cloning RustUse set inventory source: ${rustuseRepoUrl}`);
  execFileSync('git', ['clone', '--depth', '1', rustuseRepoUrl, workingDir], {
    cwd: docsRoot,
    stdio: 'inherit',
  });

  return {
    manifestPath: path.join(workingDir, 'Cargo.toml'),
    tempRoot,
  };
}

function discoverRustuseSetNamesFromManifest(manifestPath, sourceLabel) {
  try {
    return featureNamesToSetNames(
      extractFullFeatureNamesFromMetadata(
        cargoMetadataForManifest(manifestPath),
        sourceLabel,
      ),
      sourceLabel,
    );
  } catch {
    console.warn(
      `Unable to read rustuse set inventory with cargo metadata from ${sourceLabel}; falling back to manifest parsing.`,
    );

    return featureNamesToSetNames(
      extractFullFeatureNamesFromManifest(
        readFileSync(manifestPath, 'utf8'),
        sourceLabel,
      ),
      sourceLabel,
    );
  }
}

function discoverRustuseSetNames() {
  if (existsSync(rustuseManifestPath)) {
    return discoverRustuseSetNamesFromManifest(
      rustuseManifestPath,
      rustuseManifestPath,
    );
  }

  const clonedSource = cloneRustuseSource();

  try {
    return discoverRustuseSetNamesFromManifest(
      clonedSource.manifestPath,
      rustuseRepoUrl,
    );
  } finally {
    rmSync(clonedSource.tempRoot, { recursive: true, force: true });
  }
}

const rustuseSetNames = discoverRustuseSetNames();

function buildSetConfig(setName) {
  return {
    name: setName,
    bundleSlug: `workspaces/${setName}`,
    facadeCrate: setName,
    pageDir: setName,
    repo: `https://github.com/RustUse/${setName}`,
    setPath: `/sets/${setName}/`,
    sourcePath: `../${setName}`,
    workspacePath: path.resolve(docsRoot, `../${setName}`),
  };
}

const setConfigs = rustuseSetNames.map((setName) => buildSetConfig(setName));

function cloneSetWorkspace(setConfig) {
  const workingDir = path.join(setWorkspaceTempRoot, setConfig.name);

  console.log(`Cloning RustUse set workspace source: ${setConfig.repo}`);
  execFileSync('git', ['clone', '--depth', '1', setConfig.repo, workingDir], {
    cwd: docsRoot,
    stdio: 'inherit',
  });

  return workingDir;
}

function resolveSetWorkspacePath(setConfig) {
  if (existsSync(path.join(setConfig.workspacePath, 'Cargo.toml'))) {
    return setConfig.workspacePath;
  }

  return cloneSetWorkspace(setConfig);
}

function isPublishablePackage(pkg) {
  if (!pkg.name.startsWith('use-')) {
    return false;
  }

  return !Array.isArray(pkg.publish) || pkg.publish.length > 0;
}

function packageRepositoryUrl(pkg, setConfig) {
  return pkg.repository ?? setConfig.repo;
}

function workspacePackages(metadata) {
  const workspaceIndex = new Map(
    metadata.workspace_members.map((packageId, index) => [packageId, index]),
  );

  return metadata.packages
    .slice()
    .filter((pkg) => workspaceIndex.has(pkg.id) && isPublishablePackage(pkg))
    .sort(
      (left, right) =>
        (workspaceIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (workspaceIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
}

function readSetWorkspaceRecord(setConfig) {
  const workspacePath = resolveSetWorkspacePath(setConfig);
  const metadata = cargoMetadata(workspacePath);
  const packages = workspacePackages(metadata);

  if (packages.length === 0) {
    fail(`No publishable use-* packages found for ${setConfig.name}.`);
  }

  return {
    metadata,
    packages,
    setConfig: {
      ...setConfig,
      workspacePath,
    },
  };
}

function relativeImportPath(fromDir, toFile) {
  const relativePath = path.relative(fromDir, toFile).replace(/\\/g, '/');

  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

function buildTags(pkg) {
  const tags = Array.isArray(pkg.keywords) ? pkg.keywords.slice(0, 3) : [];

  if (tags.length > 0) {
    return tags;
  }

  return Array.isArray(pkg.categories) && pkg.categories.length > 0
    ? pkg.categories.slice(0, 2)
    : ['rustuse'];
}

function formatSetLabel(setName) {
  return setName.replace(/^use-/, '').replace(/-/g, ' ');
}

async function resolvePublicationStatus(pkg, setConfig) {
  const crateRecord = await fetchCratesIoCrate(pkg.name);
  const repositoryUrl = packageRepositoryUrl(pkg, setConfig);
  const published = repositoryUrlsMatch(crateRecord?.repository, repositoryUrl);

  return {
    repositoryUrl,
    status: published ? 'published' : 'scaffolded',
  };
}

async function buildPublicationStatusByPackageId(setWorkspaceRecords) {
  const packageRefs = setWorkspaceRecords.flatMap((setWorkspaceRecord) =>
    setWorkspaceRecord.packages.map((pkg) => ({
      pkg,
      setConfig: setWorkspaceRecord.setConfig,
    })),
  );
  const statusEntries = await mapWithConcurrency(
    packageRefs,
    cratesIoRequestConcurrency,
    async ({ pkg, setConfig }) => [
      pkg.id,
      await resolvePublicationStatus(pkg, setConfig),
    ],
  );
  const statusByPackageId = new Map(statusEntries);
  const publishedCount = statusEntries.filter(
    ([, statusInfo]) => statusInfo.status === 'published',
  ).length;

  console.log(
    `Resolved crates.io status for ${statusEntries.length} packages: ${publishedCount} published, ${statusEntries.length - publishedCount} scaffolded.`,
  );

  return statusByPackageId;
}

function buildSetCatalogEntry(setConfig, facadeEntry, hasGeneratedApi) {
  const published = facadeEntry.status === 'published';
  const workspaceApiPath = hasGeneratedApi
    ? `/${setConfig.bundleSlug}/`.replace('/workspaces/', '/api/workspaces/')
    : undefined;

  return {
    name: setConfig.name,
    setPath: setConfig.setPath,
    status: facadeEntry.status,
    description: `RustUse ${formatSetLabel(setConfig.name)} utilities and facade surface.`,
    repositoryUrl: setConfig.repo,
    cratesIoUrl: published ? `${cratesIoBaseUrl}/${setConfig.name}` : undefined,
    docsRsUrl: published ? `${docsRsBaseUrl}/${setConfig.name}` : undefined,
    ...(workspaceApiPath ? { workspaceApiPath } : {}),
  };
}

function buildCatalogEntry(setConfig, pkg, statusInfo, hasGeneratedApi) {
  const isFacade = pkg.name === setConfig.facadeCrate;
  const status = statusInfo.status;
  const published = status === 'published';
  const docsUrl =
    published && hasGeneratedApi ? `/api/${pkg.name}/` : undefined;

  return {
    name: pkg.name,
    packageName: pkg.name,
    set: setConfig.name,
    setPath: setConfig.setPath,
    status,
    description:
      pkg.description ??
      `RustUse ${formatSetLabel(setConfig.name)} ${isFacade ? 'facade' : 'focused'} crate.`,
    repositoryUrl: statusInfo.repositoryUrl,
    cratesIoUrl: published ? `${cratesIoBaseUrl}/${pkg.name}` : undefined,
    docsUrl,
    docsRsUrl: published ? `${docsRsBaseUrl}/${pkg.name}` : undefined,
    apiPath: docsUrl,
    pagePath: isFacade
      ? `/${setConfig.pageDir}/`
      : `/${setConfig.pageDir}/${pkg.name}/`,
    tags: buildTags(pkg),
    public: true,
  };
}

function buildGeneratedCatalogModule(sets, crates) {
  return `// This file is generated by scripts/sync-crate-surface.mjs. Do not edit by hand.\n\nexport const rustuseSets = ${JSON.stringify(sets, null, 2)};\n\nexport const rustuseCrates = ${JSON.stringify(crates, null, 2)};\n`;
}

async function formatGeneratedContent(content, parser) {
  return format(content, {
    ...prettierOptions,
    parser,
  });
}

async function buildGeneratedPage(entry, setConfig) {
  const pageDir = path.join(contentRoot, setConfig.pageDir);
  const componentImport = relativeImportPath(
    pageDir,
    path.join(componentsRoot, 'CrateOverviewPage.astro'),
  );

  return formatGeneratedContent(
    `---\ntitle: ${JSON.stringify(entry.name)}\ndescription: ${JSON.stringify(entry.description)}\n---\n\nimport CrateOverviewPage from '${componentImport}';\n\n<CrateOverviewPage crateName=${JSON.stringify(entry.name)} />\n`,
    'mdx',
  );
}

async function writeGeneratedPage(entry, setConfig) {
  const pageDir = path.join(contentRoot, setConfig.pageDir);

  const pagePath =
    entry.name === setConfig.facadeCrate
      ? path.join(pageDir, 'index.mdx')
      : path.join(pageDir, `${entry.name}.mdx`);

  await writeGeneratedPageIfSafe(
    pagePath,
    await buildGeneratedPage(entry, setConfig),
  );
}

async function buildGeneratedSetPage(setEntry) {
  const pageDir = path.join(contentRoot, 'sets');
  const componentImport = relativeImportPath(
    pageDir,
    path.join(componentsRoot, 'SetOverviewPage.astro'),
  );

  return formatGeneratedContent(
    `---\ntitle: ${JSON.stringify(setEntry.name)}\ndescription: ${JSON.stringify(setEntry.description)}\n---\n\nimport SetOverviewPage from '${componentImport}';\n\n<SetOverviewPage setName=${JSON.stringify(setEntry.name)} />\n`,
    'mdx',
  );
}

async function writeGeneratedSetPage(setEntry) {
  const pageDir = path.join(contentRoot, 'sets');

  await writeGeneratedPageIfSafe(
    path.join(pageDir, `${setEntry.name}.mdx`),
    await buildGeneratedSetPage(setEntry),
  );
}

function isGeneratedOverviewPage(content) {
  const normalized = content.replace(/\r\n/g, '\n').trim();
  const frontmatterMatch = /^---\n[\s\S]*?\n---\n\n/.exec(normalized);

  if (!frontmatterMatch) {
    return false;
  }

  const body = normalized.slice(frontmatterMatch[0].length).trim();

  return (
    /^import CrateOverviewPage from ['"][^'"]+['"];\n\n<CrateOverviewPage crateName=['"][^'"]+['"] \/>$/.test(
      body,
    ) ||
    /^import SetOverviewPage from ['"][^'"]+['"];\n\n<SetOverviewPage setName=['"][^'"]+['"] \/>$/.test(
      body,
    )
  );
}

async function writeGeneratedPageIfSafe(pagePath, content) {
  if (existsSync(pagePath)) {
    const existingContent = readFileSync(pagePath, 'utf8');

    if (!isGeneratedOverviewPage(existingContent)) {
      return;
    }
  }

  mkdirSync(path.dirname(pagePath), { recursive: true });
  writeFileSync(pagePath, content);
}

function buildRustdocSources(rustdocSourceRecords) {
  return {
    sources: rustdocSourceRecords.map(({ entries, setConfig }) => ({
      name: setConfig.name,
      path: setConfig.sourcePath,
      repo: setConfig.repo,
      bundleSlug: setConfig.bundleSlug,
      publishedCrates: entries
        .filter((crate) => crate.status === 'published')
        .map((crate) => crate.name),
    })),
  };
}

rmSync(setWorkspaceTempRoot, { recursive: true, force: true });
mkdirSync(setWorkspaceTempRoot, { recursive: true });

try {
  const setWorkspaceRecords = setConfigs.map((setConfig) =>
    readSetWorkspaceRecord(setConfig),
  );
  const publicationStatusByPackageId =
    await buildPublicationStatusByPackageId(setWorkspaceRecords);
  const sets = [];
  const crates = [];
  const rustdocSourceRecords = [];

  for (const setWorkspaceRecord of setWorkspaceRecords) {
    const { packages, setConfig } = setWorkspaceRecord;
    const hasGeneratedApi = packages.every(
      (pkg) => publicationStatusByPackageId.get(pkg.id)?.status === 'published',
    );
    const entries = packages.map((pkg) =>
      buildCatalogEntry(
        setConfig,
        pkg,
        publicationStatusByPackageId.get(pkg.id),
        hasGeneratedApi,
      ),
    );
    const facadeEntry = entries.find(
      (entry) => entry.name === setConfig.facadeCrate,
    );

    if (!facadeEntry) {
      fail(
        `No facade package named ${setConfig.facadeCrate} found in ${setConfig.name}.`,
      );
    }

    const setEntry = buildSetCatalogEntry(
      setConfig,
      facadeEntry,
      hasGeneratedApi,
    );

    sets.push(setEntry);
    crates.push(...entries);

    if (hasGeneratedApi) {
      rustdocSourceRecords.push({ entries, setConfig });
    }

    await writeGeneratedSetPage(setEntry);

    for (const entry of entries) {
      await writeGeneratedPage(entry, setConfig);
    }
  }

  writeFileSync(
    catalogOutputPath,
    await formatGeneratedContent(
      buildGeneratedCatalogModule(sets, crates),
      'babel',
    ),
  );
  writeFileSync(
    rustdocSourcesPath,
    await formatGeneratedContent(
      JSON.stringify(buildRustdocSources(rustdocSourceRecords), null, 2),
      'json',
    ),
  );
} finally {
  rmSync(setWorkspaceTempRoot, { recursive: true, force: true });
}
