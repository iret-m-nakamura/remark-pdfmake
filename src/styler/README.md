# ddast-util-style

A ddast → ddast utility that applies a theme to
[ddast](https://github.com/iret-m-nakamura/remark-pdfmake/tree/main/src/ddast), fixing its
appearance.

```ts
import { styleDdast, DEFAULT_THEME, mergeTheme } from "ddast-util-style";

const styled = styleDdast(ddastRoot, mergeTheme(DEFAULT_THEME, { heading: { decorations: [] } }));
```

Also usable as a unified Transformer (`styleTransform`).

## Responsibilities

- Takes a theme and writes **fixed, final appearance values** onto ddast nodes (a heading's
  left bar vs. underline, whether a blockquote gets a bar, table zebra fills and borders,
  named style names, and so on).
- Finishes any **structural decisions that only a theme can settle** here (e.g. whether a
  heading becomes a sidebar table or a headingWithRule) — never carries pdfmake-specific key
  names or shapes (`ContentTable`, etc.). It stays within ddast's own vocabulary; the actual
  transcription into pdfmake's shape is `ddast-util-to-pdfmake`'s job.

For the full boundary of responsibilities, see "styler.ts (ddast → ddast)" in
[ARCHITECTURE.md](https://github.com/iret-m-nakamura/remark-pdfmake/blob/main/ARCHITECTURE.md).
