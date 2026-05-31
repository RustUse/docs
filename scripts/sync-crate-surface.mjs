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
const facadeWorkspaceTempRoot = path.join(
  os.tmpdir(),
  `rustuse-facade-workspaces-${process.pid}`,
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

function featureNameToFacadeName(featureName, sourceLabel) {
  if (
    typeof featureName !== 'string' ||
    featureName.startsWith('dep:') ||
    featureName.includes('/')
  ) {
    fail(
      `Unsupported rustuse full feature "${featureName}" in ${sourceLabel}.`,
    );
  }

  const facadeName = featureName.startsWith('use-')
    ? featureName
    : `use-${featureName}`;

  if (!/^use-[a-z0-9][a-z0-9-]*$/.test(facadeName)) {
    fail(
      `Unsupported RustUse facade name "${facadeName}" from ${sourceLabel}.`,
    );
  }

  return facadeName;
}

function featureNamesToFacadeNames(featureNames, sourceLabel) {
  const facadeNames = featureNames.map((featureName) =>
    featureNameToFacadeName(featureName, sourceLabel),
  );
  const uniqueFacadeNames = new Set(facadeNames);

  if (uniqueFacadeNames.size !== facadeNames.length) {
    fail(`Duplicate RustUse facade feature found in ${sourceLabel}.`);
  }

  return facadeNames;
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

  console.log(`Cloning RustUse facade inventory source: ${rustuseRepoUrl}`);
  execFileSync('git', ['clone', '--depth', '1', rustuseRepoUrl, workingDir], {
    cwd: docsRoot,
    stdio: 'inherit',
  });

  return {
    manifestPath: path.join(workingDir, 'Cargo.toml'),
    tempRoot,
  };
}

function discoverRustuseFacadeNamesFromManifest(manifestPath, sourceLabel) {
  try {
    return featureNamesToFacadeNames(
      extractFullFeatureNamesFromMetadata(
        cargoMetadataForManifest(manifestPath),
        sourceLabel,
      ),
      sourceLabel,
    );
  } catch {
    console.warn(
      `Unable to read rustuse facade inventory with cargo metadata from ${sourceLabel}; falling back to manifest parsing.`,
    );

    return featureNamesToFacadeNames(
      extractFullFeatureNamesFromManifest(
        readFileSync(manifestPath, 'utf8'),
        sourceLabel,
      ),
      sourceLabel,
    );
  }
}

function discoverRustuseFacadeNames() {
  if (existsSync(rustuseManifestPath)) {
    return discoverRustuseFacadeNamesFromManifest(
      rustuseManifestPath,
      rustuseManifestPath,
    );
  }

  const clonedSource = cloneRustuseSource();

  try {
    return discoverRustuseFacadeNamesFromManifest(
      clonedSource.manifestPath,
      rustuseRepoUrl,
    );
  } finally {
    rmSync(clonedSource.tempRoot, { recursive: true, force: true });
  }
}

const rustuseFacadeNames = discoverRustuseFacadeNames();

function buildFacadeConfig(facadeName) {
  return {
    name: facadeName,
    bundleSlug: `workspaces/${facadeName}`,
    facadeCrate: facadeName,
    pageDir: facadeName,
    repo: `https://github.com/RustUse/${facadeName}`,
    facadePath: `/facades/${facadeName}/`,
    sourcePath: `../${facadeName}`,
    workspacePath: path.resolve(docsRoot, `../${facadeName}`),
  };
}

const facadeConfigs = rustuseFacadeNames.map((facadeName) =>
  buildFacadeConfig(facadeName),
);

function cloneFacadeWorkspace(facadeConfig) {
  const workingDir = path.join(facadeWorkspaceTempRoot, facadeConfig.name);

  console.log(`Cloning RustUse facade workspace source: ${facadeConfig.repo}`);
  execFileSync(
    'git',
    ['clone', '--depth', '1', facadeConfig.repo, workingDir],
    {
      cwd: docsRoot,
      stdio: 'inherit',
    },
  );

  return workingDir;
}

function resolveFacadeWorkspacePath(facadeConfig) {
  if (existsSync(path.join(facadeConfig.workspacePath, 'Cargo.toml'))) {
    return facadeConfig.workspacePath;
  }

  return cloneFacadeWorkspace(facadeConfig);
}

function isPublishablePackage(pkg) {
  if (!pkg.name.startsWith('use-')) {
    return false;
  }

  return !Array.isArray(pkg.publish) || pkg.publish.length > 0;
}

function packageRepositoryUrl(pkg, facadeConfig) {
  return pkg.repository ?? facadeConfig.repo;
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

function readFacadeWorkspaceRecord(facadeConfig) {
  const workspacePath = resolveFacadeWorkspacePath(facadeConfig);
  const metadata = cargoMetadata(workspacePath);
  const packages = workspacePackages(metadata);

  if (packages.length === 0) {
    fail(`No publishable use-* packages found for ${facadeConfig.name}.`);
  }

  return {
    metadata,
    packages,
    facadeConfig: {
      ...facadeConfig,
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

function formatFacadeLabel(facadeName) {
  return facadeName.replace(/^use-/, '').replace(/-/g, ' ');
}

async function resolvePublicationStatus(pkg, facadeConfig) {
  const crateRecord = await fetchCratesIoCrate(pkg.name);
  const repositoryUrl = packageRepositoryUrl(pkg, facadeConfig);
  const published = repositoryUrlsMatch(crateRecord?.repository, repositoryUrl);

  return {
    repositoryUrl,
    status: published ? 'published' : 'scaffolded',
  };
}

async function buildPublicationStatusByPackageId(facadeWorkspaceRecords) {
  const packageRefs = facadeWorkspaceRecords.flatMap((facadeWorkspaceRecord) =>
    facadeWorkspaceRecord.packages.map((pkg) => ({
      pkg,
      facadeConfig: facadeWorkspaceRecord.facadeConfig,
    })),
  );
  const statusEntries = await mapWithConcurrency(
    packageRefs,
    cratesIoRequestConcurrency,
    async ({ pkg, facadeConfig }) => [
      pkg.id,
      await resolvePublicationStatus(pkg, facadeConfig),
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

function buildFacadeCatalogEntry(facadeConfig, facadeEntry, hasGeneratedApi) {
  const published = facadeEntry.status === 'published';
  const workspaceApiPath = hasGeneratedApi
    ? `/${facadeConfig.bundleSlug}/`.replace('/workspaces/', '/api/workspaces/')
    : undefined;

  return {
    name: facadeConfig.name,
    facadePath: facadeConfig.facadePath,
    status: facadeEntry.status,
    description: `RustUse ${formatFacadeLabel(facadeConfig.name)} utilities and facade surface.`,
    repositoryUrl: facadeConfig.repo,
    cratesIoUrl: published
      ? `${cratesIoBaseUrl}/${facadeConfig.name}`
      : undefined,
    docsRsUrl: published ? `${docsRsBaseUrl}/${facadeConfig.name}` : undefined,
    ...(workspaceApiPath ? { workspaceApiPath } : {}),
  };
}

function buildCatalogEntry(facadeConfig, pkg, statusInfo, hasGeneratedApi) {
  const isFacade = pkg.name === facadeConfig.facadeCrate;
  const status = statusInfo.status;
  const published = status === 'published';
  const docsUrl =
    published && hasGeneratedApi ? `/api/${pkg.name}/` : undefined;

  return {
    name: pkg.name,
    packageName: pkg.name,
    facade: facadeConfig.name,
    facadePath: facadeConfig.facadePath,
    status,
    description:
      pkg.description ??
      `RustUse ${formatFacadeLabel(facadeConfig.name)} ${isFacade ? 'facade' : 'focused'} crate.`,
    repositoryUrl: statusInfo.repositoryUrl,
    cratesIoUrl: published ? `${cratesIoBaseUrl}/${pkg.name}` : undefined,
    docsUrl,
    docsRsUrl: published ? `${docsRsBaseUrl}/${pkg.name}` : undefined,
    apiPath: docsUrl,
    pagePath: isFacade
      ? `/${facadeConfig.pageDir}/`
      : `/${facadeConfig.pageDir}/${pkg.name}/`,
    tags: buildTags(pkg),
    public: true,
  };
}

function buildGeneratedCatalogModule(facades, crates) {
  return `// This file is generated by scripts/sync-crate-surface.mjs. Do not edit by hand.\n\nexport const rustuseFacades = ${JSON.stringify(facades, null, 2)};\n\nexport const rustuseCrates = ${JSON.stringify(crates, null, 2)};\n`;
}

async function formatGeneratedContent(content, parser) {
  return format(content, {
    ...prettierOptions,
    parser,
  });
}

async function buildGeneratedPage(entry, facadeConfig) {
  const pageDir = path.join(contentRoot, facadeConfig.pageDir);
  const componentImport = relativeImportPath(
    pageDir,
    path.join(componentsRoot, 'CrateOverviewPage.astro'),
  );

  return formatGeneratedContent(
    `---\ntitle: ${JSON.stringify(entry.name)}\ndescription: ${JSON.stringify(entry.description)}\n---\n\nimport CrateOverviewPage from '${componentImport}';\n\n<CrateOverviewPage crateName=${JSON.stringify(entry.name)} />\n`,
    'mdx',
  );
}

async function writeGeneratedPage(entry, facadeConfig) {
  const pageDir = path.join(contentRoot, facadeConfig.pageDir);

  const pagePath =
    entry.name === facadeConfig.facadeCrate
      ? path.join(pageDir, 'index.mdx')
      : path.join(pageDir, `${entry.name}.mdx`);

  await writeGeneratedPageIfSafe(
    pagePath,
    await buildGeneratedPage(entry, facadeConfig),
  );
}

async function buildGeneratedFacadePage(facadeEntry) {
  const pageDir = path.join(contentRoot, 'facades');
  const componentImport = relativeImportPath(
    pageDir,
    path.join(componentsRoot, 'FacadeOverviewPage.astro'),
  );

  return formatGeneratedContent(
    `---\ntitle: ${JSON.stringify(facadeEntry.name)}\ndescription: ${JSON.stringify(facadeEntry.description)}\n---\n\nimport FacadeOverviewPage from '${componentImport}';\n\n<FacadeOverviewPage facadeName=${JSON.stringify(facadeEntry.name)} />\n`,
    'mdx',
  );
}

async function writeGeneratedFacadePage(facadeEntry) {
  const pageDir = path.join(contentRoot, 'facades');

  await writeGeneratedPageIfSafe(
    path.join(pageDir, `${facadeEntry.name}.mdx`),
    await buildGeneratedFacadePage(facadeEntry),
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
    /^import FacadeOverviewPage from ['"][^'"]+['"];\n\n<FacadeOverviewPage facadeName=['"][^'"]+['"] \/>$/.test(
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
    sources: rustdocSourceRecords.map(({ entries, facadeConfig }) => ({
      name: facadeConfig.name,
      path: facadeConfig.sourcePath,
      repo: facadeConfig.repo,
      bundleSlug: facadeConfig.bundleSlug,
      publishedCrates: entries
        .filter((crate) => crate.status === 'published')
        .map((crate) => crate.name),
    })),
  };
}

rmSync(facadeWorkspaceTempRoot, { recursive: true, force: true });
mkdirSync(facadeWorkspaceTempRoot, { recursive: true });

try {
  const facadeWorkspaceRecords = facadeConfigs.map((facadeConfig) =>
    readFacadeWorkspaceRecord(facadeConfig),
  );
  const publicationStatusByPackageId = await buildPublicationStatusByPackageId(
    facadeWorkspaceRecords,
  );
  const facades = [];
  const crates = [];
  const rustdocSourceRecords = [];

  for (const facadeWorkspaceRecord of facadeWorkspaceRecords) {
    const { packages, facadeConfig } = facadeWorkspaceRecord;
    const hasGeneratedApi = packages.every(
      (pkg) => publicationStatusByPackageId.get(pkg.id)?.status === 'published',
    );
    const entries = packages.map((pkg) =>
      buildCatalogEntry(
        facadeConfig,
        pkg,
        publicationStatusByPackageId.get(pkg.id),
        hasGeneratedApi,
      ),
    );
    const facadeEntry = entries.find(
      (entry) => entry.name === facadeConfig.facadeCrate,
    );

    if (!facadeEntry) {
      fail(
        `No facade package named ${facadeConfig.facadeCrate} found in ${facadeConfig.name}.`,
      );
    }

    const facadeCatalogEntry = buildFacadeCatalogEntry(
      facadeConfig,
      facadeEntry,
      hasGeneratedApi,
    );

    facades.push(facadeCatalogEntry);
    crates.push(...entries);

    if (hasGeneratedApi) {
      rustdocSourceRecords.push({ entries, facadeConfig });
    }

    await writeGeneratedFacadePage(facadeCatalogEntry);

    for (const entry of entries) {
      await writeGeneratedPage(entry, facadeConfig);
    }
  }

  writeFileSync(
    catalogOutputPath,
    await formatGeneratedContent(
      buildGeneratedCatalogModule(facades, crates),
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
  rmSync(facadeWorkspaceTempRoot, { recursive: true, force: true });
}
