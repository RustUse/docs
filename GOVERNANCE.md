# RustUse Docs Governance

## Scope

This document defines how the RustUse docs repository is maintained.
It covers review, merge, release, and maintainer responsibilities for this repository only.

## Roles

### Maintainers

Maintainers are responsible for:

- reviewing and merging pull requests
- keeping the main branch healthy
- triaging issues and pull requests
- approving and publishing GitHub releases
- keeping deployment and contributor workflows accurate

The current maintainer roster lives in `MAINTAINERS.md`.

### Contributors

Contributors can propose changes through pull requests and issues.
Contributors do not need direct branch access.

## Merge policy

The `main` branch is intended to be protected.

Pull requests should merge only when all of the following are true:

- required GitHub checks are passing
- at least one maintainer has approved the change
- blocking review feedback has been addressed

Maintainers should preserve Conventional Commit prefixes in squash-merge titles so automated release notes and semver bumps stay accurate.

Direct pushes to `main` are not part of the expected public workflow.

## Review expectations

Review should focus on:

- correctness of authored docs and generated API route behavior
- accessibility, navigation, and broken-link risk
- build and deployment impact
- contributor-facing clarity for public documentation and workflows

Maintainers may ask for additional validation when a change affects generated Rustdocs, route contracts, or release behavior.

## Decision making

Maintainers should prefer consensus when practical.
If consensus is not immediate, the approving maintainer may make the final call for repository-local decisions after considering review feedback.

Larger policy or release-process changes should be documented in pull requests so the reasoning remains visible in repository history.

## Releases

Any listed maintainer may approve and publish a release.
Release automation and release notes should reflect changes already merged to `main` through the Release Please workflow.

If a release needs operator judgment, the maintainer publishing it is responsible for confirming:

- the release PR title, changelog, and version bump match the intended public change
- the release candidate passed the required checks
- generated release notes match the shipped change
- the published Pages site reflects the intended public state

## Conduct and security

All participation in this repository is governed by `CODE_OF_CONDUCT.md`.
Security issues should follow `SECURITY.md` instead of public issue reporting.
