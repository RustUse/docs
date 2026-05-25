import { readFileSync } from 'node:fs';
import path from 'node:path';

function readRustdocSources(repoRoot) {
  const rustdocSourcesPath = path.join(
    repoRoot,
    'docs',
    'rustdoc-sources.json',
  );
  return JSON.parse(readFileSync(rustdocSourcesPath, 'utf8'));
}

export function validateSourceArtifact(text, expectedCrateName) {
  const artifact = JSON.parse(text);

  if (artifact?.crateName !== expectedCrateName) {
    throw new Error(
      `Expected crateName to be "${expectedCrateName}", received "${artifact?.crateName}".`,
    );
  }

  if (typeof artifact.bundle !== 'string' || artifact.bundle.length === 0) {
    throw new Error('Expected a non-empty bundle string.');
  }

  if (!Array.isArray(artifact.files) || artifact.files.length === 0) {
    throw new Error('Expected at least one bundled source file.');
  }

  for (const file of artifact.files) {
    if (typeof file?.path !== 'string' || file.path.length === 0) {
      throw new Error('Expected each bundled file to have a path.');
    }

    if (typeof file?.content !== 'string') {
      throw new Error(
        `Expected bundled file "${file.path}" to have string content.`,
      );
    }

    if (file.language !== 'rust' && file.language !== 'toml') {
      throw new Error(
        `Expected bundled file "${file.path}" to have a supported language.`,
      );
    }
  }

  return artifact;
}

export function getSmokeChecks(repoRoot) {
  const siteChecks = [
    {
      contentType: 'text/html',
      distPath: '404.html',
      mustInclude: ['404'],
      route: '/404.html',
    },
    {
      contentType: 'text/html',
      distPath: 'index.html',
      mustInclude: ['RustUse'],
      route: '/',
    },
    {
      contentType: 'text/plain',
      distPath: 'llms.txt',
      mustExclude: ['<!-- BEGIN GENERATED RUSTUSE CRATES -->'],
      mustInclude: [
        '# RustUse',
        '<!-- BEGIN GENERATED RUSTUSE SETS -->',
        'https://rustuse.org/llms-full.txt',
      ],
      route: '/llms.txt',
    },
    {
      contentType: 'text/plain',
      distPath: 'llms-full.txt',
      mustInclude: [
        '<!-- BEGIN GENERATED RUSTUSE SETS -->',
        '<!-- BEGIN GENERATED RUSTUSE CRATES -->',
        'child crate of use-math',
      ],
      route: '/llms-full.txt',
    },
    {
      contentType: 'text/html',
      distPath: 'contributing/index.html',
      mustInclude: ['Contributing'],
      route: '/contributing/',
    },
    {
      contentType: 'text/html',
      distPath: 'crates/index.html',
      mustInclude: ['Crates'],
      route: '/crates/',
    },
    {
      contentType: 'text/html',
      distPath: 'onboarding/index.html',
      mustInclude: ['Onboarding'],
      route: '/onboarding/',
    },
    {
      contentType: 'text/html',
      distPath: 'sets/index.html',
      mustInclude: ['Sets'],
      route: '/sets/',
    },
    {
      contentType: 'text/html',
      distPath: 'sets/use-math/index.html',
      mustInclude: ['use-math'],
      route: '/sets/use-math/',
    },
    {
      contentType: 'text/html',
      distPath: 'sets/use-geometry/index.html',
      mustInclude: ['use-geometry'],
      route: '/sets/use-geometry/',
    },
    {
      contentType: 'text/html',
      distPath: 'use-math/index.html',
      mustInclude: ['Copy full crate'],
      route: '/use-math/',
    },
    {
      contentType: 'text/plain',
      distPath: 'use-math/llms.txt',
      mustInclude: [
        '# use-math',
        'https://rustuse.org/use-math/llms-full.txt',
        '<!-- BEGIN GENERATED RUSTUSE CRATES -->',
      ],
      route: '/use-math/llms.txt',
    },
    {
      contentType: 'text/plain',
      distPath: 'use-math/llms-full.txt',
      mustInclude: [
        'Expanded LLM context for the RustUse math set.',
        'https://rustuse.org/api/workspaces/use-math/',
        'child crate of use-math',
      ],
      route: '/use-math/llms-full.txt',
    },
    {
      contentType: 'text/html',
      distPath: 'use-math/use-combinatorics/index.html',
      mustInclude: ['Copy full crate'],
      route: '/use-math/use-combinatorics/',
    },
    {
      contentType: 'text/html',
      distPath: 'use-geometry/index.html',
      mustInclude: ['Copy full crate'],
      route: '/use-geometry/',
    },
    {
      contentType: 'text/plain',
      distPath: 'sets/use-math/llms.txt',
      mustInclude: [
        '# use-math',
        'https://rustuse.org/use-math/llms-full.txt',
        '<!-- BEGIN GENERATED RUSTUSE CRATES -->',
      ],
      route: '/sets/use-math/llms.txt',
    },
    {
      contentType: 'text/plain',
      distPath: 'sets/use-math/llms-full.txt',
      mustInclude: [
        'Expanded LLM context for the RustUse math set.',
        'https://rustuse.org/api/workspaces/use-math/',
        'child crate of use-math',
      ],
      route: '/sets/use-math/llms-full.txt',
    },
    {
      contentType: 'xml',
      distPath: 'sitemap-index.xml',
      mustInclude: ['sitemap'],
      route: '/sitemap-index.xml',
    },
  ];

  const apiChecks = [
    {
      contentType: 'text/css',
      distPath: 'api/rustuse-rustdoc-shell.css',
      mustInclude: ['ru-rustdoc-shell'],
      route: '/api/rustuse-rustdoc-shell.css',
    },
  ];

  const rustdocSources = readRustdocSources(repoRoot);
  for (const source of rustdocSources.sources ?? []) {
    apiChecks.push({
      contentType: 'text/html',
      distPath: path.posix.join('api', source.bundleSlug, 'index.html'),
      mustInclude: [`${source.name} Workspace Rustdocs`],
      route: `/${path.posix.join('api', source.bundleSlug)}/`,
    });
    apiChecks.push({
      contentType: 'text/css',
      distPath: path.posix.join('api', source.bundleSlug, 'theme.css'),
      route: `/${path.posix.join('api', source.bundleSlug, 'theme.css')}`,
    });

    for (const crateName of source.publishedCrates ?? []) {
      apiChecks.push({
        contentType: 'text/html',
        distPath: path.posix.join('api', crateName, 'index.html'),
        mustInclude: [`${crateName} API Docs`],
        route: `/${path.posix.join('api', crateName)}/`,
      });
      apiChecks.push({
        contentType: 'application/json',
        distPath: path.posix.join('api', crateName, 'rustuse-source.json'),
        route: `/${path.posix.join('api', crateName, 'rustuse-source.json')}`,
        sourceArtifact: crateName,
      });
    }
  }

  return [...siteChecks, ...apiChecks];
}
