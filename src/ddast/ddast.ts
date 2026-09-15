import type { Literal, Node, Parent } from "unist";

/**
 * pdfmake の `Size`（`@types/pdfmake` の `interfaces.d.ts` 参照）と同じ形をここに複製する。
 * 列幅を表す `number | "auto" | "*" | string`（`"50%"` 等）の4行だけの型のため、この
 * 型だけを使うために `pdfmake`（実装込みの巨大なパッケージ）を依存に持つ必要はない。
 * ddast.ts は unist（`Node`/`Parent`/`Literal`）以外の外部型を持たない、という方針に合わせる
 * （このファイルを独立した型パッケージとして切り出す場合、依存は `@types/unist` だけで済む）。
 */
export type Size = number | "auto" | "*" | string;

/**
 * ddast（Document Definition AST）の型定義。markdown を組版するための構造木。
 *
 * このファイルは **型だけ** を置く（mdast/hast の node 型が `@types/mdast`/`hast` という
 * 型だけのパッケージに切り出されているのと同じ考え方）。他のどのファイルの実装にも
 * 依存しない。unist（`Node`/`Parent`/`Literal`）に準拠する: すべてのノードは `type: string`
 * を持ち、`Parent.children` は1次元の `Node[]`、文字列そのものは `Literal`
 * （`{type:"text", value}`）として表現する（生の `string` を木に混在させない）。準拠すると
 * `unist-util-visit`/`unist-util-assert` 等がそのまま使える（この確認は producer 側の
 * テストが担う）。
 *
 * パイプライン全体は以下の5段階:
 *
 *   markdown → mdast → hast → ddast → ddast（見た目確定済み）→ docDefinition → PDF
 *                       ^^^^^^^^^^^^   ^^^^^^^^^^^^^^^^^^^^^^   ^^^^^^^^^^^^^
 *                        producer            styler              compiler
 *
 * - **producer**（hast → ddast）: HTML の意味（見出し・引用・強調...）を ddast の語彙
 *   （pdfmake の要素）に対応させる。role タグ（"heading"/"blockquoteBody" 等）で HTML の
 *   意味を残したまま、theme に依存しない 1:1 の対応（`<strong>` → role "strong" 等）だけを
 *   構造として確定させる
 * - **styler**（ddast → ddast）: theme（見た目の設定）を見て初めて決まる構造の組み立て
 *   （「見出しに左バーを付けるか下線にするか」「引用に左バーを付けるか」等）と、各ノードの
 *   Decoration（色・幅・余白などの具体的な値）を両方確定させる
 * - **compiler**（ddast → docDefinition）: styler が確定させた値・構造を pdfmake の形
 *   （キー名・shape）に転写するだけの層で、新しい値を計算しない。ただし ddast と
 *   docDefinition は完全な双方向変換ではない（隣接する同じ style の run を1つに結合する等、
 *   意味的に等価だが元の形には戻せない変換を含む）
 *
 * ddast は hast のような「HTML の意味」（heading/blockquote/emphasis...）を写したものでは
 * なく、**pdfmake の要素そのもの**（text/stack/table/ul/ol/canvas）を語彙にする。木の形
 * （Node/Parent/Literal）は unist に準拠させつつ、pdfmake 固有の shape（2次元の
 * `Table.body`、文字列そのものの run 等）は compiler の転写でのみ作る。
 *
 * なぜ `columns`（横並び2列）ではなく `table` で「左バー」を表現するか:
 * pdfmake は `columns` の各列に fillColor を付けても、その列自身の内容の高さ分しか
 * 塗られない（隣の列が長くても伸びない）。`table` のセル fillColor は行の高さ全体
 * （＝その行の中で一番高いセルに合わせて）自動で伸びるため、複数行になる見出し・引用でも
 * バーの高さがずれない。そのため「左バー」はいずれも
 * `{ type: "table", role: "sidebar", ... }` になる。
 */

/**
 * styler が theme を適用した後に書き込む、確定済みの見た目。pdfmake 自身のプロパティ名を
 * そのまま使う（compiler が計算せずに転写できるようにするため）。producer の出力時点では
 * すべて未設定（キー自体を持たない）で、styler がノードの種類・構造的位置（depth・行位置
 * など）に応じて埋める。値を持たないプロパティはキーごと省略する（unist-util-assert は
 * 明示的な `undefined` 値を JSON 化不可として拒否するため）。
 *
 * ここに含めるフィールドは pdfmake の `Style`/`ContentBase`（@types/pdfmake の
 * `interfaces.d.ts` 参照）に対応する、**あらゆる Content が共通に持てるプロパティ**だけに
 * 限る。`border`/`borderColor` は `Style` ではなく `TableCellProperties`
 * （`Content & TableCellProperties` としてテーブルセルに使われる場合にだけ意味を持つ）
 * 側のプロパティのため、ここには含めず {@link TableCell} 自身に持たせる（docDefinition の
 * 型定義が唯一の正解であり、ddast はそれとの1:1転写でなければならない。docDefinition が
 * 支持しない場所に型だけ持たせてはいけない）。
 */
export interface Decoration {
  /** named style（pdfmake の `styles` 辞書）への参照 */
  style?: string;
  /** テーブルセルの背景色（ヘッダー行・ゼブラ模様）、sidebar バーの塗り色など */
  fillColor?: string;
  margin?: [number, number, number, number];
  pageBreak?: "before";
  /** CJK テキストの行送り分割によるリンク断片化を防ぐためのマーカー */
  noWrap?: boolean;
}

// ---- インライン（Inline）-----------------------------------------------------
// pdfmake の "run"（インラインテキスト片）は text/stack/table のような独立した組版要素では
// なく、textBlock ノードの中身（文字列や、style 参照を持つ入れ子の run）でしかない。

/**
 * strong/em/del/u/code/small は既知のタグ（b/strong、i/em、s/del 等の別名を含む）を
 * 正規化した役割名。それ以外の HTML タグ（hast は HTML そのものなので markdown の語彙に
 * 無い任意のタグを受け取りうる）は、その tagName をそのまま role にする（`(string & {})`
 * で string リテラルの補完を残しつつ任意の文字列も受け付ける）。未知の role をどう解釈する
 * （styles 辞書に対応エントリを足す／無視する）かは styler の仕事で、producer は
 * 握りつぶさずに情報を残すことだけが責務。
 */
export type InlineRole = "strong" | "em" | "del" | "u" | "small" | "code" | (string & {});

/**
 * 文字列そのもの。unist の Literal（mdast/hast/nlcst/xast 共通の慣例で `type: "text"`）。
 * 生の `string` を木に混在させない（unist は「ノードは必ず `.type` を持つ」ため）。
 *
 * Decoration を持たない: pdfmake の text 配列では、これは常に生の `string` としてしか
 * 転写されない。文字列そのものに `style` 等のプロパティを持たせることは pdfmake の shape
 * 上できない（持たせたければ `{text, style}` という object になり、それはこの Text
 * ではなく Run が表す形）。
 */
export interface Text extends Literal {
  type: "text";
  value: string;
}

/**
 * style 参照を持つ入れ子の run（`<strong>`/`<code>` 等）。
 *
 * Decoration を持たない: role（compiler が style 参照へ転写する）以外に見た目を持たせる
 * producer が無く、compiler も role 以外の見た目プロパティを転写しない。pdfmake の
 * `ContentText`（`Style`/`ContentBase` 由来）としては fillColor/margin/pageBreak/noWrap
 * も型上は持てるが、実際に使われていない・転写されないプロパティを型に持たせない
 * （docDefinition の型定義が唯一の正解であり、ddast はそれとの1:1転写でなければならない。
 * 使われる予定ができた時点で追加する）。
 */
export interface Run extends Parent {
  type: "run";
  role: InlineRole;
  children: Inline[];
}

/**
 * `internal: false` の場合、`url` はそのまま外部 URL。
 * `internal: true` の場合、`url` は href フラグメント（`#slug`）そのものではなく、
 * TextBlock.id と同じ形式に producer が解決済みの着地点名。compiler はこれを
 * そのまま `linkToDestination` に転写するだけで、追加の変換は行わない。
 *
 * Decoration を持たない理由は Run 参照。
 */
export interface Link extends Parent {
  type: "link";
  url: string;
  internal: boolean;
  children: Inline[];
}

/** 改行（`<br>`）。子を持たない葉ノード。pdfmake の text 配列では常に `"\n"` という
 * 生の文字列にしか転写されない（Text と同じ理由で Decoration を持たない）。 */
export interface Break extends Node {
  type: "break";
}

/**
 * mdast/hast は `PhrasingContentMap`/`RootContentMap` のような map interface（各ノード種別
 * を1エントリとする interface）を経由した union にし、第三者が `declare module` で
 * エントリを追加できる拡張性を持たせている。ddast は閉じた union（このファイルの変更でしか
 * ノード種別を追加できない）にする。ddast はサードパーティによる拡張を想定せず、pdfmake の
 * 組版要素を過不足なく表現できることを不変条件とする。map interface への変更は破壊的変更に
 * なるため、拡張が必要になった時点で改めて設計する。
 */
export type Inline = Text | Run | Link | Break;

// ---- ブロック（pdfmake の要素そのもの）---------------------------------------

/**
 * pdfmake の `{text: [...]}`。role で「何のための textBlock か」を残す（producer が
 * 決める）。見た目の具体的な値（Decoration）は styler が埋める。
 *
 * unist の慣例では文字列リテラルの `type` が `"text"` になるため（上記 Text 参照）、
 * このブロック要素は `"text"` を名乗らず `"textBlock"` にする（型名の衝突ではなく
 * `type` 文字列そのものの衝突を避けるため）。
 */
export interface TextBlock extends Parent, Decoration {
  type: "textBlock";
  /**
   * "paragraph" は `<p>`（地の文）専用。リスト項目（tight な `<li>`）は同じ「役割の無い
   * textBlock」に見えても地の文ではないため区別する（styler が地の文専用の named style
   * （行間設定）を付けるかどうかの判定に使う。リスト項目には適用しない）。
   */
  role?: "heading" | "codeBlock" | "pageBreakMarker" | "paragraph";
  /** role: "heading" のときだけ意味を持つ */
  depth?: 1 | 2 | 3 | 4 | 5 | 6;
  /** role: "heading" のときだけ意味を持つ。そのレベルの見出しが文書内で何番目の出現か（1始まり）。
   * styler がこれと depth から pageBreak（Decoration）を確定させる。 */
  occurrence?: number;
  /**
   * 内部リンクの着地点名（見出しの slug、または `<a id>` から昇格した相互参照アンカーを
   * producer がハッシュ化した値。一部の PDF ビューアで slug をそのまま着地点名にすると
   * リンクを解決できない事象への対応）。
   */
  id?: string;
  children: Inline[];
}

/** pdfmake の `{stack: [...]}` */
export interface Stack extends Parent, Decoration {
  type: "stack";
  role?: "blockquoteBody" | "headingWithRule" | "listItem";
  children: Block[];
}

/**
 * テーブルのセル。pdfmake 自身は `TableCell = Content & TableCellProperties`
 * （セル用の追加プロパティを Content に直接マージする、セル専用の別ノード型は無い）だが、
 * ddast では unist の Parent（`children` は1次元の `Node[]`）に合わせるため、セルの中身
 * （通常は1要素の TextBlock、または loose な内容なら Stack）を `children` に持つ独立した
 * ノードにする。列幅の希望値・sidebar バー列の太さ（width）と、ヘッダー塗り・ゼブラ模様・
 * named style（Decoration の fillColor/style/noWrap）、罫線（border/borderColor）は
 * セル自身に持たせる（中身の TextBlock ではなく、このノードが持つ。「th か td か」という
 * 区別も pdfmake には無いため、styler が headerRowCount との行位置の比較で判定し、
 * named style（"th"/"td"）としてここに書き込む）。
 *
 * border/borderColor が Decoration ではなくここにしか無い理由: pdfmake の型定義
 * （@types/pdfmake の `TableCellProperties`）でこの2つは「Content がテーブルセルとして
 * 使われる場合にだけ意味を持つ」プロパティであり、`Style`/`ContentBase`（Decoration が
 * 対応するもの）には含まれない。docDefinition の型定義が唯一の正解であり、ddast は
 * それとの1:1転写でなければならないため、TableCell 以外のノードにこの2つを持たせない。
 */
export interface TableCell extends Parent, Decoration {
  type: "tableCell";
  /** 見出し・引用の左バー列（本文を持たない、塗り色だけのセル）。styler が theme を見て
   * 組み立てる（producer からは出力されない）。 */
  role?: "sidebarBar";
  /** 列幅の希望値（`<!-- width="..." -->` 由来）、または sidebar バー列の太さ */
  width?: Size;
  /** セルの罫線 [left, top, right, bottom]（pdfmake の `TableCellProperties.border`） */
  border?: [boolean, boolean, boolean, boolean];
  borderColor?: [string, string, string, string];
  children: Block[];
}

/** テーブルの1行。pdfmake 自身には「行」を表す専用のノード型は無く、ただの配列
 * （`TableCell[]`）でしかないが、ddast では unist の Parent に合わせて `TableRow` で包む。 */
export interface TableRow extends Parent {
  type: "tableRow";
  children: TableCell[];
}

/**
 * pdfmake の `{table: {body: [...]}}`。role: "sidebar" は左バー構成（上記コメント参照）、
 * role が無いものは GFM の通常テーブル。
 *
 * `children`（`TableRow[]`、各行は `TableCell[]`）は compiler が `Table.body:
 * TableCell[][]` に転写する際に2次元配列へ組み直す。
 *
 * `children` の各行（`TableRow.children`）は常に同じ長さを持つ（矩形）。pdfmake の
 * `Table.body: TableCell[][]` は行ごとの長さが揃っていることを要求し（揃わないと
 * `Malformed table row, a cell is undefined` で例外を投げる。pdfmake/js/DocMeasure.js
 * 参照）、生 HTML の `<table>` は行ごとにセル数が異なっていても構文として妥当なため
 * （rehypeDdast.ts 参照）、rehypeDdast.ts が producer として不足セルを空セルで埋めて
 * この不変条件を作る。
 */
export interface Table extends Parent, Decoration {
  type: "table";
  role?: "sidebar";
  /**
   * pdfmake の `Table.headerRows` に対応する。GFM テーブル由来の場合、これは推測値ではなく
   * hast の実際の `<thead>` 内の行数をそのまま数えた値。remark-gfm が GFM テーブルを
   * 解析すると常に `<thead>`/`<tbody>` に分かれるため、GFM テーブルである限り 0 になることは
   * ない。
   */
  headerRowCount: number;
  /** 列幅（`<!-- width="..." -->` 由来の希望値、または既定値から styler が確定させる） */
  widths?: Size[];
  /**
   * セルの水平・垂直パディング。pdfmake にセル単位の padding プロパティは無く、
   * テーブル全体の layout（`paddingLeft`/`Right`/`Top`/`Bottom` コールバック）でしか
   * 指定できないため、fillColor/border のように各セルへは焼き込めない。styler が theme
   * から確定させ、compiler はこれを読んで「行・列を無視して常にこの値を返すだけの」
   * コールバックを組み立てる（値の計算はしない）。
   */
  padding?: { left: number; right: number; top: number; bottom: number };
  /** pdfmake の `Table.dontBreakRows` に対応する。styler が theme から確定させる
   * （GFM テーブルのみ。sidebar table には付けない）。 */
  dontBreakRows?: boolean;
  children: TableRow[];
}

/** pdfmake の `{ul: [...]}` / `{ol: [...]}`。各子要素はそのままリスト項目のコンテンツ
 * （pdfmake 自体に「リスト項目」という独立要素は無く、ul/ol の直下に textBlock/stack を並べる） */
export interface List extends Parent, Decoration {
  type: "ul" | "ol";
  children: Block[];
}

/** pdfmake の `{canvas: [...]}`。線の座標・太さ・色（Decoration とは別に持つ、
 * 図形固有のジオメトリ）は styler が theme から確定させて埋める */
export interface Canvas extends Node, Decoration {
  type: "canvas";
  role: "rule" | "headingRule";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  lineWidth?: number;
  lineColor?: string;
}

/**
 * pdfmake の `{image: ...}`（ContentImage）。画像は textBlock の中の run（インライン）
 * には出来ない（pdfmake の text 配列は文字列・style参照付きテキストの断片しか受け付けず、
 * 画像を混在させられない）ため、`![alt](src)` が段落中に単独で現れる場合だけ、
 * 独立したブロックとして扱う。alt テキストは pdfmake 側に対応する表示手段が無いため
 * 保持しない。
 *
 * `src` は data: URI・ローカルファイルパス・http(s) URL のいずれか（producer が hast の
 * `<img src>` からそのまま転記するだけで、形式の判別はしない）。http(s) URL の場合だけ
 * compiler が docDefinition.images に登録する（pdfmake の URLResolver がその仕組みでのみ
 * リモート画像を取得できるため）。
 */
export interface Image extends Node, Decoration {
  type: "image";
  src: string;
  /** 指定が無ければ画像本来のサイズになる（width と height を両方指定すると
   * アスペクト比を保たず引き伸ばされる。pdfmake の仕様） */
  width?: number;
  height?: number;
  /** 指定が無い画像に、はみ出し防止のため styler が設定する既定の収まり枠 [width, height] */
  fit?: [number, number];
}

/** ルート・stack・ul/ol・テーブルセルの直下に置ける要素（pdfmake の1つの組版要素） */
export type Block = TextBlock | Stack | Table | List | Canvas | Image;

/** ddast に登場しうる全ノード型。木を下って処理する関数の引数には Block（または
 * Inline・TableRow・TableCell）という、より narrow な型を使う。どの関数がどの階層の
 * ノードしか受け取らないかは、対応する producer/styler/compiler の実装が持つ関心事。 */
export type DdNode = Block | TableRow | TableCell | Inline;

export interface Root extends Parent {
  type: "root";
  children: Block[];
}
