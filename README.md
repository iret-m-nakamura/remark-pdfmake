# remark-pdfmake

[日本語](./README_ja.md)

A [unified](https://github.com/unifiedjs/unified)-based pipeline that converts Markdown
into [pdfmake](https://github.com/bpampuch/pdfmake)'s `TDocumentDefinitions` (docDefinition)
and renders it straight to PDF bytes. No headless browser (Puppeteer, etc.) required —
PDFs are generated in plain Node.js.

## Why

Generating PDFs through a headless browser carries the cost of launching a Chrome
process, port exhaustion, and heavy resource usage under concurrency. remark-pdfmake
avoids the Markdown → HTML → CSS rendering path entirely, converting Markdown's
structure directly into pdfmake's layout elements (`text`/`stack`/`table`/`ul`/`ol`/
`canvas`/`image`), sidestepping these problems.

## Pipeline

```
markdown --(remark-parse, remark-gfm)--> mdast
        --(remark-rehype + rehype-raw)--> hast
        --(rehypeToDdast)--> ddast
        --(styleTransform + theme)--> ddast (styled)
        --(pdfmakeCompiler)--> docDefinition
        --(pdfmake)--> PDF
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the responsibilities and constraints of
each stage. The **ddast** (Document Definition AST — a unist-compliant syntax tree whose
vocabulary is pdfmake's own elements) spec itself lives in
[src/ddast/README.md](./src/ddast/README.md).

Supported Markdown syntax: GFM (tables, strikethrough, task lists, etc.), raw HTML
embedded in the body (`<br>`, `<small>`, etc.), and two pdfmake-only markers —
`<!-- width="..." -->` (a table column's preferred width) and
`<!-- pdf-page-break -->` (a forced page break) — which are HTML comments, so they
render invisibly in any other Markdown viewer.

## Install

```
npm install remark-pdfmake
```

ESM-only package (no `require()` support, since its unified/remark/rehype dependencies
are all ESM-only). Requires Node.js 22 or later.

## Usage

```ts
import { markdownToDocDefinition, renderToFile, loadFonts, DEFAULT_THEME } from "remark-pdfmake";

// Which fonts to use, under which name, and where to fetch them from is entirely up
// to the caller — remark-pdfmake has no opinion on this (see sample/generate.ts for a
// complete example with CJK support and a monospace code font).
const fonts = await loadFonts(fontCacheDir, {
  MyFont: { normal: { filename: "MyFont-Regular.ttf", url: "https://example.com/MyFont-Regular.ttf" } },
});

const dd = markdownToDocDefinition(markdown, {
  defaultStyle: { font: "MyFont", fontSize: 10 },
  theme: DEFAULT_THEME,
});
dd.pageSize = DEFAULT_THEME.page.size;
dd.pageMargins = DEFAULT_THEME.page.margins;

// renderToFile()/renderToBuffer() require this argument (no default) — pdfmake reads
// local files and fetches remote URLs on your behalf, and it's your call which of those
// to allow. Pass {} if you don't want any restriction. A rejected path/URL makes pdfmake
// throw (fail-closed) rather than silently skip it, so wrap this call in try/catch when
// processing untrusted markdown.
await renderToFile(dd, fonts, "output.pdf", {
  localAccessPolicy: (path) => path.startsWith(fontCacheDir),
  urlAccessPolicy: () => false,
});
```

It also works directly as a unified Processor (extendable with `.use()`):

```ts
import { createProcessor } from "remark-pdfmake";

const file = createProcessor({ theme: DEFAULT_THEME }).processSync(markdown);
const dd = file.result; // TDocumentDefinitions
```

...and as a remark plugin (default export), so it can be plugged into an existing
remark pipeline:

```ts
import { remark } from "remark";
import remarkPdfmake from "remark-pdfmake";

const file = remark().use(remarkPdfmake, { theme: DEFAULT_THEME }).processSync(markdown);
const dd = file.result; // TDocumentDefinitions
```

For a smaller working example, see [sample/](./sample/) (running
`sample/generate.ts` with `npx tsx` generates `sample/report.pdf` from
`sample/report.md`).

## Fonts

remark-pdfmake has no opinion on which fonts to use — the caller decides which fonts,
under which names, and from where, and hands that as a `FontSourceMap` to `loadFonts()`
(see [src/fonts/fonts.ts](./src/fonts/fonts.ts)), which fetches/caches them at runtime
(font files are not bundled in the repository) and resolves them into the
`TFontDictionary` `renderToFile()`/`renderToBuffer()` expect.
[sample/generate.ts](./sample/generate.ts) is a complete example that chooses Noto Sans
CJK JP (Japanese) and Roboto Mono (monospace `code` elements), both distributed under
the SIL Open Font License — see
[sample/licenses/README.md](./sample/licenses/README.md) for the licensing
rationale for that specific choice.

## Pre-publish verification

`pnpm test`/`pnpm run typecheck` only verify against this repository's own
`tsconfig.json` (`moduleResolution: "Bundler"`). Whether the published type
declarations (`dist/**/*.d.mts`) resolve on their own under a consumer's
`moduleResolution: "nodenext"` environment is verified separately with
`pnpm run verify:nodenext` (it installs the packed tarball into a clean project and
runs `tsc --noEmit`; this is excluded from the regular test run since it requires
network access).

## License

[MIT](./LICENSE)
