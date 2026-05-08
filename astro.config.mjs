import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import starlight from '@astrojs/starlight';
import { defineConfig, fontProviders } from 'astro/config';
// @ts-check
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = fileURLToPath(new URL('.', import.meta.url));
const publicRoot = path.join(workspaceRoot, 'public');

/**
 * @param {import('node:http').IncomingMessage & { url?: string }} req
 * @param {import('node:http').ServerResponse} _res
 * @param {(err?: unknown) => void} next
 */
const handleRustdocDirectoryIndex = (req, _res, next) => {
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

const rustdocDirectoryIndexPlugin = {
  name: 'rustuse-rustdoc-directory-index',
  /** @param {import('vite').ViteDevServer} server */
  configureServer(server) {
    server.middlewares.use(handleRustdocDirectoryIndex);
  },
};

// https://astro.build/config
export default defineConfig({
  site: 'https://rustuse.org/',
  vite: {
    plugins: [rustdocDirectoryIndexPlugin],
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
  integrations: [
    starlight({
      title: 'RustUse',
      titleDelimiter: '|',
      description:
        'RustUse provides composable sets of primitive Rust utility crates.',
      disable404Route: true,
      customCss: ['./src/styles/rustuse.css'],
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
        { label: 'Onboarding', link: '/onboarding/' },
        {
          label: 'Sets',
          items: [
            { label: 'Overview', link: '/sets/' },
            { label: 'use-math', link: '/sets/use-math/' },
          ],
        },
        {
          label: 'Crates',
          items: [
            { label: 'Overview', link: '/crates/' },
            { label: 'use-math', link: '/use-math/' },
            {
              label: 'use-combinatorics',
              link: '/use-math/use-combinatorics/',
            },
            { label: 'use-geometry', link: '/use-math/use-geometry/' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { label: 'Overview', link: '/api-reference/' },
            {
              label: 'use-math workspace Rustdocs',
              link: '/api/workspaces/use-math/',
            },
            {
              label: 'use-combinatorics Rustdocs',
              link: '/api/use-combinatorics/',
            },
            { label: 'use-geometry Rustdocs', link: '/api/use-geometry/' },
            { label: 'use-math Rustdocs', link: '/api/use-math/' },
          ],
        },
        { label: 'Contributing', link: '/contributing/' },
      ],
    }),
    mdx(),
    sitemap(),
  ],
});
