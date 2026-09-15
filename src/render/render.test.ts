import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, PDFDict, PDFName } from "pdf-lib";
import { markdownToDocDefinition } from "remark-pdfmake";
import { renderToBuffer } from "./render.ts";
import { loadFonts, fontSupports } from "./fonts/fonts.ts";
import { TEST_BODY_FONT, TEST_CODE_FONT, TEST_FONT_SOURCES } from "./fonts/testFontSources.ts";
import { withFontFallback } from "./fonts/fontFallback.ts";
import { DEFAULT_THEME, mergeTheme } from "ddast-util-style";

/**
 * render.ts はヘッダー/フッター・余白・フォント配線を担う経路の最終出力を扱うため、実際の
 * フォントファイルを使って renderToBuffer() まで通し、PDF として妥当なバイト列が生成できること、
 * 埋め込みフォントが期待の3書体のみ（pdfmake/pdfkit 標準フォントの混入が無い）であることを検証する。
 *
 * testFontSources.ts が選ぶ実フォント（Noto Sans CJK JP・Roboto Mono。sample/generate.ts と
 * 同じ選定）を使うため、キャッシュが無い環境での初回実行はネットワークアクセスが発生する。
 * sample/generate.ts と同じキャッシュディレクトリを再利用し、繰り返し実行での
 * 再ダウンロードを避ける。
 */
const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_CACHE_DIR = join(__dirname, "../../sample/.fonts");

/** 生成した PDF の各ページから埋め込みフォントの BaseFont 名を集める（pdffonts 相当）。 */
async function embeddedBaseFonts(pdfBytes: Uint8Array): Promise<Set<string>> {
  const doc = await PDFDocument.load(pdfBytes);
  const baseFonts = new Set<string>();
  for (const page of doc.getPages()) {
    const fontDict = page.node.Resources()?.lookup(PDFName.of("Font"), PDFDict);
    if (!fontDict) continue;
    for (const [, ref] of fontDict.entries()) {
      const fontObj = doc.context.lookup(ref, PDFDict);
      const baseFont = fontObj?.get(PDFName.of("BaseFont"));
      if (baseFont) baseFonts.add(baseFont.toString());
    }
  }
  return baseFonts;
}

describe("renderToBuffer()（fonts.ts の実フォントを使った統合テスト）", () => {
  it("見出し・本文・code を含む Markdown から妥当な PDF バイト列を生成し、埋め込みフォントが NotoSansCJKjp（Light/Medium）・RobotoMono の3書体のみになる（pdfmake/pdfkit 標準フォントの混入が無い）", async () => {
    const markdown = "# 見出し\n\n本文です。`code() と和文混在`。\n";
    let dd = markdownToDocDefinition(markdown, {
      defaultStyle: { font: TEST_BODY_FONT, fontSize: 10 },
      theme: mergeTheme(DEFAULT_THEME, { code: { font: TEST_CODE_FONT } }),
    });
    dd.pageSize = DEFAULT_THEME.page.size;
    dd.pageMargins = DEFAULT_THEME.page.margins;

    const fonts = await loadFonts(FONT_CACHE_DIR, TEST_FONT_SOURCES);
    dd = withFontFallback(dd, { style: "code", fallbackFont: TEST_BODY_FONT, supports: fontSupports(fonts[TEST_CODE_FONT].normal as string) });

    const buffer = await renderToBuffer(dd, fonts, {});

    // PDF として妥当なバイト列であること（先頭のマジックナンバー・ある程度の実サイズ）
    assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
    assert.ok(buffer.length > 1000, `PDF が小さすぎます: ${buffer.length} bytes`);

    const baseFonts = [...(await embeddedBaseFonts(buffer))].map((name) => name.replace(/^\/[A-Z]{6}\+/, ""));
    assert.deepEqual(new Set(baseFonts), new Set(["NotoSansCJKjp-Light", "NotoSansCJKjp-Medium", "RobotoMono-Regular"]));
  });
});

describe("renderToBuffer()（localAccessPolicy/urlAccessPolicy。pdfmake 自身の setLocalAccessPolicy()/setUrlAccessPolicy() へのそのままの配線）", () => {
  const localImagePath = join(__dirname, "../../sample/sample.jpeg");

  it("localAccessPolicy が false を返すパスへのローカル画像参照は、pdfmake 自身のエラーで拒否される", async () => {
    const dd = markdownToDocDefinition(`![alt](${localImagePath})`, { theme: DEFAULT_THEME });
    await assert.rejects(
      () => renderToBuffer(dd, {}, { localAccessPolicy: () => false }),
      /Access to local file denied by resource access policy/,
    );
  });

  it("localAccessPolicy が true を返せば、そのローカル画像を描画できる", async () => {
    const dd = markdownToDocDefinition(`![alt](${localImagePath})`, { theme: DEFAULT_THEME });
    const buffer = await renderToBuffer(dd, {}, { localAccessPolicy: () => true });
    assert.equal(buffer.subarray(0, 5).toString("latin1"), "%PDF-");
  });

  it("urlAccessPolicy が false を返す URL への画像参照は、実際に fetch する前に pdfmake 自身のエラーで拒否される", async () => {
    const dd = markdownToDocDefinition("![alt](https://example.invalid/pic.png)", { theme: DEFAULT_THEME });
    dd.images = { "https://example.invalid/pic.png": "https://example.invalid/pic.png" };
    await assert.rejects(
      () => renderToBuffer(dd, {}, { urlAccessPolicy: () => false }),
      /Access to URL denied by resource access policy/,
    );
  });
});
