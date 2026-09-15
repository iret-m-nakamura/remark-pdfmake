# rehype-ddast

A rehype plugin that transforms hast (an HTML-equivalent syntax tree) into
[ddast](https://github.com/iret-m-nakamura/remark-pdfmake/tree/main/src/ddast) (a syntax tree
whose vocabulary is pdfmake's own layout elements).

```ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { rehypeToDdast } from "rehype-ddast";

const ddastRoot = unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeToDdast)
  .runSync(unified().use(remarkParse).parse(markdown));
```

`hastToDdast(root)` is also available as a plain function.

## Responsibilities

- Transforms markdown-derived hast elements — `ul`/`ol`/`table`, internal links (anchors),
  the `<!-- pdf-page-break -->` marker, and so on — into ddast's vocabulary.
- Also applies simple tagging: a straight 1:1 lookup from an HTML tag to a ddast role
  (`"strong"`, `"code"`, `"heading"`, etc.) that needs no theme or computation belongs here.
- The ddast it produces is still "unresolved" wherever theme-dependent appearance or
  structure would be needed — that resolution is `ddast-util-style`'s job.

For the full boundary of responsibilities (what does and doesn't belong here), see
"rehypeDdast.ts (hast → ddast)" in
[ARCHITECTURE.md](https://github.com/iret-m-nakamura/remark-pdfmake/blob/main/ARCHITECTURE.md).
