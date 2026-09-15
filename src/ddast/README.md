# ddast

**ddast** (Document Definition AST) is the spec for a syntax tree whose vocabulary is
pdfmake's own layout elements (`text`/`stack`/`table`/`ul`/`ol`/`canvas`/`image`). It extends
[unist](https://github.com/syntax-tree/unist), so unist's generic tooling (`unist-util-visit`,
etc.) works on it directly.

Just as mdast is a Markdown syntax tree with no HTML semantics, ddast is a syntax tree with no
HTML semantics (heading, blockquote, emphasis, ...) — it's shaped so that **pdfmake can take it
as-is**. How HTML semantics get mapped onto pdfmake's vocabulary is a separate concern handled
by the layer that produces ddast (hast → ddast) and the layer that fixes its appearance using a
theme (ddast → ddast); neither is this package's concern. The same goes for the layer that
finally transcribes ddast into pdfmake's `TDocumentDefinitions` (docDefinition) — ddast defines
only "the shape being transcribed from".

## Contents

* [Nodes](#nodes)
  * [Root](#root)
  * [Decoration](#decoration)
* [Inline content](#inline-content)
  * [Text](#text)
  * [Run](#run)
  * [Link](#link)
  * [Break](#break)
* [Block content](#block-content)
  * [TextBlock](#textblock)
  * [Stack](#stack)
  * [Table content](#table-content)
    * [Table](#table)
    * [TableRow](#tablerow)
    * [TableCell](#tablecell)
  * [List](#list)
  * [Canvas](#canvas)
  * [Image](#image)
* [Glossary](#glossary)

## Nodes

### `Root`

```ts
interface Root extends Parent {
  type: "root";
  children: Block[];
}
```

**Root** ([Parent](https://github.com/syntax-tree/unist#parent)) represents the whole document.
It only ever appears as the root of the tree, never as another node's child (the same
constraint as [unist's Root](https://github.com/syntax-tree/unist#root)).

### `Decoration`

```ts
interface Decoration {
  style?: string;
  fillColor?: string;
  margin?: [number, number, number, number];
  pageBreak?: "before";
  noWrap?: boolean;
}
```

**Decoration** is the set of fields, using pdfmake's own property names as-is, that a node
carries once its appearance has been fixed; most block nodes mix it in. It corresponds to
pdfmake's `Style`/`ContentBase` (properties every Content can carry). A field with no value is
omitted entirely by key (never represented as an explicit `undefined`).

`border`/`borderColor` (a cell's borders) are not part of Decoration. In pdfmake's own type
definitions these two only make sense "when a Content is used as a table cell"
(`TableCellProperties`) — they aren't part of `Style`/`ContentBase` — so only
[TableCell](#tablecell) itself carries them.

## Inline content

Inline content (**Inline**) is what makes up the contents of a [TextBlock](#textblock) or
[TableCell](#tablecell) (a string, or a nested run carrying a style reference). pdfmake itself
has no independent layout element called a "run" — it's just a name for an element of the
`text` property's array (a string, or a nested `{text, style}`).

```ts
type Inline = Text | Run | Link | Break;
```

### `Text`

```ts
interface Text extends Literal {
  type: "text";
  value: string;
}
```

**Text** ([Literal](https://github.com/syntax-tree/unist#literal)) represents a plain string.
In pdfmake's text array it only ever appears as a raw `string`, so it carries no Decoration
(use [Run](#run) if you need to attach one).

### `Run`

```ts
interface Run extends Parent {
  type: "run";
  role: InlineRole;
  children: Inline[];
}
```

**Run** represents a nested inline element carrying a style reference (the equivalent of
`<strong>`/`<code>`, etc.). `role` is used directly as a key into the named style dictionary
(pdfmake's `styles`). Any string beyond the 6 known ones is also allowed, so an HTML tag with
no markdown equivalent can be preserved as-is.

### `Link`

```ts
interface Link extends Parent {
  type: "link";
  url: string;
  internal: boolean;
  children: Inline[];
}
```

**Link** represents a hyperlink. When `internal: false`, `url` is an external URL; when
`internal: true`, it's a destination name within the same document (passed straight through to
pdfmake's `linkToDestination`).

### `Break`

```ts
interface Break extends Node {
  type: "break";
}
```

**Break** is a childless leaf node representing a line break (`<br>`). In pdfmake's text array
it only ever appears as a raw `"\n"` string.

## Block content

Block content (**Block**) represents a single pdfmake layout element (a unit that can be placed
directly under root, a stack, a list, or a table cell).

```ts
type Block = TextBlock | Stack | Table | List | Canvas | Image;
```

### `TextBlock`

```ts
interface TextBlock extends Parent, Decoration {
  type: "textBlock";
  role?: "heading" | "codeBlock" | "pageBreakMarker" | "paragraph";
  depth?: 1 | 2 | 3 | 4 | 5 | 6;    // only meaningful when role: "heading"
  occurrence?: number;              // only meaningful when role: "heading"
  id?: string;                      // internal link destination name
  children: Inline[];
}
```

**TextBlock** represents pdfmake's `{text: [...]}`. Since unist convention already reserves
`type: "text"` for the string literal node (see [Text](#text)), this block element is named
`"textBlock"` instead. `role` records whether it's a heading, code block, page-break marker, or
plain paragraph. `depth`/`occurrence` only apply to headings; `id` is an internal link's
destination.

### `Stack`

```ts
interface Stack extends Parent, Decoration {
  type: "stack";
  role?: "blockquoteBody" | "headingWithRule" | "listItem";
  children: Block[];
}
```

**Stack** represents pdfmake's `{stack: [...]}` (a vertically stacked sequence of blocks).

### Table content

#### `Table`

```ts
interface Table extends Parent, Decoration {
  type: "table";
  role?: "sidebar";
  headerRowCount: number;
  widths?: Size[];
  padding?: { left: number; right: number; top: number; bottom: number };
  dontBreakRows?: boolean;
  children: TableRow[];
}
```

**Table** represents pdfmake's `{table: {body: [...]}}`. `role: "sidebar"` is the left-bar
layout used for headings and blockquotes (a `table` is used instead of `columns` specifically
to exploit pdfmake's behavior of stretching a cell's `fillColor` across the full row height);
a `Table` with no `role` is a plain GFM table. `children` (`TableRow[]`, each row holding
`TableCell[]`) gets reassembled when transcribed into pdfmake's `Table.body: TableCell[][]`
(a 2D array).

#### `TableRow`

```ts
interface TableRow extends Parent {
  type: "tableRow";
  children: TableCell[];
}
```

**TableRow** represents one row of a table. pdfmake itself has no dedicated node type for a
"row" — it's just a plain array (`TableCell[]`) — but ddast wraps it in a node to match unist's
Parent shape.

#### `TableCell`

```ts
interface TableCell extends Parent, Decoration {
  type: "tableCell";
  role?: "sidebarBar";
  width?: Size;
  border?: [boolean, boolean, boolean, boolean];
  borderColor?: [string, string, string, string];
  children: Block[];
}
```

**TableCell** represents a table cell. pdfmake itself defines
`TableCell = Content & TableCellProperties` (cell-specific properties are merged directly onto
a Content — there's no separate node type for a cell), but ddast makes it an independent node
with `children` (a 1-dimensional `Node[]`, matching unist's Parent) holding the cell's contents
(normally a single [TextBlock](#textblock), or a [Stack](#stack) for loose content).
`border`/`borderColor` live only on this node itself, not in [Decoration](#decoration) (see
[Decoration](#decoration)).

### `List`

```ts
interface List extends Parent, Decoration {
  type: "ul" | "ol";
  children: Block[];
}
```

**List** represents pdfmake's `{ul: [...]}` / `{ol: [...]}`. pdfmake has no independent "list
item" element of its own — children ([TextBlock](#textblock) or [Stack](#stack)) sit directly
under `ul`/`ol`.

### `Canvas`

```ts
interface Canvas extends Node, Decoration {
  type: "canvas";
  role: "rule" | "headingRule";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  lineWidth?: number;
  lineColor?: string;
}
```

**Canvas** is a childless leaf node representing pdfmake's `{canvas: [...]}` (a horizontal
rule).

### `Image`

```ts
interface Image extends Node, Decoration {
  type: "image";
  src: string;
  width?: number;
  height?: number;
  fit?: [number, number];
}
```

**Image** is a childless leaf node representing pdfmake's `{image: ...}` (`ContentImage`).
`src` is a data: URI, a local file path, or an http(s) URL. Specifying both width and height
stretches the image without preserving aspect ratio (pdfmake's own behavior); `fit` is a
bounding box that preserves aspect ratio.

## Glossary

The union of every node type ([Block](#block-content) and [Inline](#inline-content) combined)
is called **DdNode**. Functions that walk the tree use a narrower type appropriate to the level
they actually receive (Block, Inline, TableRow, TableCell), not this union.

```ts
type DdNode = Block | TableRow | TableCell | Inline;
```

**Size** (a [Table](#table)/[TableCell](#tablecell) column width) is
`number | "auto" | "*" | string` (a number, `"auto"`, `"*"`, or a string like `"50%"`) — the
same shape as pdfmake's own `Size` type.

Every other term follows [unist](https://github.com/syntax-tree/unist#nodes)'s own definitions
(Node, Parent, Literal).

### A note on extensibility

mdast/hast achieve third-party extensibility by routing their unions through a map interface
(`PhrasingContentMap`/`RootContentMap`, etc.) that a third party can add entries to via
`declare module`. ddast currently keeps `Block`/`Inline` as closed unions (a node type can only
be added by changing this document and `ddast.ts`). Moving to a map interface would be a
breaking change, so that decision is deferred until third-party extension is actually needed.

## License

[MIT](../../LICENSE) (same as remark-pdfmake as a whole)
