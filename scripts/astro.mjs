const astroLegacyMarkdownWarning =
  '[astro] `markdown.remarkPlugins`, `markdown.rehypePlugins`, and `markdown.remarkRehype` are deprecated. Pass them to `unified({...})` from `@astrojs/markdown-remark` directly instead.';

const originalWarn = console.warn.bind(console);

console.warn = (...args) => {
  if (
    process.env.RUSTUSE_SHOW_ASTRO_MARKDOWN_WARNING !== '1' &&
    args.length === 1 &&
    args[0] === astroLegacyMarkdownWarning
  ) {
    return;
  }

  originalWarn(...args);
};

await import('../node_modules/astro/bin/astro.mjs');
