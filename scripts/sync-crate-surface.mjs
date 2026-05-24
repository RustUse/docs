import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { format, resolveConfig } from 'prettier';

const docsRoot = process.cwd();
const srcRoot = path.join(docsRoot, 'src');
const dataRoot = path.join(srcRoot, 'data');
const contentRoot = path.join(srcRoot, 'content', 'docs');
const componentsRoot = path.join(srcRoot, 'components');
const cratesIoBaseUrl = 'https://crates.io/crates';
const docsRsBaseUrl = 'https://docs.rs';
const catalogOutputPath = path.join(dataRoot, 'catalog.generated.js');
const rustdocSourcesPath = path.join(docsRoot, 'docs', 'rustdoc-sources.json');
const prettierOptions =
  (await resolveConfig(path.join(docsRoot, '.prettierrc.json'))) ?? {};

const detailedSetConfigs = [
  {
    name: 'use-math',
    hasGeneratedApi: true,
    bundleSlug: 'workspaces/use-math',
    facadeCrate: 'use-math',
    manualPages: new Set(['use-math', 'use-combinatorics', 'use-collatz']),
    pageDir: 'use-math',
    repo: 'https://github.com/RustUse/use-math',
    setPath: '/sets/use-math/',
    sourcePath: '../use-math',
    workspacePath: path.resolve(docsRoot, '../use-math'),
  },
  {
    name: 'use-geometry',
    hasGeneratedApi: true,
    bundleSlug: 'workspaces/use-geometry',
    facadeCrate: 'use-geometry',
    manualPages: new Set(['use-geometry']),
    pageDir: 'use-geometry',
    repo: 'https://github.com/RustUse/use-geometry',
    setPath: '/sets/use-geometry/',
    sourcePath: '../use-geometry',
    workspacePath: path.resolve(docsRoot, '../use-geometry'),
  },
];

const rustuseSetNames = [
  'use-accessibility',
  'use-acoustics',
  'use-astronomy',
  'use-bioinformatics',
  'use-biology',
  'use-calendar',
  'use-chemistry',
  'use-cli',
  'use-color',
  'use-config',
  'use-constants',
  'use-control',
  'use-data',
  'use-diagnostic',
  'use-ecology',
  'use-electronics',
  'use-encoding',
  'use-fs',
  'use-geography',
  'use-geology',
  'use-geometry',
  'use-graph',
  'use-id',
  'use-locale',
  'use-materials',
  'use-math',
  'use-measure',
  'use-media',
  'use-meteorology',
  'use-net',
  'use-optics',
  'use-optimization',
  'use-os',
  'use-pattern',
  'use-physics',
  'use-presence',
  'use-quant',
  'use-robotics',
  'use-rust',
  'use-rustacean',
  'use-signal',
  'use-simulation',
  'use-stats',
  'use-text',
  'use-time',
  'use-typography',
  'use-units',
  'use-validate',
  'use-wave',
  'use-web',
];

const manualSetPages = new Set(['use-geometry', 'use-math']);
const detailedSetConfigsByName = new Map(
  detailedSetConfigs.map((setConfig) => [setConfig.name, setConfig]),
);

function buildSetConfig(setName) {
  const detailedSetConfig = detailedSetConfigsByName.get(setName);

  return {
    name: setName,
    hasGeneratedApi: detailedSetConfig?.hasGeneratedApi ?? false,
    bundleSlug: detailedSetConfig?.bundleSlug ?? `workspaces/${setName}`,
    facadeCrate: detailedSetConfig?.facadeCrate ?? setName,
    manualPages: detailedSetConfig?.manualPages ?? new Set(),
    pageDir: detailedSetConfig?.pageDir ?? setName,
    repo: detailedSetConfig?.repo ?? `https://github.com/RustUse/${setName}`,
    setPath: detailedSetConfig?.setPath ?? `/sets/${setName}/`,
    sourcePath: detailedSetConfig?.sourcePath ?? `../${setName}`,
    workspacePath:
      detailedSetConfig?.workspacePath ??
      path.resolve(docsRoot, `../${setName}`),
  };
}

const setConfigs = rustuseSetNames.map((setName) => buildSetConfig(setName));
const setConfigsByName = new Map(
  setConfigs.map((setConfig) => [setConfig.name, setConfig]),
);
const rustdocSetConfigs = setConfigs.filter(
  (setConfig) => setConfig.hasGeneratedApi,
);
const manualFacadePages = new Set(
  setConfigs
    .filter((setConfig) => setConfig.manualPages.has(setConfig.facadeCrate))
    .map((setConfig) => setConfig.facadeCrate),
);

const crateOverrides = {
  'use-geometry': {
    'use-complex': {
      apiPath: '/api/workspaces/use-geometry/use_complex/',
      cratesIoUrl: null,
      docsRsUrl: null,
      docsUrl: '/api/workspaces/use-geometry/use_complex/',
      status: 'scaffolded',
    },
  },
};

function cargoMetadata(workspacePath) {
  return JSON.parse(
    execFileSync('cargo', ['metadata', '--format-version', '1', '--no-deps'], {
      cwd: workspacePath,
      encoding: 'utf8',
    }),
  );
}

function hasWorkspaceManifest(setConfig) {
  return existsSync(path.join(setConfig.workspacePath, 'Cargo.toml'));
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

function buildSetCatalogEntry(setName) {
  const setConfig = setConfigsByName.get(setName);
  const workspaceApiPath = setConfig?.hasGeneratedApi
    ? `/${setConfig.bundleSlug}/`.replace('/workspaces/', '/api/workspaces/')
    : undefined;

  return {
    name: setName,
    setPath: `/sets/${setName}/`,
    status: 'published',
    description: `RustUse ${formatSetLabel(setName)} utilities and facade surface.`,
    repositoryUrl: `https://github.com/RustUse/${setName}`,
    cratesIoUrl: `${cratesIoBaseUrl}/${setName}`,
    docsRsUrl: `${docsRsBaseUrl}/${setName}`,
    ...(workspaceApiPath ? { workspaceApiPath } : {}),
  };
}

function buildFacadeTags(setName) {
  const labelWords = formatSetLabel(setName).split(' ').filter(Boolean);

  return [...new Set([labelWords[0] ?? 'rustuse', 'facade', 'rustuse'])];
}

function buildFacadeCrateCatalogEntry(setEntry, setConfig) {
  const docsUrl = setConfig?.hasGeneratedApi
    ? `/api/${setEntry.name}/`
    : undefined;

  return {
    name: setEntry.name,
    packageName: setEntry.name,
    set: setEntry.name,
    setPath: setEntry.setPath,
    status: setEntry.status,
    description: `Facade crate for the RustUse ${formatSetLabel(setEntry.name)} set.`,
    repositoryUrl: setEntry.repositoryUrl,
    cratesIoUrl: setEntry.cratesIoUrl,
    docsUrl,
    docsRsUrl: setEntry.docsRsUrl,
    apiPath: docsUrl,
    pagePath: `/${setEntry.name}/`,
    tags: buildFacadeTags(setEntry.name),
    public: true,
  };
}

function buildCatalogEntry(setConfig, pkg) {
  const override = crateOverrides[setConfig.name]?.[pkg.name] ?? {};
  const isFacade = pkg.name === setConfig.facadeCrate;
  const defaultDocsUrl = setConfig.hasGeneratedApi
    ? `/api/${pkg.name}/`
    : undefined;
  const docsUrl =
    override.docsUrl === null
      ? undefined
      : (override.docsUrl ?? defaultDocsUrl);
  const apiPath =
    override.apiPath === null ? undefined : (override.apiPath ?? docsUrl);
  const status = override.status ?? 'published';
  const published = status === 'published';

  return {
    name: pkg.name,
    packageName: pkg.name,
    set: setConfig.name,
    setPath: setConfig.setPath,
    status,
    description: pkg.description,
    repositoryUrl: setConfig.repo,
    cratesIoUrl:
      override.cratesIoUrl === null
        ? undefined
        : (override.cratesIoUrl ??
          (published ? `${cratesIoBaseUrl}/${pkg.name}` : undefined)),
    docsUrl,
    docsRsUrl:
      override.docsRsUrl === null
        ? undefined
        : (override.docsRsUrl ??
          (published ? `${docsRsBaseUrl}/${pkg.name}` : undefined)),
    apiPath,
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
  if (setConfig.manualPages.has(entry.name)) {
    return;
  }

  const pageDir = path.join(contentRoot, setConfig.pageDir);
  mkdirSync(pageDir, { recursive: true });

  const pagePath =
    entry.name === setConfig.facadeCrate
      ? path.join(pageDir, 'index.mdx')
      : path.join(pageDir, `${entry.name}.mdx`);

  writeFileSync(pagePath, await buildGeneratedPage(entry, setConfig));
}

async function buildGeneratedFacadePage(entry) {
  const pageDir = path.join(contentRoot, entry.name);
  const componentImport = relativeImportPath(
    pageDir,
    path.join(componentsRoot, 'CrateOverviewPage.astro'),
  );

  return formatGeneratedContent(
    `---\ntitle: ${JSON.stringify(entry.name)}\ndescription: ${JSON.stringify(entry.description)}\n---\n\nimport CrateOverviewPage from '${componentImport}';\n\n<CrateOverviewPage crateName=${JSON.stringify(entry.name)} />\n`,
    'mdx',
  );
}

async function writeGeneratedFacadePage(entry) {
  if (manualFacadePages.has(entry.name)) {
    return;
  }

  const pageDir = path.join(contentRoot, entry.name);
  mkdirSync(pageDir, { recursive: true });

  writeFileSync(
    path.join(pageDir, 'index.mdx'),
    await buildGeneratedFacadePage(entry),
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
  if (manualSetPages.has(setEntry.name)) {
    return;
  }

  const pageDir = path.join(contentRoot, 'sets');
  mkdirSync(pageDir, { recursive: true });

  writeFileSync(
    path.join(pageDir, `${setEntry.name}.mdx`),
    await buildGeneratedSetPage(setEntry),
  );
}

function buildRustdocSources(cratesBySet) {
  return {
    sources: rustdocSetConfigs.map((setConfig) => ({
      name: setConfig.name,
      path: setConfig.sourcePath,
      repo: setConfig.repo,
      bundleSlug: setConfig.bundleSlug,
      publishedCrates: cratesBySet
        .get(setConfig.name)
        .filter((crate) => crate.status === 'published')
        .map((crate) => crate.name),
    })),
  };
}

const sets = rustuseSetNames.map((setName) => buildSetCatalogEntry(setName));
const crates = [];
const cratesBySet = new Map();

for (const setEntry of sets) {
  await writeGeneratedSetPage(setEntry);

  const setConfig = setConfigsByName.get(setEntry.name);

  if (setConfig && hasWorkspaceManifest(setConfig)) {
    continue;
  }

  const facadeEntry = buildFacadeCrateCatalogEntry(setEntry, setConfig);
  cratesBySet.set(setEntry.name, [facadeEntry]);
  crates.push(facadeEntry);
  await writeGeneratedFacadePage(facadeEntry);
}

for (const setConfig of setConfigs) {
  if (!hasWorkspaceManifest(setConfig)) {
    continue;
  }

  const metadata = cargoMetadata(setConfig.workspacePath);
  const workspaceIndex = new Map(
    metadata.workspace_members.map((packageId, index) => [packageId, index]),
  );
  const packages = metadata.packages
    .slice()
    .filter((pkg) => workspaceIndex.has(pkg.id))
    .sort(
      (left, right) =>
        (workspaceIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (workspaceIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER),
    );
  const entries = packages.map((pkg) => buildCatalogEntry(setConfig, pkg));

  cratesBySet.set(setConfig.name, entries);
  crates.push(...entries);

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
    JSON.stringify(buildRustdocSources(cratesBySet), null, 2),
    'json',
  ),
);
