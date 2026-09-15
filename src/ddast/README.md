# ddast

**ddast**（Document Definition AST）は、pdfmake の組版要素（`text`/`stack`/`table`/`ul`/`ol`/
`canvas`/`image`）を語彙にした構文木の仕様である。[unist](https://github.com/syntax-tree/unist)
を拡張しており、その汎用ツール（`unist-util-visit` 等）をそのまま利用できる。

mdast が HTML の意味論を持たない Markdown の構文木であるのと同じように、ddast は HTML の
意味論（heading・blockquote・emphasis...）を持たない、**pdfmake がそのまま受け取れる形**の
構文木である。ddast を生成する層（hast → ddast）と、theme を見て見た目を確定させる層
（ddast → ddast）は、hast の意味論から pdfmake の語彙への変換をどう行うかという別の関心事
であり、ここでは扱わない。ddast を最終的な pdfmake の `TDocumentDefinitions`（docDefinition）
へ転写する層についても同様で、ddast は「転写元の形」だけを定義する。

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

**Root**（[Parent](https://github.com/syntax-tree/unist#parent)）は文書全体を表す。木の根
としてのみ現れ、他のノードの子にはならない（[unist の Root](https://github.com/syntax-tree/unist#root)
と同じ制約）。

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

**Decoration** は見た目が確定した後のノードが持つ、pdfmake 自身のプロパティ名をそのまま
使うフィールドの集まりで、ほとんどのブロックノードが mixin する。pdfmake の `Style`/
`ContentBase`（あらゆる Content が共通に持てるプロパティ）に対応する。値を持たないフィールド
はキーごと省略する（`undefined` という値では表現しない）。

`border`/`borderColor`（セルの罫線）は Decoration に含まれない。pdfmake の型定義では
この2つは「Content がテーブルセルとして使われる場合にだけ意味を持つ」プロパティ
（`TableCellProperties`）であり、`Style`/`ContentBase` には無いため、[TableCell](#tablecell)
自身にだけ持たせる。

## Inline content

Inline content（**Inline**）は [TextBlock](#textblock) や [TableCell](#tablecell) の中身
（文字列や、style 参照を持つ入れ子の run）を表す。pdfmake 自身には "run" という独立した
組版要素は無く、`text` プロパティの配列要素（文字列、または `{text, style}` の入れ子）を
指す呼称にすぎない。

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

**Text**（[Literal](https://github.com/syntax-tree/unist#literal)）は文字列そのものを表す。
pdfmake の text 配列では常に生の `string` としてしか現れないため、Decoration を持たない
（値を持たせたければ [Run](#run) を使う）。

### `Run`

```ts
interface Run extends Parent {
  type: "run";
  role: InlineRole;
  children: Inline[];
}

type InlineRole = "strong" | "em" | "del" | "u" | "small" | "code" | string;
```

**Run** は style 参照を持つ入れ子のインライン要素（`<strong>`/`<code>` 等に相当）を表す。
`role` は named style（pdfmake の `styles` 辞書）のキーとしてそのまま使われる。既知の6種類
以外の任意の文字列も許容する（markdown の語彙に無い HTML タグをそのまま残すため）。

### `Link`

```ts
interface Link extends Parent {
  type: "link";
  url: string;
  internal: boolean;
  children: Inline[];
}
```

**Link** はハイパーリンクを表す。`internal: false` の場合 `url` は外部 URL、`internal: true`
の場合は同一文書内の着地点名（pdfmake の `linkToDestination` にそのまま渡す値）。

### `Break`

```ts
interface Break extends Node {
  type: "break";
}
```

**Break** は改行（`<br>`）を表す、子を持たない葉ノード。pdfmake の text 配列では常に
`"\n"` という生の文字列としてしか現れない。

## Block content

Block content（**Block**）は pdfmake の1つの組版要素（root・stack・ul/ol・テーブルセルの
直下に置ける単位）を表す。

```ts
type Block = TextBlock | Stack | Table | List | Canvas | Image;
```

### `TextBlock`

```ts
interface TextBlock extends Parent, Decoration {
  type: "textBlock";
  role?: "heading" | "codeBlock" | "pageBreakMarker" | "paragraph";
  depth?: 1 | 2 | 3 | 4 | 5 | 6;    // role: "heading" のときだけ意味を持つ
  occurrence?: number;              // role: "heading" のときだけ意味を持つ
  id?: string;                      // 内部リンクの着地点名
  children: Inline[];
}
```

**TextBlock** は pdfmake の `{text: [...]}` を表す。unist の慣例では文字列リテラルの
`type` が `"text"` になるため（[Text](#text) 参照）、このブロック要素は `"text"` を
名乗らず `"textBlock"` にする。`role` で「見出し・コードブロック・改ページマーカー・
地の文のどれか」を残す。`depth`/`occurrence` は見出し専用、`id` は内部リンクの着地点。

### `Stack`

```ts
interface Stack extends Parent, Decoration {
  type: "stack";
  role?: "blockquoteBody" | "headingWithRule" | "listItem";
  children: Block[];
}
```

**Stack** は pdfmake の `{stack: [...]}`（縦に積んだブロック列）を表す。

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

**Table** は pdfmake の `{table: {body: [...]}}` を表す。`role: "sidebar"` は見出し・引用の
左バー構成（`columns` ではなく `table` を使うのは、セルの `fillColor` が行の高さ全体に
伸びる pdfmake の挙動を利用するため）、`role` が無いものは GFM の通常テーブル。`children`
（`TableRow[]`、各行は `TableCell[]`）は pdfmake の `Table.body: TableCell[][]`（2次元配列）
に転写される際に組み直される。

#### `TableRow`

```ts
interface TableRow extends Parent {
  type: "tableRow";
  children: TableCell[];
}
```

**TableRow** はテーブルの1行を表す。pdfmake 自身には「行」を表す専用のノード型は無く、
ただの配列（`TableCell[]`）でしかないが、ddast では unist の Parent に合わせて包む。

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

**TableCell** はテーブルのセルを表す。pdfmake 自身は `TableCell = Content & TableCellProperties`
（セル用の追加プロパティを Content に直接マージする、セル専用の別ノード型は無い）だが、
ddast では unist の Parent（`children` は1次元の `Node[]`）に合わせるため、セルの中身
（通常は1要素の [TextBlock](#textblock)、または loose な内容なら [Stack](#stack)）を
`children` に持つ独立したノードにする。`border`/`borderColor` は [Decoration](#decoration)
ではなくこのノード自身にだけ持たせる（[Decoration](#decoration) 参照）。

### `List`

```ts
interface List extends Parent, Decoration {
  type: "ul" | "ol";
  children: Block[];
}
```

**List** は pdfmake の `{ul: [...]}` / `{ol: [...]}` を表す。pdfmake 自体に「リスト項目」
という独立要素は無く、`ul`/`ol` の直下に子（[TextBlock](#textblock) や [Stack](#stack)）を
並べる。

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

**Canvas** は pdfmake の `{canvas: [...]}`（水平線）を表す、子を持たない葉ノード。

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

**Image** は pdfmake の `{image: ...}`（`ContentImage`）を表す、子を持たない葉ノード。
`src` は data: URI・ローカルファイルパス・http(s) URL のいずれか。width/height を両方
指定するとアスペクト比を保たず引き伸ばされる（pdfmake の仕様）。`fit` は縦横比を保ったまま
収める枠。

## Glossary

すべてのノード種別（[Block](#block-content) と [Inline](#inline-content) を合わせたもの）
を1つの union にしたものを **DdNode** と呼ぶ。木を下って処理する関数の引数には、実際に
受け取る階層に応じてこれより narrow な型（Block・Inline・TableRow・TableCell）を使う。

```ts
type DdNode = Block | TableRow | TableCell | Inline;
```

**Size**（[Table](#table)/[TableCell](#tablecell) の列幅）は `number | "auto" | "*" | string`
（数値・`"auto"`・`"*"`・`"50%"` 等の文字列）。pdfmake 自身の `Size` 型と同じ形。

その他の用語は [unist](https://github.com/syntax-tree/unist#nodes) の定義（Node・Parent・
Literal）に従う。

### 拡張性についての注記

mdast/hast は `PhrasingContentMap`/`RootContentMap` のような map interface を経由した
union にし、第三者が `declare module` でエントリを追加できる拡張性を持たせている。ddast は
現状、`Block`/`Inline` を閉じた union のままにしている（このドキュメント／`ddast.ts` の
変更でしかノード種別を追加できない）。map interface への変更は破壊的変更になるため、
サードパーティによる拡張が実際に必要になった時点で改めて要否を判断する。

## License

[MIT](../../LICENSE)（remark-pdfmake 全体と同じ）
