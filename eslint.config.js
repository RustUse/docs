import js from '@eslint/js';
import eslintPluginAstro from 'eslint-plugin-astro';
import perfectionist from 'eslint-plugin-perfectionist';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '.cache/**',
      '**/.cache/**',
      '.astro/**',
      '**/.astro/**',
      'dist/**',
      '**/dist/**',
      'node_modules/**',
      '**/node_modules/**',
      'public/api/**',
      '**/public/api/**',
      '**/*.d.ts',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    files: ['astro.config.mjs', 'eslint.config.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['src/**/*.{ts,astro}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.{js,mjs,ts,astro}'],
    plugins: {
      perfectionist,
      unicorn: eslintPluginUnicorn,
    },
    rules: {
      'perfectionist/sort-exports': [
        'error',
        { order: 'asc', type: 'natural' },
      ],
      'perfectionist/sort-imports': [
        'error',
        {
          groups: [
            'type-import',
            ['value-builtin', 'value-external'],
            'type-internal',
            'value-internal',
            ['type-parent', 'type-sibling', 'type-index'],
            ['value-parent', 'value-sibling', 'value-index'],
            'ts-equals-import',
            'unknown',
          ],
          newlinesBetween: 1,
          order: 'asc',
          type: 'natural',
        },
      ],
      'perfectionist/sort-named-imports': [
        'error',
        { order: 'asc', type: 'natural' },
      ],
    },
  },
];
