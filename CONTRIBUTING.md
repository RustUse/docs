# Contributing to RustUse Docs

## Scope

This repository contains the public documentation site for RustUse.

- Human-authored docs live in `src/content/docs/`.
- Generated Rust API docs live in `public/api/` and are treated as build output.
- Rustdoc source definitions live in `docs/rustdoc-sources.json`.

Keep curated docs and generated Rustdocs separate. Do not copy generated Rustdoc HTML into `src/content/docs/`.

## Prerequisites

- Node.js `>=22.12.0`
- npm
- Rust stable toolchain

If you use `nvm` or a compatible version manager, the repository pins `22.12.0` in `.nvmrc`.

For the `use-math` workspace, local development prefers a sibling checkout at `../use-math`.
If that path is not present, the rustdoc build falls back to cloning the configured GitHub repository from `docs/rustdoc-sources.json`.

## Common commands

```bash
npm install
npm run build:api
npm run check
npm run validate
npm run build
npm run preview
```

Use `npm run dev` for day-to-day site work.
Use `npm run validate` before opening a PR when you want the quickest repo-health check, and `npm run validate:full` when you also want a fresh production build.

## Content and API changes

When adding or changing supported crates:

- Update `src/data/crates.ts`.
- Add or update the relevant guide under `src/content/docs/`.
- Update `docs/rustdoc-sources.json` if the public `/api/<crate>/` route contract changes.
- Run `npm run build` and verify the generated `/api/` routes resolve as expected.

## Pull requests

Keep pull requests focused. A good PR includes:

- a short summary of the user-visible change
- the commands you ran locally, ideally including `npm run validate` or `npm run validate:full`
- screenshots when the change affects layout, navigation, or visual styling
- notes on any known follow-up work or tradeoffs

## Ground rules

- Preserve the current Starlight and content structure unless the change requires a new pattern.
- Prefer small, reviewable changes over broad refactors.
- Do not commit generated `dist/` output.
- Treat accessibility regressions and broken docs routes as release blockers.
