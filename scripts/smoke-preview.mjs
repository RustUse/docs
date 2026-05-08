import process from 'node:process';

import { getSmokeChecks, validateSourceArtifact } from './smoke-contract.mjs';

const repoRoot = process.cwd();
const baseUrl = new URL(
  process.env.RUSTUSE_PREVIEW_URL || 'http://127.0.0.1:8080',
);

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

async function checkRoute({
  contentType,
  expectedStatus = 200,
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
}

for (const check of smokeChecks) {
  await checkRoute(check);
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