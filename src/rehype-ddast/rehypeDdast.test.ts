import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assert as assertUnist } from "unist-util-assert";
import type { Node, Parent } from "unist";
import { parseMarkdown } from "../ast.ts";
import { hastToDdast } from "./rehypeDdast.ts";
import type * as dd from "../ddast/ddast.ts";

function root(markdown: string) {
  return hastToDdast(parseMarkdown(markdown));
}

/** rehypeDdast.ts の pdfDestinationName() と同じ変換。テストからは直接参照できない
 * 内部ヘルパーなので、期待値の計算だけ同じアルゴリズムで複製する。 */
function destName(slug: string): string {
  return createHash("sha1").update(slug, "utf8").digest("hex").slice(0, 16);
}

/** dd.Text（文字列そのものの Literal ノード）を作る短縮ヘルパー（テストの期待値記述を簡潔にするため） */
function tr(value: string): dd.Text {
  return { type: "text", value };
}

describe("hastToDdast()", () => {
  it("見出しは depth に関わらず、装飾を持たない role: \"heading\" の textBlock にする（左バー・下線を付けるかどうかは theme を見て styler.ts が決める。ここでは 1:1 のタグ付けだけを行う）", () => {
    for (const [markdown, depth] of [["# 見出し", 1], ["## 見出し", 2], ["### 見出し", 3]] as const) {
      const [content] = root(markdown).children as [dd.TextBlock];
      assert.equal(content.type, "textBlock", markdown);
      assert.equal(content.role, "heading", markdown);
      assert.equal(content.depth, depth, markdown);
      assert.deepEqual(content.children, [tr("見出し")], markdown);
    }
  });

  it("見出しには marked 互換の slug を id として振り、レベルごとの出現回数を occurrence に持つ", () => {
    const md = "## 概要\n\n本文\n\n## 付録 B. サンプル 詳細（Example Details）\n";
    const [heading1, , heading2] = root(md).children as [dd.TextBlock, dd.Block, dd.TextBlock];
    assert.equal(heading1.id, destName("概要"));
    assert.equal(heading1.occurrence, 1);
    assert.equal(heading2.id, destName("付録-b-サンプル-詳細（example-details）"));
    assert.equal(heading2.occurrence, 2);
  });

  it("blockquote は装飾を持たない blockquoteBody の stack にする（左バーを付けるかどうかは theme.blockquote.bar を見て styler.ts が決める）", () => {
    const [content] = root("> 引用文\n").children as [dd.Stack];
    assert.equal(content.type, "stack");
    assert.equal(content.role, "blockquoteBody");
    const [p] = content.children as [dd.TextBlock];
    assert.deepEqual(p.children, [tr("引用文")]);
  });

  it("`<!-- pdf-page-break -->` を pageBreakMarker の textBlock（空）にする", () => {
    const [content] = root("<!-- pdf-page-break -->").children as [dd.TextBlock];
    assert.equal(content.type, "textBlock");
    assert.equal(content.role, "pageBreakMarker");
    assert.deepEqual(content.children, []);
  });

  it("段落と段落の間の `<!-- pdf-page-break -->` は、前後の段落を消さずに間に挟まる（独自タグと違い HTML コメントは常に独立したブロックとして認識されるため）", () => {
    const [before, marker, after] = root("段落0\n\n<!-- pdf-page-break -->\n\n段落2\n").children as [dd.TextBlock, dd.TextBlock, dd.TextBlock];
    assert.deepEqual(before.children, [tr("段落0")]);
    assert.equal(marker.role, "pageBreakMarker");
    assert.deepEqual(after.children, [tr("段落2")]);
  });

  it("`pdf-page-break` 以外のコメントは無視する（要素そのものを消すだけで、pageBreakMarker にはしない）", () => {
    const content = root("<!-- 普通のコメント -->").children;
    assert.deepEqual(content, []);
  });

  it("`<a href=\"#id\">` は internal:true、それ以外は internal:false のリンクにする", () => {
    const md = "[目次リンク](#section-1)、[外部リンク](https://example.com)";
    const [content] = root(md).children as [dd.TextBlock];
    const [internal, , external] = content.children as [dd.Inline, dd.Inline, dd.Inline];
    assert.deepEqual(internal, { type: "link", url: destName("section-1"), internal: true, children: [tr("目次リンク")] });
    assert.deepEqual(external, { type: "link", url: "https://example.com", internal: false, children: [tr("外部リンク")] });
  });

  it("markdown の語彙に無い未知のインラインタグ（hast は HTML そのものなので任意のタグを受け取りうる）は、role 無しの透過ノードに握りつぶさず、tagName をそのまま role として残す（styler.ts がどう解釈するかは別の関心事）", () => {
    const [content] = root("<mark>強調</mark>").children as [dd.TextBlock];
    assert.deepEqual(content.children, [{ type: "run", role: "mark", children: [tr("強調")] }]);
  });

  it("段落中の空の `<a id=\"...\"></a>` を段落の id に昇格させ、表示内容からは取り除く", () => {
    const [content] = root('<a id="section-1"></a>').children as [dd.TextBlock];
    assert.equal(content.id, destName("section-1"));
    assert.deepEqual(content.children, []);
  });

  it("GFM テーブルを table（role 無し）+ TableRow + TableCell にする。「th か td か」は pdfmake 自体に無い区別なので ddast 側には持たせず、headerRowCount と行位置だけで表す（styler.ts が判定する）", () => {
    const [content] = root("| a | b |\n|---|---|\n| 1 | 2 |\n").children as [dd.Table];
    assert.equal(content.type, "table");
    assert.equal(content.role, undefined);
    assert.equal(content.headerRowCount, 1);
    const headerCell = content.children[0].children[0];
    const bodyCell = content.children[1].children[0];
    assert.equal(headerCell.type, "tableCell");
    assert.equal(headerCell.role, undefined);
    assert.deepEqual(headerCell.children, [{ type: "textBlock", children: [tr("a")] }]);
    assert.deepEqual(bodyCell.children, [{ type: "textBlock", children: [tr("1")] }]);
  });

  it("生 HTML の table で行ごとにセル数が異なる場合、足りないセルを空セルで埋めて全行を同じ長さにする（HTML 自体は行ごとにセル数が違っても構文として妥当だが、pdfmake は Table.body の行の長さが揃っていることを要求し、揃わないと描画時に例外を投げるため）", () => {
    const html = "<table><tr><th>a</th><th>b</th><th>c</th></tr><tr><td>1</td><td>2</td></tr><tr><td>x</td><td>y</td><td>z</td><td>extra</td></tr></table>";
    const [content] = root(html).children as [dd.Table];
    assert.equal(content.type, "table");
    assert.equal(content.children.length, 3);
    for (const row of content.children) assert.equal(row.children.length, 4, "全行が最大セル数（4）に揃っている");
    // 元からセルが揃っていた行の中身は変えない
    assert.deepEqual(content.children[0].children.slice(0, 3).map((c) => c.children), [
      [{ type: "textBlock", children: [tr("a")] }],
      [{ type: "textBlock", children: [tr("b")] }],
      [{ type: "textBlock", children: [tr("c")] }],
    ]);
    // 足りない行は末尾に空セルを追加する（既存のセルは削らない）
    assert.deepEqual(content.children[1].children[0].children, [{ type: "textBlock", children: [tr("1")] }]);
    assert.deepEqual(content.children[1].children[1].children, [{ type: "textBlock", children: [tr("2")] }]);
    assert.deepEqual(content.children[1].children[2].children, [{ type: "textBlock", children: [] }]);
    assert.deepEqual(content.children[1].children[3].children, [{ type: "textBlock", children: [] }]);
  });

  it("`<!-- width=\"...\" -->` コメントで指定した列幅の希望値を TableCell 自身の width に残す（中身の TextBlock ではなくセルが持つ）", () => {
    const md = '| 要件名<!-- width="*" --> | Status |\n|---|---|\n| x | PASS |\n';
    const [content] = root(md).children as [dd.Table];
    assert.equal(content.children[0].children[0].width, "*");
    assert.equal(content.children[0].children[1].width, undefined);
  });

  it("width コメントの後ろに続くセル内のテキストを消さない", () => {
    const md = '| 要件名<!-- width="*" --> 補足テキスト | Status |\n|---|---|\n| x | PASS |\n';
    const [content] = root(md).children as [dd.Table];
    const cell = content.children[0].children[0];
    assert.equal(cell.width, "*");
    assert.deepEqual(cell.children, [{ type: "textBlock", children: [tr("要件名"), tr(" 補足テキスト")] }]);
  });

  it("tight なリスト項目は1つの textBlock、loose な項目は listItem の stack にする", () => {
    const [tight] = root("- a\n- b\n").children as [dd.List];
    assert.equal(tight.type, "ul");
    assert.equal(tight.children[0].type, "textBlock");

    const [loose] = root("- a\n\n  段落2\n\n- b\n").children as [dd.List];
    assert.equal(loose.children[0].type, "stack");
    assert.equal((loose.children[0] as dd.Stack).role, "listItem");
  });

  it("段落中に単独で置かれた画像（`![alt](src)`）は独立した Image ノードにする（pdfmake の text 配列には画像を混在させられないため）", () => {
    const [content] = root("![代替テキスト](https://example.com/pic.png)").children as [dd.Image];
    assert.equal(content.type, "image");
    assert.equal(content.src, "https://example.com/pic.png");
    assert.equal(content.width, undefined);
    assert.equal(content.height, undefined);
  });

  it("`<img width height>` の明示指定があれば width/height に反映する", () => {
    const [content] = root('<img src="https://example.com/pic.png" width="200" height="100">').children as [dd.Image];
    assert.equal(content.width, 200);
    assert.equal(content.height, 100);
  });

  it("他のテキストと混在する画像は、pdfmake の text 配列に画像を混在させられないため、前後のテキストを別の段落に分割し画像を独立したブロックとして挟み込む（画像を黙って消さない）", () => {
    const [before, image, after] = root("文中に![img](https://example.com/pic.png)入れる").children as [dd.TextBlock, dd.Image, dd.TextBlock];
    assert.equal(before.type, "textBlock");
    assert.deepEqual(before.children, [tr("文中に")]);
    assert.equal(image.type, "image");
    assert.equal(image.src, "https://example.com/pic.png");
    assert.equal(after.type, "textBlock");
    assert.deepEqual(after.children, [tr("入れる")]);
  });

  it("画像だけの段落（前後にテキストが無い）は、空の段落を作らず画像1個だけの配列にする", () => {
    const content = root("![alt](https://example.com/pic.png)").children;
    assert.equal(content.length, 1);
    assert.equal(content[0].type, "image");
  });

  it("`<a id>` から昇格した id は、画像混在段落の最初のテキスト断片にだけ付く", () => {
    const md = '<a id="anchor-1"></a>前半![img](https://example.com/pic.png)後半';
    const [before, , after] = root(md).children as [dd.TextBlock, dd.Image, dd.TextBlock];
    assert.equal(before.id, destName("anchor-1"));
    assert.equal(after.id, undefined);
  });
});

/**
 * hastToDdast() の出力が unist（`Node`/`Parent`/`Literal`）に準拠していることの検証
 * （ddast.ts のコメント参照）。ddast.ts 自身は型だけの置き場所で他ディレクトリの実装に
 * 依存しないため、「producer（rehypeDdast.ts/styler.ts）の出力が準拠しているか」の検証は
 * それぞれの producer 側でテストする（styler.ts 側は styler.test.ts 末尾を参照）。
 *
 * unist-util-assert は木を再帰的に歩き、「すべてのノードが空でない `type` を持つ」
 * 「`children` があるなら Node の1次元配列」「`value` があるなら文字列」
 * 「全プロパティが JSON 化可能（明示的な `undefined`・関数を持たない）」を検査する。
 * これが通ることが、unist-util-visit をはじめとする unified エコシステムの汎用ツールを
 * ddast にそのまま適用できることの根拠になる。
 */
describe("hastToDdast() の unist 準拠", () => {
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

  const raw = root(FIXTURE);

  it("unist として妥当（unist-util-assert が通る）", () => {
    assertUnist(raw);
  });

  it("値を持たないプロパティはキーごと省略する（明示的な `undefined` を値として持たない）", () => {
    for (const node of flatten(raw)) {
      for (const [key, value] of Object.entries(node)) {
        assert.notEqual(value, undefined, `${node.type}.${key} が明示的な undefined を持っている`);
      }
    }
  });

  it("children は常に1次元の Node 配列で、生の文字列を混ぜない（文字列そのものは Literal の text ノードで表す）", () => {
    for (const node of flatten(raw)) {
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
    const table = flatten(raw).find((n): n is dd.Table => n.type === "table");
    assert.ok(table, "GFM テーブルが見つからない");
    for (const row of table.children) {
      assert.equal(row.type, "tableRow");
      for (const cell of row.children) assert.equal(cell.type, "tableCell");
    }
  });

  it("Root は unist の Parent として、そのまま汎用ツールに渡せる（型レベルの確認）", () => {
    const asParent: Parent = raw;
    assert.equal(asParent.type, "root");
  });
});
