import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createProcessor, markdownToDocDefinition } from "./processor.ts";
import { renderToBuffer, withFontFallback, loadFonts, fontSupports } from "pdfmake-render";
import { TEST_BODY_FONT, TEST_CODE_FONT, TEST_FONT_SOURCES } from "./render/fonts/testFontSources.ts";
import { DEFAULT_THEME, mergeTheme } from "ddast-util-style";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

/**
 * 結合テスト: Markdown → mdast → hast → ddast → ddast（見た目確定済み）→ docDefinition
 * → PDF バイト列という unified パイプライン全体（ARCHITECTURE.md 参照）が、個別の単体テスト
 * （rehypeDdast.test.ts / styler.test.ts / compiler.test.ts はそれぞれ ddast を手で組み立てて
 * 1層だけを検証する）を素通りせず、実際に繋がって最後まで動くことを確認する。
 *
 * ここでのゴールは「各層の値が正しいか」ではなく「unified としてパイプラインを組んだ状態で
 * PDF が出力できるか」。そのため rehypeDdast.test.ts・styler.test.ts 末尾の unist 準拠テストと
 * 同じ FIXTURE を使い、ddast の主要なノード種別（TableCell・Image・Inline を含む）を一通り
 * 含める: 見出し（h1: 下線 rule / h2: 左バー / h3: 装飾無し）・段落中の内部/外部リンク・改行・
 * 引用（tight/loose 混在）・tight/loose リスト・GFM テーブル（width マーカー付き）・
 * コードブロック・水平線・画像（data: URI。ネットワーク依存を避けるため http(s) URL は
 * 使わない）・pdf-page-break コメント。
 */
const FIXTURE = [
  "# h1 見出し（下線）",
  "",
  "本文に **強調**・*斜体*・~~打ち消し~~・`code`・[外部](https://example.com)・",
  "[内部](#h1-見出し（下線）)・改行<br>あり。",
  "",
  "## h2 見出し（左バー）",
  "",
  "> 引用文",
  ">",
  "> 引用の2段落目",
  "",
  "### h3 見出し（装飾無し）",
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
  // 1x1 の透明 PNG（data: URI）。ネットワークアクセス・ローカルファイル依存を避けるための
  // 最小の画像フィクスチャ。
  "![代替テキスト](data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=)",
  "",
  "<!-- pdf-page-break -->",
  "",
  "最終段落。",
  "",
].join("\n");

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_CACHE_DIR = join(__dirname, "../sample/.fonts");

describe("unified パイプライン全体の結合テスト（Markdown → PDF）", () => {
  it("createProcessor() が unified の Processor として、mdast→hast→ddast→ddast→docDefinition の全段を .processSync() 一発で通す", () => {
    const file = createProcessor({ theme: DEFAULT_THEME }).processSync(FIXTURE);
    const dd = file.result as TDocumentDefinitions;
    assert.ok(Array.isArray(dd.content));
    // 見出し3つ・引用・リスト2つ・テーブル・コードブロック・hr・画像・pageBreakMarker・
    // 最終段落の少なくとも10要素が root 直下に並ぶ（1:多に分割される画像混在段落は無いため
    // 個数は安定する）。
    assert.ok(dd.content.length >= 10, `content 要素数が想定より少ない: ${dd.content.length}`);
  });

  it("見出し・引用・リスト・テーブル・画像・リンク・コードを含む Markdown から、unified パイプライン経由で妥当な PDF バイト列を生成する（TableCell・Image・Inline を含む全ノード種別が実際に compile されることの確認）", async () => {
    let dd = markdownToDocDefinition(FIXTURE, {
      defaultStyle: { font: TEST_BODY_FONT, fontSize: 10 },
      theme: mergeTheme(DEFAULT_THEME, { code: { font: TEST_CODE_FONT } }),
    });
    dd.pageSize = DEFAULT_THEME.page.size;
    dd.pageMargins = DEFAULT_THEME.page.margins;

    const fonts = await loadFonts(FONT_CACHE_DIR, TEST_FONT_SOURCES);
    dd = withFontFallback(dd, { style: "code", fallbackFont: TEST_BODY_FONT, supports: fontSupports(fonts[TEST_CODE_FONT].normal as string) });

    const buffer = await renderToBuffer(dd, fonts, {});

    // PDF として妥当なバイト列であること（先頭のマジックナンバー・ある程度の実サイズ・
    // ページ数が改ページマーカー分（2ページ以上）に増えていること）。
    assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(buffer.length > 1000, `PDF が小さすぎます: ${buffer.length} bytes`);
    const pageCountMatches = buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? [];
    assert.ok(pageCountMatches.length >= 2, `pdf-page-break が反映されておらず1ページのまま: ${pageCountMatches.length}`);
  });
});
