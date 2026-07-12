import type { IncomingMessage, ServerResponse } from 'node:http';

import { satteri } from '@astrojs/markdown-satteri';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import { defineConfig, fontProviders } from 'astro/config';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getSidebarCrateLinks,
  getSidebarFacadeLinks,
  rustuseCrates,
} from './src/data/catalog.js';
import { renderKatexMath } from './src/markdown/render-katex-math.mjs';

const workspaceRoot = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = path.join(workspaceRoot, 'public');

type MiddlewareNext = (err?: unknown) => void;

const handleRustdocDirectoryIndex = (
  req: IncomingMessage,
  _res: ServerResponse,
  next: MiddlewareNext,
): void => {
  if (!req.url) {
    return next();
  }

  const requestUrl = new URL(req.url, 'http://localhost');
  const { pathname, search } = requestUrl;
  if (!pathname.startsWith('/api/') || !pathname.endsWith('/')) {
    return next();
  }

  const candidate = path.join(
    publicRoot,
    ...pathname.split('/').filter(Boolean),
    'index.html',
  );
  if (!existsSync(candidate)) {
    return next();
  }

  req.url = `${pathname}index.html${search}`;
  return next();
};

function getCrateSlugRedirects(): Record<string, string> {
  const redirects: Record<string, string> = {};

  for (const crate of rustuseCrates) {
    if (
      !crate.name.startsWith('use-') ||
      crate.name === crate.facade ||
      typeof crate.pagePath !== 'string' ||
      crate.pagePath.length === 0
    ) {
      continue;
    }

    const from = `/${crate.name}`;

    if (redirects[from] && redirects[from] !== crate.pagePath) {
      throw new Error(
        `Duplicate RustUse crate redirect for ${from}: ${redirects[from]} and ${crate.pagePath}`,
      );
    }

    redirects[from] = crate.pagePath;
  }

  return redirects;
}

export default defineConfig({
  site: 'https://rustuse.org/',
  compressHTML: true,
  redirects: getCrateSlugRedirects(),
  vite: {
    plugins: [
      {
        name: 'rustuse-rustdoc-directory-index',

        configureServer(server) {
          server.middlewares.use(handleRustdocDirectoryIndex);
        },
      },
    ],
  },
  fonts: [
    {
      provider: fontProviders.fontsource(),
      name: 'Alfa Slab One',
      cssVariable: '--font-alfa-slab-one',
      weights: [400],
      styles: ['normal'],
    },
    {
      provider: fontProviders.fontsource(),
      name: 'Fira Sans',
      cssVariable: '--font-fira-sans',
      weights: [400, 500, 600, 700],
      styles: ['normal', 'italic'],
    },
  ],
  markdown: {
    processor: satteri({
      features: {
        gfm: true,
        frontmatter: true,
        directive: true,
        math: true,
      },
      mdastPlugins: [renderKatexMath],
    }),
  },
  integrations: [
    starlight({
      title: 'RustUse',
      titleDelimiter: '|',
      description:
        'RustUse provides composable facades of primitive Rust utility crates.',
      favicon: '/favicon.ico',
      disable404Route: true,
      customCss: ['./src/styles/katex.css', './src/styles/rustuse.css'],
      components: {
        Head: './src/components/Head.astro',
        Hero: './src/components/Hero.astro',
        Header: './src/components/Header.astro',
        Footer: './src/components/Footer.astro',
        SocialIcons: './src/components/SocialIcons.astro',
        ThemeProvider: './src/components/ThemeProvider.astro',
        ThemeSelect: './src/components/ThemeSelect.astro',
      },
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/rustuse' },
      ],
      sidebar: [
        { label: 'Onboarding', link: '/onboarding' },
        {
          label: 'Facades',
          collapsed: true,
          items: [
            { label: 'Overview', link: '/facades' },
            ...getSidebarFacadeLinks(),
          ],
        },
        {
          label: 'Crates',
          collapsed: true,
          items: [
            { label: 'Overview', link: '/crates' },
            ...getSidebarCrateLinks(),
          ],
        },
        { label: 'CLI', link: '/cli' },
        {
          label: 'Using AI',
          collapsed: true,
          items: [
            { label: 'Overview', link: '/using-ai' },
            { label: 'LLM text files', link: '/using-ai/llms-txt' },
            { label: 'RustUse MCP Server', link: '/using-ai/mcp' },
            { label: 'AI usage recipes', link: '/using-ai/recipes' },
            { label: 'Reference', link: '/using-ai/reference' },
          ],
        },
        { label: 'Contributing', link: '/contributing' },
      ],
    }),
    mdx(),
    sitemap(),
  ],
});
