# pdfmake-render

A thin wrapper that renders a [pdfmake](https://github.com/bpampuch/pdfmake)
`TDocumentDefinitions` into actual PDF bytes, plus a utility that fetches and caches whatever
fonts the caller points it at. Neither touches tree structures (ddast/docDefinition).

```ts
import { loadFonts, renderToBuffer } from "pdfmake-render";

const fonts = await loadFonts(fontCacheDir, {
  MyFont: { normal: { filename: "MyFont-Regular.ttf", url: "https://example.com/MyFont-Regular.ttf" } },
});

const buffer = await renderToBuffer(dd, fonts, {
  localAccessPolicy: (path) => path.startsWith(fontCacheDir),
  urlAccessPolicy: () => false,
});
```

## Responsibilities

- **render**: a thin wrapper around pdfmake's own Node API (`PdfPrinter`/`URLResolver`/
  `virtual-fs`) — no independent judgment about network or file access. `RenderPolicy`
  (`localAccessPolicy`/`urlAccessPolicy`) is passed straight through to pdfmake's own
  `setLocalAccessPolicy()`/`setUrlAccessPolicy()`. It's a required argument by design — the
  caller must always make this choice explicitly; pass `{}` if no restriction is needed.
- **fonts**: which fonts to use, under which names, and from where is entirely up to the
  caller, expressed as a `FontSourceMap`. `loadFonts()` only fetches and caches what it's
  told — choosing fonts is not this package's concern.

For the full boundary of responsibilities, see "render.ts (docDefinition → PDF bytes)" in
[ARCHITECTURE.md](https://github.com/iret-m-nakamura/remark-pdfmake/blob/main/ARCHITECTURE.md).
