import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const configPath = path.join(repoRoot, 'docs', 'rustdoc-sources.json');
const apiRoot = path.join(repoRoot, 'public', 'api');
const rustdocExtendCssPath = path.join(
  repoRoot,
  'src',
  'styles',
  'rustdoc-extend.css',
);
const rustdocShellCssPath = path.join(
  repoRoot,
  'src',
  'styles',
  'rustdoc-shell.css',
);
const rustdocShellCssFileName = 'rustuse-rustdoc-shell.css';
const rustdocThemeCssFileName = 'theme.css';
const sourceArtifactFileName = 'rustuse-source.json';
const cargoFlagSeparator = '\u001f';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function normalizeApiSlug(value, fieldName) {
  if (typeof value !== 'string') {
    fail(`Rustdoc source field "${fieldName}" must be a string.`);
  }

  const normalized = value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!normalized) {
    fail(`Rustdoc source field "${fieldName}" cannot be empty.`);
  }

  if (
    normalized
      .split('/')
      .some(
        (segment) =>
          segment === '.' || segment === '..' || segment.length === 0,
      )
  ) {
    fail(
      `Rustdoc source field "${fieldName}" must be a safe relative API path.`,
    );
  }

  return normalized;
}

function crateDocDir(crateName) {
  return crateName.replace(/-/g, '_');
}

function readJsonCommandOutput(command, args, cwd, extraEnv = {}) {
  return JSON.parse(
    execFileSync(command, args, {
      cwd,
      env: {
        ...process.env,
        ...extraEnv,
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
  );
}

function collectRustSourcePaths(crateRootDir, relativeDir) {
  const directory = path.join(crateRootDir, relativeDir);
  const entries = readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  const paths = [];

  for (const entry of entries) {
    const entryRelativePath = path
      .join(relativeDir, entry.name)
      .replace(/\\/g, '/');

    if (entry.isDirectory()) {
      paths.push(...collectRustSourcePaths(crateRootDir, entryRelativePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.rs')) {
      paths.push(entryRelativePath);
    }
  }

  return paths;
}

function sourcePathSortKey(filePath) {
  switch (filePath) {
    case 'Cargo.toml':
      return '0:Cargo.toml';
    case 'build.rs':
      return '1:build.rs';
    case 'src/lib.rs':
      return '2:src/lib.rs';
    case 'src/main.rs':
      return '3:src/main.rs';
    default:
      return `4:${filePath}`;
  }
}

function collectCrateSourceFiles(crateRootDir) {
  const candidatePaths = [];

  for (const fileName of ['Cargo.toml', 'build.rs']) {
    const filePath = path.join(crateRootDir, fileName);
    if (existsSync(filePath)) {
      candidatePaths.push(fileName);
    }
  }

  for (const directoryName of ['src', 'examples', 'tests', 'benches']) {
    const directoryPath = path.join(crateRootDir, directoryName);
    if (existsSync(directoryPath)) {
      candidatePaths.push(
        ...collectRustSourcePaths(crateRootDir, directoryName),
      );
    }
  }

  return [...new Set(candidatePaths)]
    .sort((left, right) =>
      sourcePathSortKey(left).localeCompare(sourcePathSortKey(right)),
    )
    .map((filePath) => ({
      content: readFileSync(path.join(crateRootDir, filePath), 'utf8'),
      language: filePath.endsWith('.toml') ? 'toml' : 'rust',
      path: filePath,
    }));
}

function renderCrateSourceBundle(crateName, files) {
  const sections = [
    `========== RustUse crate source bundle: ${crateName} ==========`,
    'Copy the files below into your codebase as needed.',
  ];

  for (const file of files) {
    sections.push(
      '',
      `========== file: ${file.path} ==========`,
      file.content.trimEnd(),
    );
  }

  return `${sections.join('\n')}\n`;
}

function buildCrateSourceArtifact(crateName, cargoMetadata) {
  const cratePackage = cargoMetadata.packages.find(
    (pkg) => pkg.name === crateName,
  );

  if (!cratePackage) {
    fail(
      `Rustdoc source metadata does not contain the published crate "${crateName}".`,
    );
  }

  const crateRootDir = path.dirname(cratePackage.manifest_path);
  const files = collectCrateSourceFiles(crateRootDir);

  if (files.length === 0) {
    fail(`No source files found for published crate "${crateName}".`);
  }

  return {
    bundle: renderCrateSourceBundle(crateName, files),
    crateName,
    files,
  };
}

function renderUiStateBootstrapScript() {
  return `<script data-rustuse-ui-state>
  (() => {
    const themeKey = 'starlight-theme';
    const mascotModeKey = 'rustuse-mascot-mode';
    const parseTheme = (theme) =>
      theme === 'auto' || theme === 'light' || theme === 'dark' ? theme : 'dark';
    const resolveTheme = (theme) =>
      theme === 'auto'
        ? window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'light'
          : 'dark'
        : theme === 'light'
          ? 'light'
          : 'dark';
    const parseMascotMode = (mode) => (mode === '2d' || mode === '3d' ? mode : null);
    const readStorage = (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    };
    const applyTheme = (theme) => {
      document.documentElement.dataset.theme = resolveTheme(parseTheme(theme));
    };
    const applyMascotMode = (mode) => {
      document.documentElement.dataset.mascotMode =
        parseMascotMode(mode) || (document.documentElement.dataset.theme === 'light' ? '2d' : '3d');
    };
    const syncState = () => {
      applyTheme(readStorage(themeKey) || 'dark');
      applyMascotMode(readStorage(mascotModeKey));
    };

    syncState();

    const themeMedia = window.matchMedia('(prefers-color-scheme: light)');
    const handleThemeMediaChange = () => {
      if (readStorage(themeKey) === 'auto') {
        syncState();
      }
    };

    if (typeof themeMedia.addEventListener === 'function') {
      themeMedia.addEventListener('change', handleThemeMediaChange);
    } else if (typeof themeMedia.addListener === 'function') {
      themeMedia.addListener(handleThemeMediaChange);
    }

    window.addEventListener('storage', (event) => {
      if (event.key === themeKey || event.key === mascotModeKey) {
        syncState();
      }
    });
  })();
  </script>`;
}

function injectUiStateBootstrap(html) {
  if (html.includes('data-rustuse-ui-state')) {
    return html;
  }

  return html.replace(
    '</head>',
    `  ${renderUiStateBootstrapScript()}\n</head>`,
  );
}

function stripRustdocFontPreloadScript(html) {
  return html.replace(
    /<script>if\(window\.location\.protocol!=="file:"\)document\.head\.insertAdjacentHTML\("beforeend",[\s\S]*?<link rel="preload" as="font" type="font\/woff2"href[^<]*?<\/script>/,
    '',
  );
}

function transformRustdocHtml(html) {
  return injectUiStateBootstrap(stripRustdocFontPreloadScript(html));
}

function applyUiStateBootstrapToHtmlFiles(rootDir) {
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      applyUiStateBootstrapToHtmlFiles(entryPath);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.html')) {
      writeFileSync(
        entryPath,
        transformRustdocHtml(readFileSync(entryPath, 'utf8')),
      );
    }
  }
}

function renderRedirectPage(title, target, stylesheetHref) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>${title}</title>
  <meta http-equiv="refresh" content="0; url=${target}">
  <link rel="canonical" href="${target}">
  ${renderUiStateBootstrapScript()}
  <link rel="stylesheet" href="${stylesheetHref}">
  <script>window.location.replace(${JSON.stringify(target)});</script>
</head>
<body class="ru-rustdoc-shell is-redirect">
  <main class="ru-shell-card">
    <p class="ru-shell-kicker">RustUse API</p>
    <h1>${title}</h1>
    <p>Redirecting to the generated crate docs for this published entry point.</p>
    <p>If the redirect does not start automatically, use the direct link below.</p>
    <a class="ru-shell-link" href="${target}">Open generated docs</a>
  </main>
</body>
</html>
`;
}

function renderWorkspaceIndex(title, crateEntries, stylesheetHref) {
  const items = crateEntries
    .map(({ route, crateDir, crateName }) => {
      const bundleHref = `${crateDir}/index.html`;
      const routeHref = `../../${route}/index.html`;
      return `      <li><a href="${bundleHref}">${crateName}</a> <span>Published entry: <a href="${routeHref}">/api/${route}/</a></span></li>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>${title}</title>
  ${renderUiStateBootstrapScript()}
  <link rel="stylesheet" href="${stylesheetHref}">
</head>
<body class="ru-rustdoc-shell is-workspace-index">
  <main class="ru-shell-card">
    <p class="ru-shell-kicker">Workspace Bundle</p>
    <h1>${title}</h1>
    <p>This workspace bundle preserves the full Rustdoc output layout used by the generated crate docs.</p>
    <ul class="ru-shell-list">
${items}
    </ul>
  </main>
</body>
</html>
`;
}

function shellStylesHref(pageRoute) {
  return path.posix.relative(
    path.posix.join('api', pageRoute),
    path.posix.join('api', rustdocShellCssFileName),
  );
}

function run(command, args, cwd, extraEnv = {}) {
  execFileSync(command, args, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: 'inherit',
  });
}

function githubCloneAuthEnv(repoUrl) {
  const token = process.env.GITHUB_TOKEN;
  if (!token || typeof repoUrl !== 'string') {
    return {};
  }

  let parsed;
  try {
    parsed = new URL(repoUrl);
  } catch {
    return {};
  }

  if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') {
    return {};
  }

  const basicAuth = Buffer.from(`x-access-token:${token}`, 'utf8').toString(
    'base64',
  );
  return {
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `Authorization: basic ${basicAuth}`,
  };
}

if (!existsSync(configPath)) {
  fail(`Missing Rustdoc source config: ${configPath}`);
}

if (!existsSync(rustdocExtendCssPath)) {
  fail(`Missing Rustdoc extend CSS: ${rustdocExtendCssPath}`);
}

if (!existsSync(rustdocShellCssPath)) {
  fail(`Missing Rustdoc shell CSS: ${rustdocShellCssPath}`);
}

const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
const sources = Array.isArray(parsed.sources) ? parsed.sources : [];

rmSync(apiRoot, { recursive: true, force: true });
mkdirSync(apiRoot, { recursive: true });
writeFileSync(
  path.join(apiRoot, rustdocShellCssFileName),
  readFileSync(rustdocShellCssPath, 'utf8'),
);

if (sources.length === 0) {
  console.log('No Rustdoc sources configured. Skipping API doc build.');
  process.exit(0);
}

const tempRoot = path.join(os.tmpdir(), `rustuse-rustdocs-${process.pid}`);
rmSync(tempRoot, { recursive: true, force: true });
mkdirSync(tempRoot, { recursive: true });

try {
  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      fail('Each Rustdoc source must be an object.');
    }

    const name =
      typeof source.name === 'string' && source.name.length > 0
        ? source.name
        : null;
    if (!name) {
      fail('Each Rustdoc source requires a non-empty "name" field.');
    }

    const bundleSlug = normalizeApiSlug(
      typeof source.bundleSlug === 'string' && source.bundleSlug.length > 0
        ? source.bundleSlug
        : name,
      'bundleSlug',
    );

    const outputDir = path.join(apiRoot, bundleSlug);
    rmSync(outputDir, { recursive: true, force: true });

    const publishedCrates = Array.isArray(source.publishedCrates)
      ? source.publishedCrates
      : [];
    const publishedEntries = publishedCrates.map((crateName) => {
      if (typeof crateName !== 'string' || crateName.length === 0) {
        fail(`Rustdoc source "${name}" has an invalid published crate entry.`);
      }

      const route = normalizeApiSlug(crateName, 'publishedCrates');
      const crateDir = crateDocDir(crateName);
      return { crateName, route, crateDir };
    });

    const localPath =
      typeof source.path === 'string' && source.path.length > 0
        ? path.resolve(repoRoot, source.path)
        : null;
    const repo =
      typeof source.repo === 'string' && source.repo.length > 0
        ? source.repo
        : null;

    const hasLocalPath = localPath ? existsSync(localPath) : false;
    const workingDir = hasLocalPath ? localPath : path.join(tempRoot, name);

    if (hasLocalPath) {
      console.log(`Using local Rustdoc source for ${name}: ${localPath}`);
    } else {
      if (!repo) {
        if (localPath) {
          fail(`Configured local Rustdoc source does not exist: ${localPath}`);
        }

        fail(
          `Rustdoc source "${name}" requires either a valid "path" or a "repo" fallback.`,
        );
      }

      if (localPath) {
        console.warn(
          `Local Rustdoc source not found for ${name}; falling back to ${repo}`,
        );
      }

      const cloneArgs = ['clone', '--depth', '1'];
      if (typeof source.branch === 'string' && source.branch.length > 0) {
        cloneArgs.push('--branch', source.branch);
      }
      cloneArgs.push(repo, workingDir);
      run('git', cloneArgs, repoRoot, githubCloneAuthEnv(repo));
    }

    console.log(`Building Rustdocs for ${name}...`);
    const rustdocFlags = [
      '--default-theme',
      'dark',
      '--extend-css',
      rustdocExtendCssPath,
    ];
    const encodedRustdocFlags = process.env.CARGO_ENCODED_RUSTDOCFLAGS
      ? `${process.env.CARGO_ENCODED_RUSTDOCFLAGS}${cargoFlagSeparator}${rustdocFlags.join(cargoFlagSeparator)}`
      : rustdocFlags.join(cargoFlagSeparator);

    run('cargo', ['doc', '--workspace', '--no-deps'], workingDir, {
      CARGO_ENCODED_RUSTDOCFLAGS: encodedRustdocFlags,
    });

    const builtDocsDir = path.join(workingDir, 'target', 'doc');
    if (!existsSync(builtDocsDir)) {
      fail(`Rustdoc output not found for ${name}: ${builtDocsDir}`);
    }

    const cargoMetadata = readJsonCommandOutput(
      'cargo',
      ['metadata', '--format-version', '1', '--no-deps'],
      workingDir,
    );

    mkdirSync(outputDir, { recursive: true });
    cpSync(builtDocsDir, outputDir, { recursive: true });
    writeFileSync(
      path.join(outputDir, rustdocThemeCssFileName),
      readFileSync(rustdocExtendCssPath, 'utf8'),
    );
    applyUiStateBootstrapToHtmlFiles(outputDir);
    console.log(
      `Copied ${name} Rustdocs to ${path.relative(repoRoot, outputDir)}`,
    );

    if (publishedEntries.length > 0) {
      for (const entry of publishedEntries) {
        const crateIndexPath = path.join(
          outputDir,
          entry.crateDir,
          'index.html',
        );
        if (!existsSync(crateIndexPath)) {
          fail(
            `Rustdoc source "${name}" does not contain generated docs for published crate "${entry.crateName}".`,
          );
        }

        const publishedDir = path.join(apiRoot, entry.route);
        rmSync(publishedDir, { recursive: true, force: true });
        mkdirSync(publishedDir, { recursive: true });

        const redirectTarget = `${path.posix.relative(
          path.posix.join('api', entry.route),
          path.posix.join('api', bundleSlug, entry.crateDir),
        )}/index.html`;
        const stylesheetHref = shellStylesHref(entry.route);

        writeFileSync(
          path.join(publishedDir, 'index.html'),
          renderRedirectPage(
            `${entry.crateName} API Docs`,
            redirectTarget,
            stylesheetHref,
          ),
        );
        writeFileSync(
          path.join(publishedDir, sourceArtifactFileName),
          JSON.stringify(
            buildCrateSourceArtifact(entry.crateName, cargoMetadata),
            null,
            2,
          ),
        );
        console.log(
          `Published ${entry.crateName} docs at ${path.join('public', 'api', entry.route)}`,
        );
      }

      const workspaceStylesheetHref = shellStylesHref(bundleSlug);

      writeFileSync(
        path.join(outputDir, 'index.html'),
        renderWorkspaceIndex(
          `${name} Workspace Rustdocs`,
          publishedEntries,
          workspaceStylesheetHref,
        ),
      );
      console.log(
        `Published workspace index for ${name} at ${path.join('public', 'api', bundleSlug)}`,
      );
    }
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
