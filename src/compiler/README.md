# ddast-util-to-pdfmake

A utility that transcribes an already-styled
[ddast](https://github.com/iret-m-nakamura/remark-pdfmake/tree/main/src/ddast) tree into
[pdfmake](https://github.com/bpampuch/pdfmake)'s `TDocumentDefinitions` (docDefinition).

```ts
import { ddastToDocDefinition } from "ddast-util-to-pdfmake";

const dd = ddastToDocDefinition(styledDdastRoot, { baseDir: import.meta.dirname });
```

Also usable as a unified Compiler (`pdfmakeCompiler`).

## Responsibilities

- Transcribes **only the information already written into ddast** into pdfmake's key names
  and shapes — it never computes a new value (color, size, lineHeight, fillColor, coordinates,
  ...) from a structural fact such as `depth`/`role`/row position.
- Three exceptions are the compiler's own job: assembling the named style dictionary (theme →
  `docDefinition.styles`), joining a local image path with `baseDir`, and validating an
  external link's URL scheme (rejecting `javascript:` etc.).
- Does not validate whether an image/font/attachment is actually allowed to be read — pdfmake
  itself reads/fetches those, and the caller decides what's allowed via `pdfmake-render`'s
  `RenderPolicy`.

For the full boundary of responsibilities (including the rationale for the three exceptions),
see "compiler.ts (ddast → docDefinition)" in
[ARCHITECTURE.md](https://github.com/iret-m-nakamura/remark-pdfmake/blob/main/ARCHITECTURE.md).
