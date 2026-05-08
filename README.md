# RustUse Docs

<p align="center">
  <img src=".github/assets/readme-hero.svg" alt="RustUse Docs" width="900">
</p>

<p align="center">
  <img alt="RustUse Docs" src="https://img.shields.io/badge/RustUse-Docs-264653">
  <img alt="Human docs in src/content/docs" src="https://img.shields.io/badge/Human%20docs-src%2Fcontent%2Fdocs-2a9d8f">
  <img alt="Generated API docs in public/api" src="https://img.shields.io/badge/Generated%20API-public%2Fapi-b65a3a">
  <img alt="Deploy to GitHub Pages" src="https://img.shields.io/badge/Deploy-GitHub%20Pages-f4a261">
  <img alt="License MIT or Apache-2.0" src="https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-ff4500">
</p>

<p align="center">
  <strong>RustUse documentation and generated API reference</strong><br>
  Human docs live in <code>src/content/docs/</code>. Generated Rust API docs live in <code>public/api/</code>.
</p>

<p align="center">
  <a href="#what-this-repository-contains">Repository</a> ·
  <a href="#documentation-model">Docs model</a> ·
  <a href="#local-development">Local development</a> ·
  <a href="#generated-rust-api-docs">Generated API docs</a> ·
  <a href="#deployment">Deployment</a> ·
  <a href="#troubleshooting">Troubleshooting</a>
</p>

This repository contains the RustUse docs site for `rustuse.org`. It combines human-authored documentation under `src/content/docs/` with generated Rust API docs under `public/api/`, then publishes the static result to GitHub Pages.

<table>
  <tr>
    <td width="33%" valign="top">
      <strong>Edit human docs</strong><br>
      <code>src/content/docs/</code><br>
      Guides, onboarding, set pages, and contributor-facing content.
    </td>
    <td width="33%" valign="top">
      <strong>Refresh generated API docs</strong><br>
      <code>npm run build:api</code><br>
      Rebuilds configured Rustdocs into <code>public/api/</code>.
    </td>
    <td width="33%" valign="top">
      <strong>Update public crate metadata</strong><br>
      <code>src/data/crates.ts</code><br>
      Status, routes, docs links, and publication-facing metadata.
    </td>
  </tr>
</table>

## What this repository contains

RustUse Docs is the public docs site, not the source workspace for every Rust crate. It has three primary responsibilities:

| Area                   | Location             | Purpose                                                                                         |
| ---------------------- | -------------------- | ----------------------------------------------------------------------------------------------- |
| Human docs             | `src/content/docs/`  | Guides, onboarding, set overviews, and contributor-facing content maintained in this repository |
| Generated API docs     | `public/api/`        | Rustdoc HTML copied in from configured workspaces and treated as build output                   |
| Crate catalog metadata | `src/data/crates.ts` | Public crate listing, publication status, docs links, and site routing metadata                 |

| If you need to...                       | Start here                  |
| --------------------------------------- | --------------------------- |
| Write or edit site content              | `src/content/docs/`         |
| Rebuild published API routes            | `npm run build:api`         |
| Change Rustdoc source inputs            | `docs/rustdoc-sources.json` |
| Update public crate visibility or links | `src/data/crates.ts`        |

> [!IMPORTANT]
> Generated Rustdoc HTML belongs in `public/api/`, not `src/content/docs/`.

## Documentation model

RustUse separates authored documentation from generated API output on purpose.

| Content type           | Location             | Source of truth                                           |
| ---------------------- | -------------------- | --------------------------------------------------------- |
| Human docs             | `src/content/docs/`  | This repository                                           |
| Generated API docs     | `public/api/`        | Rust workspaces configured in `docs/rustdoc-sources.json` |
| Crate catalog metadata | `src/data/crates.ts` | This repository                                           |

> [!NOTE]
> `public/api/` is generated output. Expect it to be replaced whenever `npm run build:api` runs.

> [!TIP]
> Treat `public/api/` the same way you would treat `dist/`: generated, replaceable, and derived from configured source workspaces.

## Visual overview

<p align="center">
  <img src=".github/assets/readme-flow.svg" alt="RustUse documentation build flow" width="900">
</p>

Build path at a glance:

`Rust workspace or repo` -> `scripts/build-rustdocs.mjs` -> `public/api/` -> `RustUse docs site` -> `rustuse.org`

| Capability            | How it works                                                                         | Where to look                                             |
| --------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| Site shell            | Site configuration, components, and styles render the public docs surface            | `astro.config.mjs`, `src/components/`, `src/styles/`      |
| Human docs authoring  | Markdown and MDX pages live in the docs content tree                                 | `src/content/docs/`                                       |
| API docs generation   | A build script reads configured Rustdoc sources and copies output into `public/api/` | `scripts/build-rustdocs.mjs`, `docs/rustdoc-sources.json` |
| Public crate metadata | Crate status and public links are maintained separately from generated docs          | `src/data/crates.ts`                                      |

## Project structure

```text
.
├── docs/
│   └── rustdoc-sources.json
├── public/
│   ├── CNAME
│   └── api/
├── scripts/
│   └── build-rustdocs.mjs
├── src/
│   ├── content/docs/
│   ├── data/crates.ts
│   └── styles/
├── astro.config.mjs
├── package.json
└── tsconfig.json
```

| Path                         | Role                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `docs/rustdoc-sources.json`  | Declares which Rust workspaces feed generated API docs                           |
| `public/api/`                | Generated Rustdoc bundle output and published crate entry routes                 |
| `scripts/build-rustdocs.mjs` | Builds Rustdocs, handles local-path or repo fallback, and writes redirect shells |
| `src/content/docs/`          | Human-authored pages for the docs site                                           |
| `src/data/crates.ts`         | Public crate catalog, status flags, docs links, and route metadata               |
| `public/CNAME`               | Keeps the custom domain aligned with the deployed site                           |

## Requirements

Use these prerequisites when working on the site locally:

```text
Node.js >=22.12.0
npm
Rust stable toolchain
```

If you use `nvm` or a compatible tool, the repository pins `22.12.0` in `.nvmrc`.

## Local development

Run commands from the repository root.

Fastest path to a working local site:

```bash
npm install
npm run dev:doctor
npm run dev
```

| Command                  | What it does                                                         |
| ------------------------ | -------------------------------------------------------------------- |
| `npm install`            | Installs site dependencies and applies the local Git hooks path      |
| `npm run dev:doctor`     | Checks Node, npm, Rust, ports, and expected local workspace wiring   |
| `npm run dev`            | Builds Rustdocs first, then starts the local docs site               |
| `npm run build:api`      | Builds and copies configured Rustdocs into `public/api/`             |
| `npm run build`          | Builds Rustdocs first, then builds the static site into `dist/`      |
| `npm run preview`        | Serves the production build locally                                  |
| `npm run smoke:dist`     | Verifies the built `dist/` artifact contains the expected routes     |
| `npm run smoke:preview`  | Starts a temporary preview server and verifies the served responses  |
| `npm run verify:changed` | Runs Prettier, ESLint, and Stylelint only on changed authored files  |
| `npm run verify:fast`    | Runs `verify:changed` and then `astro check`                         |
| `npm run validate`       | Runs format, JS lint, CSS lint, and `astro check`                    |
| `npm run validate:full`  | Runs `validate`, a production build, and the built-route smoke check |
| `npm run setup:hooks`    | Reapplies `.githooks` as the repo Git hooks path                     |

> [!TIP]
> `npm run dev` runs `npm run build:api` first, so the generated `/api/` routes exist before the local docs site starts.

> [!TIP]
> VS Code tasks and launch profiles now map directly to the same npm scripts for dev, preview, doctor, and validation, so editor shortcuts follow the same bootstrapping path as terminal and CI workflows.

> [!TIP]
> `npm install` runs `prepare`, which points Git at `.githooks/`. The pre-commit hook runs `npm run precommit:check`, mirroring the staged-file verification path.

> [!NOTE]
> This repository is a static docs site plus generated Rustdocs. It intentionally does not include Docker, database reset or seed commands, shared-db tooling, `.env` bootstrapping, or Ollama setup because no such runtime surface exists here.

If you want to refresh only generated API docs before restarting the site:

```bash
npm run build:api
```

If you already have a fresh build and want to sanity-check the final published artifact shape without rerunning the whole validation chain:

```bash
npm run smoke:dist
```

If you want to verify the served HTTP responses as well, run the preview smoke check directly:

```bash
npm run smoke:preview
```

By default the script starts and stops its own temporary preview server on a free local port. If you want to target an already-running preview instead, set `RUSTUSE_PREVIEW_URL` first.

## VS Code workflows

The workspace now includes task and launch entries for the core docs workflows:

| VS Code entry            | Underlying command       |
| ------------------------ | ------------------------ |
| `Docs: dev`              | `npm run dev`            |
| `Docs: build API`        | `npm run build:api`      |
| `Docs: dev doctor`       | `npm run dev:doctor`     |
| `Docs: verify changed`   | `npm run verify:changed` |
| `Docs: verify fast`      | `npm run verify:fast`    |
| `Docs: validate full`    | `npm run validate:full`  |
| `Docs: smoke dist`       | `npm run smoke:dist`     |
| `Docs: smoke preview`    | `npm run smoke:preview`  |
| `Docs: preview 8080`     | `npm run preview:8080`   |
| `Docs dev server` launch | `npm run dev`            |
| `Docs preview 8080`      | `npm run preview:8080`   |

Use the launch profiles when you want a one-click server start, and use the tasks when you want repeatable terminal workflows from the command palette.

## Generated Rust API docs

The Rustdoc build pipeline is driven by `docs/rustdoc-sources.json`.

The current source configuration points at a local sibling `use-math` workspace checkout:

<details>
<summary>Current rustdoc source configuration</summary>

```json
{
  "sources": [
    {
      "name": "use-math",
      "path": "../use-math",
      "repo": "https://github.com/RustUse/use-math",
      "bundleSlug": "workspaces/use-math",
      "publishedCrates": ["use-math", "use-geometry", "use-combinatorics"]
    }
  ]
}
```

</details>

When that local sibling checkout is unavailable, `scripts/build-rustdocs.mjs` falls back to cloning the configured `repo` URL.

Generated output currently lands at:

| Route                       | Purpose                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `/api/workspaces/use-math/` | Full workspace bundle                                                         |
| `/api/use-math/`            | Supported `use-math` entry route that redirects into the workspace bundle     |
| `/api/use-geometry/`        | Supported `use-geometry` entry route that redirects into the workspace bundle |
| `/api/use-combinatorics/`   | Currently configured `use-combinatorics` published route                      |

The supported crate entry roots redirect into the workspace bundle so the generated Rustdoc asset layout stays intact.

> [!WARNING]
> Do not move generated Rustdoc HTML into `src/content/docs/`. Keep generated output under `public/api/` and rebuild it from the configured source workspace instead.

## Crate catalog

The public crate catalog lives in `src/data/crates.ts`.

Keep that file aligned with:

| Keep in sync        | Why it matters                                                                  |
| ------------------- | ------------------------------------------------------------------------------- |
| Supported crates    | The public catalog and supported routes should describe the same surface area   |
| Public API paths    | Cards and links should resolve to the generated `public/api/` routes            |
| Internal docs links | Crate pages and set pages should stay navigable from the site                   |
| Publication status  | External registry links should only appear once the crate is actually published |

External `crates.io` and `docs.rs` links can be prewired in `src/data/crates.ts`, but the site should only render them after a crate status changes to `published`.

## Deployment

The site is intended to deploy to GitHub Pages.

Deployment flow:

```text
GitHub Actions
  -> install Node dependencies
  -> install Rust stable
  -> build configured Rustdocs into public/api/
  -> build static site into dist/
  -> deploy static output to GitHub Pages
```

The current workflow lives in `.github/workflows/deploy.yml`.

## Releases

GitHub releases are now created through `.github/workflows/release.yml`.

Release flow:

```text
Workflow dispatch
  -> choose version and target commit
  -> build + validate the exact release candidate
  -> create a draft GitHub release with generated notes
  -> attach a tarball of dist/
  -> human reviews and publishes the draft release
```

Use the release workflow from the Actions tab when you want to cut a GitHub release from `main`.

The workflow enforces these checks before publication:

| Release guard           | Why it exists                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Manual dispatch input   | Keeps the operator in control of versioning and timing                                          |
| `main` ancestry check   | Prevents cutting a release from an unrelated branch tip                                         |
| `npm run validate:full` | Uses the same validation, build, and built-route smoke path as a production-quality local check |
| Draft release output    | Keeps a human review-and-publish step after automation finishes                                 |

> [!IMPORTANT]
> The workflow creates a draft release on purpose. A maintainer still needs to open the draft, review the generated notes and attached artifact, and publish it.

> [!IMPORTANT]
> Keep `public/CNAME` and `astro.config.mjs` aligned with `rustuse.org` so the deployed Pages site and custom domain stay in sync.

| Deployment concern | Keep aligned                                              |
| ------------------ | --------------------------------------------------------- |
| Custom domain      | `public/CNAME` and the `site` value in `astro.config.mjs` |
| Generated API docs | `npm run build:api` must run before the site build        |
| Final artifact     | Astro publishes the static site into `dist/`              |

## Troubleshooting

| Issue                                                 | Likely cause                                                                                | Fix                                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `/api/workspaces/use-math/` returns the site 404 page | The dev server started before generated API routes existed or before config rewrites loaded | Restart `npm run dev`                                                                  |
| API docs are missing locally                          | Rustdocs have not been generated yet                                                        | Run `npm run build:api`                                                                |
| CI cannot find the local sibling checkout             | Expected in CI                                                                              | Ensure the `repo` URL exists in `docs/rustdoc-sources.json` so the script can clone it |
| External crate links do not render                    | Crate status is still scaffolded                                                            | Update `src/data/crates.ts` when the crate is published                                |

## Contributing

Contributor-facing project docs are already in place:

| File                 | Purpose                                                           |
| -------------------- | ----------------------------------------------------------------- |
| `CONTRIBUTING.md`    | Contributor workflow, repo expectations, and contribution process |
| `CODE_OF_CONDUCT.md` | Community behavior guidelines                                     |
| `SECURITY.md`        | Security reporting and disclosure guidance                        |

Use them together with this README when onboarding new contributors or maintainers.

## License

RustUse Docs is dual-licensed under MIT or Apache-2.0.

- `LICENSE-MIT`
- `LICENSE-APACHE`
