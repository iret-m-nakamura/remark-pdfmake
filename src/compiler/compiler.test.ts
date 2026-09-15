import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type * as dd from "ddast";
import { ddastToContent, ddastToDocDefinition } from "./compiler.ts";
import { DEFAULT_THEME } from "ddast-util-style";

/**
 * compiler.ts は「ddast に既に書き込まれている情報を pdfmake の形に転写するだけ」の層
 * （ARCHITECTURE.md 参照）。そのためここのテストは、styler.ts が値を確定させた後の
 * ddast（Decoration が既に埋まっている状態）を手で組み立て、それが pdfmake の正しい
 * キー名・shape に転写されることだけを検証する。theme に応じてどんな値になるかは
 * styler.test.ts の責務。
 */

/** dd.Text を作る短縮ヘルパー（テストの期待値記述を簡潔にするため） */
function tr(value: string): dd.Text {
  return { type: "text", value };
}

describe("ddastToContent()", () => {
  it("textBlock の Decoration（style/margin/pageBreak 等）をそのまま転写する", () => {
    const node: dd.TextBlock = { type: "textBlock", style: "h2", margin: [1, 2, 3, 4], pageBreak: "before", children: [tr("見出し")] };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    assert.equal(content.style, "h2");
    assert.deepEqual(content.margin, [1, 2, 3, 4]);
    assert.equal(content.pageBreak, "before");
    assert.deepEqual(content.text, ["見出し"]);
  });

  it("Decoration に含まれないフィールド（undefined）は出力に含めない", () => {
    const node: dd.TextBlock = { type: "textBlock", children: [tr("本文")] };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    assert.equal("style" in content, false);
    assert.equal("fillColor" in content, false);
    assert.equal("pageBreak" in content, false);
  });

  it("id を持つ textBlock には pdfmake の id を付ける（内部リンクの着地点）", () => {
    const node: dd.TextBlock = { type: "textBlock", id: "abc123", children: [tr("見出し")] };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    assert.equal(content.id, "abc123");
  });

  it("id を持つが中身が空の textBlock には、空にならないよう半角スペースを入れる。pdfmake は text が完全に空だと行を生成せず、id→着地点の登録が発火しないため。ゼロ幅スペース（U+200B）は Noto Sans CJK JP にグリフが無く tofu 表示になるため使わない", () => {
    const node: dd.TextBlock = { type: "textBlock", id: "section-1", children: [] };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    assert.equal(content.id, "section-1");
    assert.notEqual(content.text, "");
    assert.notDeepEqual(content.text, []);
    assert.equal(content.text, " ");
  });

  it("codeBlock は preserveLeadingSpaces を付けたプレーンテキストにする（theme に依存しない固定のpdfmake都合）", () => {
    const node: dd.TextBlock = { type: "textBlock", role: "codeBlock", style: "codeBlock", children: [tr("const x = 1;")] };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    assert.equal(content.text, "const x = 1;");
    assert.equal(content.preserveLeadingSpaces, true);
    assert.equal(content.style, "codeBlock");
  });

  it("`<a href=\"#id\">` は文書内リンク（linkToDestination）に、それ以外は外部リンク（link）に compile する。run.url は既に着地点名に解決済みとしてそのまま転写する", () => {
    const node: dd.TextBlock = {
      type: "textBlock",
      children: [
        { type: "link", url: "abc123", internal: true, children: [tr("目次リンク")] },
        tr("、"),
        { type: "link", url: "https://example.com", internal: false, children: [tr("外部リンク")] },
      ],
    };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    const parts = content.text as any[];
    const internal = parts.find((p) => typeof p === "object" && p.text === "目次リンク");
    const external = parts.find((p) => typeof p === "object" && p.text === "外部リンク");
    assert.deepEqual(internal, { text: "目次リンク", style: "a", linkToDestination: "abc123" });
    assert.deepEqual(external, { text: "外部リンク", style: "a", link: "https://example.com" });
  });

  it("装飾を含むリンク（例: `[**Docs**](url)`）は、ddast の構造（Link が Run を包む）をそのまま入れ子の text 配列として転写する", () => {
    const node: dd.TextBlock = {
      type: "textBlock",
      children: [{ type: "link", url: "https://example.com", internal: false, children: [{ type: "run", role: "strong", children: [tr("Docs")] }] }],
    };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    const [run] = content.text as any[];
    assert.equal(run.style, "a");
    assert.equal(run.link, "https://example.com");
    assert.deepEqual(run.text, [{ text: "Docs", style: "strong" }]);
  });

  it("外部リンクの href が http(s)/mailto/tel 以外の scheme（javascript:/data:/file: 等）だと、リンクとしての見た目（style/href）を持たないプレーンテキストにする（1つの不正なリンクのために文書全体の生成を失敗させない）", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,hi", "file:///etc/passwd", "vbscript:msgbox(1)", "other.md"]) {
      const node: dd.TextBlock = { type: "textBlock", children: [{ type: "link", url, internal: false, children: [tr("x")] }] };
      const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
      assert.deepEqual(content.text, [{ text: "x" }], `${url} はプレーンテキストになるべき`);
    }
  });

  it("外部リンクの href が空文字なら、リンク無しのテキストとして扱う（`[text]()` のような入力を許容する）", () => {
    const node: dd.TextBlock = { type: "textBlock", children: [{ type: "link", url: "", internal: false, children: [tr("x")] }] };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    assert.deepEqual(content.text, [{ text: "x" }]);
  });

  it("run.role をそのまま named style 参照にする（strong/em/code 等、テーマ参照なしの恒等写像）", () => {
    const node: dd.TextBlock = { type: "textBlock", children: [{ type: "run", role: "code", children: [tr(" x ")] }] };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    const run = (content.text as any[])[0];
    assert.equal(run.style, "code");
    assert.equal(run.text, " x ");
  });

  it("GFM テーブルは headerRowCount → headerRows、widths・padding・dontBreakRows は既に確定済みの値をそのまま転写する（styler.ts が theme.table から確定させる）", () => {
    const table: dd.Table = {
      type: "table",
      headerRowCount: 1,
      widths: ["auto", "*"],
      padding: { left: 8, right: 8, top: 4, bottom: 4 },
      dontBreakRows: true,
      margin: [0, 4, 0, 8],
      children: [
        {
          type: "tableRow",
          children: [
            { type: "tableCell", style: "th", noWrap: true, fillColor: "#1a3a5c", border: [false, false, false, true], borderColor: ["#ddd", "#ddd", "#ddd", "#ddd"], children: [{ type: "textBlock", children: [tr("a")] }] },
            { type: "tableCell", style: "th", noWrap: true, fillColor: "#1a3a5c", border: [false, false, false, true], borderColor: ["#ddd", "#ddd", "#ddd", "#ddd"], children: [{ type: "textBlock", children: [tr("b")] }] },
          ],
        },
        {
          type: "tableRow",
          children: [
            { type: "tableCell", style: "td", fillColor: "#f8fafc", border: [false, false, false, true], borderColor: ["#ddd", "#ddd", "#ddd", "#ddd"], children: [{ type: "textBlock", children: [tr("1")] }] },
            { type: "tableCell", style: "td", border: [false, false, false, true], borderColor: ["#ddd", "#ddd", "#ddd", "#ddd"], children: [{ type: "textBlock", children: [tr("2")] }] },
          ],
        },
      ],
    };
    const [content] = ddastToContent({ type: "root", children: [table] }) as any[];
    assert.equal(content.table.headerRows, 1);
    assert.equal(content.table.dontBreakRows, true);
    assert.deepEqual(content.table.widths, ["auto", "*"]);
    assert.deepEqual(content.margin, [0, 4, 0, 8]);
    const headerCell = content.table.body[0][0];
    assert.equal(headerCell.style, "th");
    assert.equal(headerCell.noWrap, true);
    assert.equal(headerCell.fillColor, "#1a3a5c");
    assert.deepEqual(headerCell.border, [false, false, false, true]);
    const zebraCell = content.table.body[1][0];
    assert.equal(zebraCell.fillColor, "#f8fafc");
    const plainCell = content.table.body[1][1];
    assert.equal("fillColor" in plainCell, false);
    // padding は行・列を無視して常に確定値を返すだけの関数として転写される
    assert.equal(content.layout.paddingLeft(0, content), 8);
    assert.equal(content.layout.paddingTop(1, content), 4);
    // hLineWidth は「線を引くかどうか」自体はセルの border が決めるため、0 でない定数を返す
    assert.notEqual(content.layout.hLineWidth(0, content), 0);
    assert.equal(content.layout.vLineWidth(0, content), 0);
  });

  it("sidebar table（h2 の左バー・引用）は widths・body をそのまま転写し、layout は固定で \"noBorders\"（theme に依存しない構造上の定数）にする", () => {
    const table: dd.Table = {
      type: "table",
      role: "sidebar",
      headerRowCount: 0,
      widths: [2, "*"],
      margin: [0, 8, 0, 4],
      children: [{
        type: "tableRow",
        children: [
          { type: "tableCell", role: "sidebarBar", fillColor: "#1a3a5c", width: 2, children: [] },
          { type: "tableCell", children: [{ type: "textBlock", style: "h2", margin: [8, 0, 0, 0], id: "見出し", children: [tr("見出し")] }] },
        ],
      }],
    };
    const [content] = ddastToContent({ type: "root", children: [table] }) as any[];
    assert.deepEqual(content.table.widths, [2, "*"]);
    // dontBreakRows は GFM データテーブル専用（compileGfmTable 側）。sidebar table は
    // 1行だけのレイアウト用途で改ページ問題自体が起きないため付けない。
    assert.equal(content.table.dontBreakRows, undefined);
    assert.equal(content.layout, "noBorders");
    assert.deepEqual(content.margin, [0, 8, 0, 4]);
    const bar = content.table.body[0][0];
    assert.equal(bar.fillColor, "#1a3a5c");
    const heading = content.table.body[0][1];
    assert.equal(heading.id, "見出し");
    assert.equal(heading.style, "h2");
  });

  it("canvas ノードの座標・太さ・色をそのまま pdfmake の canvas 配列に転写する", () => {
    const node: dd.Canvas = { type: "canvas", role: "rule", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: "#1a3a5c", margin: [0, 4, 0, 0] };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    assert.deepEqual(content.canvas, [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: "#1a3a5c" }]);
    assert.deepEqual(content.margin, [0, 4, 0, 0]);
  });

  it("ul/ol は Decoration の margin をそのまま転写する", () => {
    const node: dd.List = { type: "ul", margin: [16, 4, 0, 8], children: [{ type: "textBlock", children: [tr("a")] }] };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    assert.deepEqual(content.margin, [16, 4, 0, 8]);
    assert.ok(Array.isArray(content.ul));
  });

  it("image ノードは src/width/height/fit をそのまま pdfmake の image プロパティに転写する", () => {
    const node: dd.Image = { type: "image", src: "https://example.com/pic.png", fit: [100, 200], margin: [0, 4, 0, 8] };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    assert.equal(content.image, "https://example.com/pic.png");
    assert.deepEqual(content.fit, [100, 200]);
    assert.equal(content.width, undefined);
    assert.equal(content.height, undefined);
    assert.deepEqual(content.margin, [0, 4, 0, 8]);
  });

  it("baseDir 指定時、ローカルファイルパスの画像は baseDir と結合した絶対パスにする（process.cwd() には依存しない。path.join のみで組み立てる）", () => {
    const node: dd.Image = { type: "image", src: "sample.jpeg" };
    const [content] = ddastToContent({ type: "root", children: [node] }, "/abs/base/dir") as any[];
    assert.equal(content.image, "/abs/base/dir/sample.jpeg");
  });

  it("baseDir 指定時でも、http(s) URL・data: URI・既に絶対パスの画像はそのまま使う", () => {
    const nodes: dd.Image[] = [
      { type: "image", src: "https://example.com/pic.png" },
      { type: "image", src: "data:image/png;base64,AAAA" },
      { type: "image", src: "/already/absolute.png" },
    ];
    const contents = ddastToContent({ type: "root", children: nodes }, "/abs/base/dir") as any[];
    assert.deepEqual(contents.map((c) => c.image), ["https://example.com/pic.png", "data:image/png;base64,AAAA", "/already/absolute.png"]);
  });

  it("baseDir 未指定なら、ローカルファイルパスの画像も解決せずそのまま使う", () => {
    const node: dd.Image = { type: "image", src: "sample.jpeg" };
    const [content] = ddastToContent({ type: "root", children: [node] }) as any[];
    assert.equal(content.image, "sample.jpeg");
  });

  it("stack・ul・ol・sidebar table にネストした画像にも baseDir が伝わる", () => {
    const stack: dd.Stack = { type: "stack", children: [{ type: "image", src: "a.png" }] };
    const list: dd.List = { type: "ul", children: [{ type: "image", src: "b.png" }] };
    const sidebar: dd.Table = { type: "table", role: "sidebar", headerRowCount: 0, children: [{ type: "tableRow", children: [{ type: "tableCell", children: [{ type: "image", src: "c.png" }] }] }] };
    const [s, l, t] = ddastToContent({ type: "root", children: [stack, list, sidebar] }, "/base") as any[];
    assert.equal(s.stack[0].image, "/base/a.png");
    assert.equal(l.ul[0].image, "/base/b.png");
    assert.equal(t.table.body[0][0].image, "/base/c.png");
  });
});

describe("ddastToDocDefinition()", () => {
  it("content と h1〜h6・インライン要素・paragraph・codeBlock の named style を含む TDocumentDefinitions を返す", () => {
    const dd = ddastToDocDefinition({ type: "root", children: [{ type: "textBlock", children: [tr("本文")] }] });
    assert.ok(Array.isArray(dd.content));
    assert.ok(dd.styles && "h1" in dd.styles);
    assert.ok(dd.styles && "strong" in dd.styles);
    assert.ok(dd.styles && "code" in dd.styles);
    assert.ok(dd.styles && "paragraph" in dd.styles);
    assert.ok(dd.styles && "codeBlock" in dd.styles);
  });

  it("paragraph の lineHeight は theme.body.lineHeight（CSS の line-height 相当）から生成する", () => {
    const dd = ddastToDocDefinition({ type: "root", children: [] });
    assert.equal((dd.styles as any).paragraph.lineHeight, DEFAULT_THEME.body.lineHeight);
  });

  it("small は本文と別の色・小さいフォントサイズを持つ（CSS の font-size: 60%; color: #6b7280 相当）", () => {
    const dd = ddastToDocDefinition({ type: "root", children: [] });
    assert.equal((dd.styles as any).small.color, "#6b7280");
    assert.equal((dd.styles as any).small.fontSize, DEFAULT_THEME.inline.small.fontSize);
  });

  it("http(s) URL の画像は docDefinition.images に自身を登録する（pdfmake の URLResolver がこの辞書経由でしかリモート画像を取得できないため。render.ts 参照）", () => {
    const node: dd.Image = { type: "image", src: "https://example.com/pic.png" };
    const dd = ddastToDocDefinition({ type: "root", children: [node] });
    assert.deepEqual(dd.images, { "https://example.com/pic.png": "https://example.com/pic.png" });
  });

  it("data: URI・ローカルファイルパスの画像は images に登録しない（前者は pdfmake が自動登録し、後者はそのまま読めるため）", () => {
    const dataUri: dd.Image = { type: "image", src: "data:image/png;base64,AAAA" };
    const localPath: dd.Image = { type: "image", src: "local/pic.png" };
    const dd = ddastToDocDefinition({ type: "root", children: [dataUri, localPath] });
    assert.equal(dd.images, undefined);
  });

  it("table・stack にネストした画像も images に登録する", () => {
    const table: dd.Table = {
      type: "table",
      headerRowCount: 0,
      children: [{ type: "tableRow", children: [{ type: "tableCell", children: [{ type: "image", src: "https://example.com/in-table.png" }] }] }],
    };
    const dd = ddastToDocDefinition({ type: "root", children: [table] });
    assert.deepEqual(dd.images, { "https://example.com/in-table.png": "https://example.com/in-table.png" });
  });

  it("defaultStyle・styles のオプションを反映する", () => {
    const dd = ddastToDocDefinition(
      { type: "root", children: [] },
      { defaultStyle: { font: "NotoSansJP" }, styles: { strong: { fontSize: 99 } } },
    );
    assert.deepEqual(dd.defaultStyle, { font: "NotoSansJP" });
    assert.equal((dd.styles as any).strong.fontSize, 99);
  });
});
