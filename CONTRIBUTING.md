# Contributing to remark-pdfmake

Thanks for taking the time to contribute.

## Prerequisites

- Node.js 22 or later
- pnpm (see `packageManager` in [package.json](./package.json) for the pinned version)

```
pnpm install
```

## Development workflow

```
pnpm test            # run the test suite (node --test)
pnpm run typecheck   # tsc --noEmit
pnpm run build       # build dist/ with tsdown
```

`pnpm run verify:nodenext` additionally checks that the published type declarations
resolve under a consumer's `moduleResolution: "nodenext"` environment. It installs the
packed tarball into a clean project and requires network access, so it isn't part of the
regular test run — run it before publishing a release.

## Before you write code

This repository follows a test-driven, layered design. Please read these first:

- [ARCHITECTURE.md](./ARCHITECTURE.md) — the responsibilities and constraints of each
  pipeline stage (producer/styler/compiler). Most review feedback traces back to a
  change that crossed one of these boundaries.
- [CLAUDE.md](./CLAUDE.md) — the project's development principles (test-first, typing
  invariants over runtime checks, comment style, no leaking internal/sensitive
  information into published files).

In short:

- **Write the failing test first.** Every layer (producer/styler/compiler) has its own
  `*.test.ts`; behavior that spans layers belongs in an integration test such as
  `pipeline.test.ts`. Tests verify observable input → output behavior, not
  implementation details.
- **Prefer types over runtime checks.** Invariants (e.g. the discriminated union in
  `src/ddast/ddast.ts`, unist compliance, the 1:1 mapping to pdfmake's
  `TDocumentDefinitions`) should be expressed in the type system, and `tsc --noEmit`
  passing is what backs that up. Reach for an `unknown`-based assertion only when a
  third-party type definition genuinely has no better option.
- **Comments describe the current design, not its history.** Explain why the code
  should be the way it is now, in the present tense — not what review comment or past
  incident led to it. That history belongs in commit messages and PR descriptions.
- **Don't leak internal details into published files.** This package is published to
  npm; avoid internal system names, ticket numbers, or other provenance-revealing
  details in comments or test fixtures. Use generic sample values (e.g. `"section-1"`).

## Submitting a change

1. Fork the repository and create a branch from `main`.
2. Make your change, following the workflow above (failing test → implementation →
   `pnpm test` / `pnpm run typecheck` passing).
3. Open a pull request describing what changed and why. Link any related issue.

## Reporting bugs / requesting features

Please use [GitHub Issues](https://github.com/iret-m-nakamura/remark-pdfmake/issues).
For security vulnerabilities, see [SECURITY.md](./SECURITY.md) instead of filing a
public issue.
