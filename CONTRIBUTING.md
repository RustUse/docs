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

For faster Rustdoc iteration, you can keep a sibling `use-math` checkout at `../use-math`.
That checkout is optional.
If `../use-math` is missing, `npm run build:api`, `npm run build`, and `npm run dev` fall back to cloning the configured GitHub repository from `docs/rustdoc-sources.json`.
The first cold Rustdoc build can take several minutes because it may need to clone the source workspace and run `cargo doc` from scratch.

## Common commands

```bash
npm install
npm run dev:doctor
npm run dev
npm run build:api
npm run smoke:dist
npm run smoke:preview
npm run verify:changed
npm run verify:fast
npm run check
npm run validate
npm run validate:full
npm run build
npm run preview
```

Use `npm run dev` for day-to-day site work.
Use `npm run dev:doctor` after cloning or when local setup seems off.
If `../use-math` is absent, `npm run dev` still works; it will clone the configured source workspace automatically before generating `public/api/`.
Use `npm run smoke:dist` after `npm run build` when you want to verify the final published artifact shape without rerunning the whole repo validation chain.
Use `npm run smoke:preview` when you want an HTTP-level check of the served docs and API routes; it starts and stops its own temporary preview server by default.
Use `npm run verify:changed` for the fastest changed-files-only lint and formatting loop, and `npm run verify:fast` when you also want `astro check`.
Use `npm run validate` before opening a PR when you want the quickest whole-repo health check, and `npm run validate:full` when you also want a fresh production build plus the built-route smoke check.

`npm install` runs `prepare`, which configures Git to use `.githooks/` for this repository.
The pre-commit hook runs `npm run precommit:check`, which applies the changed-file verification path to staged authored files only.
If you need to restore that Git config manually, run `npm run setup:hooks`.

This repository does not ship a project database, shared DB container flow, `.env` bootstrap, or Ollama setup.
Keep contributor setup focused on the docs site, the Rust toolchain, and the configured Rustdoc source workspace.

## Content and API changes

When adding or changing supported crates:

- Update `src/data/crates.ts`.
- Add or update the relevant guide under `src/content/docs/`.
- Update `docs/rustdoc-sources.json` if the public `/api/<crate>/` route contract changes.
- Run `npm run build` and verify the generated `/api/` routes resolve as expected.

## Pull requests

Keep pull requests focused. A good PR includes:

- a short summary of the user-visible change
- the commands you ran locally, ideally including `npm run verify:fast`, `npm run validate`, or `npm run validate:full`
- screenshots when the change affects layout, navigation, or visual styling
- notes on any known follow-up work or tradeoffs

The public maintenance path for this repository is PR-only.
Plan on one maintainer approval plus passing required checks before anything merges to `main`.
See `GOVERNANCE.md` and `MAINTAINERS.md` for the current repo policy and maintainer roster.

Release automation derives version bumps and changelog entries from Conventional Commits.
When opening a PR, prefer a title or eventual squash-merge commit title like `feat: add crate overview`, `fix: correct API route`, or `docs: clarify onboarding`.
Use `!` for breaking changes when the public docs contract or release behavior changes incompatibly.

VS Code users can run the matching tasks and launch profiles in `.vscode/` instead of typing the commands by hand, but those editor actions should still map back to the npm scripts above.

## Releases

GitHub releases are created through `.github/workflows/release-please.yml`.

Release authority for this repository is defined in `GOVERNANCE.md` and `MAINTAINERS.md`.

Release operators should:

- review and merge the open Release Please PR when the changelog and version bump look correct
- keep squash-merge titles or direct commit messages in Conventional Commit form so release automation can classify the change correctly
- keep the repository or organization setting enabled so GitHub Actions can create pull requests with `GITHUB_TOKEN`
- treat `.github/workflows/deploy.yml` as the normal GitHub Pages deploy path for production docs after reviewed changes land on `main`
- use the manual dispatch inputs in `.github/workflows/deploy.yml` when you need to redeploy a specific branch, tag, or commit
- confirm the generated GitHub release includes the expected autogenerated notes and attached `dist/` tarball

## Ground rules

- Preserve the current Starlight and content structure unless the change requires a new pattern.
- Prefer small, reviewable changes over broad refactors.
- Do not commit generated `dist/` output.
- Treat accessibility regressions and broken docs routes as release blockers.
