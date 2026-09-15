import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assert as assertUnist } from "unist-util-assert";
import type { Node, Parent } from "unist";
import { parseMarkdown } from "remark-pdfmake";
import { hastToDdast } from "rehype-ddast";
import { styleDdast } from "./styler.ts";
import { DEFAULT_THEME, contentWidthOf, mergeTheme } from "./theme.ts";
import type * as dd from "ddast";

function style(markdown: string, theme = DEFAULT_THEME) {
  return styleDdast(hastToDdast(parseMarkdown(markdown)), theme).children;
}

describe("styleDdast()", () => {
  it("h1 の headingWithRule に named style（h1）・margin・下線の canvas 座標を確定させる", () => {
    const [content] = style("# 見出し") as [dd.Stack];
    assert.equal(content.type, "stack");
    const [heading, rule] = content.children as [dd.TextBlock, dd.Canvas];
    assert.equal(heading.style, "h1");
    assert.deepEqual(heading.margin, DEFAULT_THEME.heading.margin);
    assert.equal(rule.lineWidth, DEFAULT_THEME.heading.decorations[1]!.rule!.width);
    assert.equal(rule.lineColor, DEFAULT_THEME.heading.decorations[1]!.rule!.color);
    assert.equal(rule.x2, contentWidthOf(DEFAULT_THEME));
  });

  it("h2 の sidebar table に named style（h2）・バーの色/太さ・id を確定させる", () => {
    const [content] = style("## 見出し") as [dd.Table];
    assert.equal(content.type, "table");
    assert.deepEqual(content.widths, [DEFAULT_THEME.heading.decorations[2]!.bar!.width, "*"]);
    const [bar, body] = content.children[0].children;
    assert.equal(bar.role, "sidebarBar");
    assert.equal(bar.fillColor, DEFAULT_THEME.heading.decorations[2]!.bar!.color);
    const heading = body.children[0] as dd.TextBlock;
    assert.equal(heading.style, "h2");
    assert.equal(typeof heading.id, "string"); // id はハッシュ化済みの値（rehypeDdast.ts の責務。形式のみ確認）
  });

  it("2つ目以降の h2 には pageBreak: before を付け、最初の h2 には付けない（CSS の h2:first-of-type 相当）", () => {
    const md = "## 概要\n\n本文\n\n## 1. サンプル見出し\n\n本文\n\n## 2. サンプル見出し\n";
    const headings = (style(md) as dd.Table[]).filter((c) => c.type === "table");
    assert.equal(headings.length, 3);
    assert.equal(headings[0].pageBreak, undefined);
    assert.equal(headings[1].pageBreak, "before");
    assert.equal(headings[2].pageBreak, "before");
  });

  it("h1/h3 には pageBreak を付けない", () => {
    const [h1, h3] = style("# タイトル\n\n### 小見出し\n") as [dd.Stack, dd.TextBlock];
    assert.equal(h1.pageBreak, undefined);
    assert.equal(h3.pageBreak, undefined);
  });

  it("引用は sidebar table に、バー色・背景色・named style（blockquoteText）を確定させる", () => {
    const [content] = style("> 引用文\n") as [dd.Table];
    assert.equal(content.type, "table");
    const [bar, bodyCell] = content.children[0].children;
    assert.equal(bar.fillColor, DEFAULT_THEME.blockquote.bar!.color);
    const body = bodyCell.children[0] as dd.Stack;
    assert.equal(body.fillColor, DEFAULT_THEME.blockquote.background);
    assert.equal(body.style, "blockquoteText");
  });

  it("地の文（role: paragraph）には named style（paragraph）を付けるが、見出し・テーブルセル・リスト項目には付けない", () => {
    const [para] = style("本文") as [dd.TextBlock];
    assert.equal(para.style, "paragraph");

    const heading = (style("# 見出し")[0] as dd.Stack).children[0] as dd.TextBlock;
    assert.notEqual(heading.style, "paragraph");

    const [table] = style("| a |\n|---|\n| 1 |\n") as [dd.Table];
    const cellText = table.children[0].children[0].children[0] as dd.TextBlock;
    assert.notEqual(cellText.style, "paragraph");

    const [list] = style("- a\n- b\n") as [dd.List];
    const item = list.children[0] as dd.TextBlock;
    assert.notEqual(item.style, "paragraph");
  });

  it("code run には theme.code.paddingChars 個の半角スペースを前後に足す", () => {
    const [content] = style("`sample-code-123`") as [dd.TextBlock];
    const run = content.children[0] as any;
    assert.equal(run.role, "code");
    assert.equal(run.children[0].value, " sample-code-123 ");
  });

  it("GFM テーブルはヘッダー行・ゼブラ行に fillColor を、全行に下端の border を確定させる。上端には線を引かない", () => {
    const [content] = style("| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n") as [dd.Table];
    const header = content.children[0].children[0];
    const row1 = content.children[1].children[0]; // 最初の本文行（ゼブラ無し）
    const row2 = content.children[2].children[0]; // 2番目の本文行（ゼブラあり）
    assert.equal(header.fillColor, DEFAULT_THEME.table.header.fill);
    assert.equal(header.style, "th");
    assert.equal(header.noWrap, true);
    assert.equal(row1.fillColor, undefined);
    assert.equal(row1.style, "td");
    assert.equal(row2.fillColor, DEFAULT_THEME.table.zebraFill);
    // 全セルの下端に border を引く（最終行含む。CSS の td { border-bottom } 相当）
    for (const row of content.children) {
      for (const cell of row.children) {
        assert.deepEqual(cell.border, [false, false, false, true]);
      }
    }
    // 幅指定が1つも無い場合、頼まれていないのに最後の列を "*" に広げたりはしない
    assert.deepEqual(content.widths, ["auto", "auto", "auto"]);
    assert.deepEqual(content.padding, DEFAULT_THEME.table.padding);
  });

  it("`<!-- width=\"...\" -->` 指定があれば widths に反映する", () => {
    const md = '| 要件名<!-- width="*" --> | Status |\n|---|---|\n| x | PASS |\n';
    const [content] = style(md) as [dd.Table];
    assert.deepEqual(content.widths, ["*", DEFAULT_THEME.table.defaultColumnWidth]);
  });

  it("ul/ol には theme.list.margin を確定させる", () => {
    const [ul] = style("- a\n- b\n") as [dd.List];
    assert.deepEqual(ul.margin, DEFAULT_THEME.list.margin);
  });

  it("mergeTheme() で個別の値だけ上書きできる（例: h2 のバー幅）", () => {
    const theme = mergeTheme(DEFAULT_THEME, { heading: { decorations: { 2: { bar: { width: 99 } } } } });
    const [content] = style("## 見出し", theme) as [dd.Table];
    assert.equal(content.widths![0], 99);
    // 上書きしていない色は既定値のまま（タプル的な丸ごと置換ではなくキー単位でマージされる）
    const [bar] = content.children[0].children;
    assert.equal(bar.fillColor, DEFAULT_THEME.heading.decorations[2]!.bar!.color);
  });

  it("id を持つが中身が空の段落（<a id=\"...\"></a> だけのアンカー）はそのまま通す（空にする処理は compiler.ts 側。ここでは id が消えないことだけ確認する）", () => {
    const [content] = style('<a id="section-1"></a>') as [dd.TextBlock];
    assert.equal(typeof content.id, "string");
    assert.deepEqual(content.children, []);
  });

  it("GFM テーブルに theme.table.dontBreakRows を確定させる", () => {
    const [content] = style("| a |\n|---|\n| 1 |\n") as [dd.Table];
    assert.equal(content.dontBreakRows, DEFAULT_THEME.table.dontBreakRows);
  });

  // 以下、rehypeDdast.ts を一切触らずに theme だけで見出し・引用の構造を切り替えられる
  // ことを確認する（rehypeDdast.ts は depth ごとの装飾を知らない。ARCHITECTURE.md 参照）。

  it("theme から h2 の decorations を消すと、rehypeDdast.ts を触らずに sidebar table ではない装飾無しの見出しになる", () => {
    // mergeTheme() は「キーを undefined で上書き」を「上書きしない」として扱う設計
    // （theme.ts のコメント参照）ため、ここでは decorations オブジェクトを直接組み立てる。
    const theme = { ...DEFAULT_THEME, heading: { ...DEFAULT_THEME.heading, decorations: { 1: DEFAULT_THEME.heading.decorations[1] } } };
    const [content] = style("## 見出し", theme) as [dd.TextBlock];
    assert.equal(content.type, "textBlock");
    assert.equal(content.style, "h2");
  });

  it("theme で h4（既定では装飾無し）に bar を追加すると、rehypeDdast.ts を触らずに sidebar table になる", () => {
    const theme = mergeTheme(DEFAULT_THEME, { heading: { decorations: { 4: { bar: { color: "#123456", width: 3, gap: 5 } } } } });
    const [content] = style("#### 見出し", theme) as [dd.Table];
    assert.equal(content.type, "table");
    assert.equal(content.role, "sidebar");
    const [bar, body] = content.children[0].children;
    assert.equal(bar.fillColor, "#123456");
    assert.equal((body.children[0] as dd.TextBlock).style, "h4");
  });

  it("theme で h1 の rule を消すと、rehypeDdast.ts を触らずに headingWithRule ではない装飾無しの見出しになる", () => {
    const theme = { ...DEFAULT_THEME, heading: { ...DEFAULT_THEME.heading, decorations: { 2: DEFAULT_THEME.heading.decorations[2] } } };
    const [content] = style("# 見出し", theme) as [dd.TextBlock];
    assert.equal(content.type, "textBlock");
    assert.equal(content.style, "h1");
  });

  it("theme.blockquote.bar が無ければ、rehypeDdast.ts を触らずに sidebar table ではない（バー無しの）引用になる", () => {
    const theme = mergeTheme(DEFAULT_THEME, { blockquote: { bar: null } });
    const [content] = style("> 引用文\n", theme) as [dd.Stack];
    assert.equal(content.type, "stack");
    assert.equal(content.style, "blockquoteText");
    assert.equal(content.fillColor, DEFAULT_THEME.blockquote.background);
  });

  it("width/height の明示指定が無い画像は、本文幅に収める fit を確定させる", () => {
    const [content] = style("![alt](https://example.com/pic.png)") as [dd.Image];
    assert.equal(content.type, "image");
    assert.deepEqual(content.fit, [contentWidthOf(DEFAULT_THEME), contentWidthOf(DEFAULT_THEME) * 10]);
    assert.deepEqual(content.margin, DEFAULT_THEME.image.margin);
  });

  it("width/height の明示指定がある画像には fit を付けず、指定値をそのまま尊重する", () => {
    const [content] = style('<img src="https://example.com/pic.png" width="200" height="100">') as [dd.Image];
    assert.equal(content.width, 200);
    assert.equal(content.height, 100);
    assert.equal(content.fit, undefined);
  });
});

/**
 * styleDdast() の出力（見た目確定後）が unist（`Node`/`Parent`/`Literal`）に準拠している
 * ことの検証（ddast.ts のコメント参照）。ddast.ts 自身は型だけの置き場所で他ディレクトリの
 * 実装に依存しないため、「producer の出力が準拠しているか」の検証はそれぞれの producer 側で
 * テストする（rehypeDdast.ts 側は rehypeDdast.test.ts 末尾を参照）。
 *
 * unist-util-assert は木を再帰的に歩き、「すべてのノードが空でない `type` を持つ」
 * 「`children` があるなら Node の1次元配列」「`value` があるなら文字列」
 * 「全プロパティが JSON 化可能（明示的な `undefined`・関数を持たない）」を検査する。
 * styler.ts は theme を見て Decoration を書き込む唯一の層なので、明示的な `undefined` を
 * 生みやすい箇所（`pageBreak`・`style` 等の条件付きプロパティ）の回帰はここで検出する。
 */
describe("styleDdast() の unist 準拠", () => {
  /** ddast のノード型を一通り出現させる入力（heading/paragraph/blockquote/list/table/
   * codeBlock/rule/image と、インラインの strong/em/del/code/link/break）。 */
  const FIXTURE = [
    "# h1 見出し",
    "",
    '<a id="anchor-1"></a>',
    "",
    "本文に **強調**・*斜体*・~~打ち消し~~・`code`・[外部](https://example.com)・[内部](#h1-見出し)・改行<br>あり。",
    "",
    "## h2 見出し",
    "",
    "> 引用文",
    ">",
    "> 引用の2段落目",
    "",
    "- tight 項目",
    "- もう1つ",
    "",
    "- loose 項目",
    "",
    "  その2段落目",
    "",
    '| 見出しA<!-- width="*" --> | 見出しB |',
    "|---|---|",
    "| a | b |",
    "| c | d |",
    "",
    "```",
    "const x = 1;",
    "```",
    "",
    "---",
    "",
    "![代替テキスト](https://example.com/pic.png)",
    "",
    "<!-- pdf-page-break -->",
    "",
    "最終段落。",
    "",
  ].join("\n");

  /** 木の全ノードを1つの配列にする（unist の Parent 契約だけを使う汎用の walk。
   * ddast 固有の型を一切知らないコードが木を歩けること自体が準拠の確認になる）。 */
  function flatten(node: Node): Node[] {
    const children = (node as Parent).children;
    if (!Array.isArray(children)) return [node];
    return [node, ...children.flatMap(flatten)];
  }

  const styled = styleDdast(hastToDdast(parseMarkdown(FIXTURE)), DEFAULT_THEME);

  it("unist として妥当（unist-util-assert が通る）", () => {
    assertUnist(styled);
  });

  it("値を持たないプロパティはキーごと省略する（明示的な `undefined` を値として持たない）", () => {
    for (const node of flatten(styled)) {
      for (const [key, value] of Object.entries(node)) {
        assert.notEqual(value, undefined, `${node.type}.${key} が明示的な undefined を持っている`);
      }
    }
  });

  it("children は常に1次元の Node 配列で、生の文字列を混ぜない（文字列そのものは Literal の text ノードで表す）", () => {
    for (const node of flatten(styled)) {
      const children = (node as Parent).children;
      if (children === undefined) continue;
      assert.ok(Array.isArray(children), `${node.type}.children が配列ではない`);
      for (const child of children) {
        assert.equal(typeof child, "object", `${node.type}.children に非オブジェクトが混ざっている`);
        assert.equal(typeof (child as Node).type, "string", `${node.type}.children の要素が type を持たない`);
      }
    }
  });

  it("テーブルは pdfmake の2次元配列ではなく tableRow/tableCell の入れ子で表す（2次元化は compiler.ts の転写でのみ行う）", () => {
    const table = flatten(styled).find((n): n is dd.Table => n.type === "table" && (n as dd.Table).role === undefined);
    assert.ok(table, "GFM テーブルが見つからない");
    for (const row of table.children) {
      assert.equal(row.type, "tableRow");
      for (const cell of row.children) assert.equal(cell.type, "tableCell");
    }
  });

  it("Root は unist の Parent として、そのまま汎用ツールに渡せる（型レベルの確認）", () => {
    const asParent: Parent = styled;
    assert.equal(asParent.type, "root");
  });
});
