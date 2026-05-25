import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

import { getSmokeChecks, validateSourceArtifact } from './smoke-contract.mjs';

const repoRoot = process.cwd();
const distRoot = path.join(repoRoot, 'dist');
const astroCliPath = path.join(
  repoRoot,
  'node_modules',
  'astro',
  'bin',
  'astro.mjs',
);
const managedPreviewHost = '127.0.0.1';
const managedPreviewStartupTimeoutMs = Number.parseInt(
  process.env.RUSTUSE_PREVIEW_STARTUP_TIMEOUT_MS ?? '60000',
  10,
);

if (!existsSync(distRoot)) {
  console.error('Build output not found at dist/. Run "npm run build" first.');
  process.exit(1);
}

const externalPreviewUrl = process.env.RUSTUSE_PREVIEW_URL || null;
let baseUrl = externalPreviewUrl ? new URL(externalPreviewUrl) : null;

const smokeChecks = [
  ...getSmokeChecks(repoRoot),
  {
    contentType: 'text/html',
    expectedStatus: 404,
    mustInclude: ['404'],
    route: '/__rustuse-preview-smoke-missing__/',
  },
];

const problems = [];

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, managedPreviewHost, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => {
          reject(new Error('Unable to determine a free preview port.'));
        });
        return;
      }

      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(address.port);
      });
    });
  });
}

function delay(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function canReach(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'rustuse-preview-smoke/1.0',
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function startManagedPreviewServer() {
  if (!existsSync(astroCliPath)) {
    throw new Error(
      `Astro CLI not found at ${astroCliPath}. Run npm install first.`,
    );
  }

  const port = await getFreePort();
  const previewUrl = new URL(`http://${managedPreviewHost}:${port}`);
  const child = spawn(
    process.execPath,
    [
      astroCliPath,
      'preview',
      '--host',
      managedPreviewHost,
      '--port',
      String(port),
    ],
    {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  child.stdout?.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr?.on('data', (chunk) => {
    output += chunk.toString();
  });

  const startupDeadline = Date.now() + managedPreviewStartupTimeoutMs;

  while (Date.now() < startupDeadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Managed preview server exited early with code ${child.exitCode}.\n${output.trim()}`,
      );
    }

    if (await canReach(new URL('/', previewUrl))) {
      return {
        baseUrl: previewUrl,
        child,
      };
    }

    await delay(200);
  }

  child.kill();
  throw new Error(
    `Timed out waiting for the managed preview server at ${previewUrl.origin}.\n${output.trim()}`,
  );
}

async function stopManagedPreviewServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  await new Promise((resolve) => {
    child.once('exit', () => resolve());
    child.kill();
  });
}

async function checkRoute({
  contentType,
  expectedStatus = 200,
  mustExclude = [],
  mustInclude = [],
  route,
  sourceArtifact,
}) {
  const url = new URL(route, baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`Request timed out for ${route}.`));
  }, 10000);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        'user-agent': 'rustuse-preview-smoke/1.0',
      },
      signal: controller.signal,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    problems.push(`Request failed for ${route}: ${message}`);
    return;
  } finally {
    clearTimeout(timeout);
  }

  if (response.status !== expectedStatus) {
    problems.push(
      `Expected ${route} to return ${expectedStatus}, received ${response.status}.`,
    );
    return;
  }

  const receivedContentType = response.headers.get('content-type') || '';
  if (contentType && !receivedContentType.includes(contentType)) {
    problems.push(
      `Expected ${route} to return content type containing "${contentType}", received "${receivedContentType}".`,
    );
    return;
  }

  const text = await response.text();

  if (sourceArtifact) {
    try {
      validateSourceArtifact(text, sourceArtifact);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      problems.push(`Invalid preview artifact at ${route}: ${message}`);
    }
    return;
  }

  for (const snippet of mustInclude) {
    if (!text.includes(snippet)) {
      problems.push(`Expected ${route} to include "${snippet}".`);
    }
  }

  for (const snippet of mustExclude) {
    if (text.includes(snippet)) {
      problems.push(`Expected ${route} not to include "${snippet}".`);
    }
  }
}

let managedPreviewServer = null;

try {
  if (!baseUrl) {
    managedPreviewServer = await startManagedPreviewServer();
    baseUrl = managedPreviewServer.baseUrl;
  }

  for (const check of smokeChecks) {
    await checkRoute(check);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  problems.push(message);
} finally {
  await stopManagedPreviewServer(managedPreviewServer?.child);
}

if (problems.length > 0) {
  console.error('Preview smoke check failed.');
  for (const problem of problems) {
    console.error(`- ${problem}`);
  }
  process.exit(1);
}

console.log(
  `Preview smoke check passed (${smokeChecks.length} checks against ${baseUrl.origin}).`,
);
