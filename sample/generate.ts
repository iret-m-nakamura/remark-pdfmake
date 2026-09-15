import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { markdownToDocDefinition, renderToFile, withFontFallback, mergeTheme, DEFAULT_THEME, loadFonts, fontSupports, type FontSourceMap } from "../src/index.ts";

/**
 * remark-pdfmake だけで Markdown（`report.md`。実在のデータを含まない架空のサンプル）を
 * 実際の PDF バイト列まで変換するサンプル出力スクリプト。
 *
 * 実行: npx tsx sample/generate.ts
 * 出力: sample/report.pdf（git 管理外。生成物のため report.pdf のみ .gitignore 対象。
 * report.md・sample.jpeg 自体は追跡対象。sample.jpeg の出自は同ディレクトリの MEMO.md 参照）
 *
 * どのフォントを・どの名前で・どこから取得するかは呼び出し側（このサンプル）が決める
 * （fonts.ts のコメント、CLAUDE.md の「関心事の分離」参照）。ここでは本文に
 * Noto Sans CJK JP、code インライン要素に Roboto Mono を選んでいる。どちらも
 * SIL Open Font License 1.1（licenses/README.md 参照。埋め込み・再配布が明示的に
 * 許諾されている）。lineHeight・見出しバー幅・ページ余白等の見た目設定は
 * DEFAULT_THEME（theme.ts）に集約されている。
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(__dirname, ".fonts");

// defaultStyle.font・theme.code.font に渡す名前は、ここで決めたものをそのまま使う。
const BODY_FONT = "NotoSansJP";
const CODE_FONT = "Mono";

const NOTO_SANS_CJK_JP_BASE = "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/OTF/Japanese";
const NOTO_SANS_CJK_JP_LIGHT = { filename: "NotoSansCJKjp-Light.otf", url: `${NOTO_SANS_CJK_JP_BASE}/NotoSansCJKjp-Light.otf` };
const NOTO_SANS_CJK_JP_MEDIUM = { filename: "NotoSansCJKjp-Medium.otf", url: `${NOTO_SANS_CJK_JP_BASE}/NotoSansCJKjp-Medium.otf` };

const FONT_SOURCES: FontSourceMap = {
  [BODY_FONT]: {
    // 本文には Light、太字には Medium を使う。Noto Sans CJK JP に Italic/BoldItalic は
    // 存在しない（CJK フォント共通の仕様）ため、呼び出し側の判断として正体をそのまま流用する。
    normal: NOTO_SANS_CJK_JP_LIGHT,
    bold: NOTO_SANS_CJK_JP_MEDIUM,
    italics: NOTO_SANS_CJK_JP_LIGHT,
    bolditalics: NOTO_SANS_CJK_JP_MEDIUM,
  },
  [CODE_FONT]: {
    // google/fonts リポジトリの配布物（ofl/robotomono/RobotoMono[wght].ttf）は可変フォント
    // で、ファイル名（RobotoMono-Regular.ttf）と実体が一致しないため、静的インスタンスを
    // 個別ファイルとして配布している上流の googlefonts/robotomono リポジトリ
    // （fonts/ttf/RobotoMono-Regular.ttf）から取得する（同じ OFL 原文が適用される）。
    // 太字・斜体の静的インスタンスは同リポジトリから別途取得できるが、code 要素は
    // 通常太字・斜体にならないため、呼び出し側の判断として全書体に Regular を流用する。
    // ASCII 専用（日本語グリフを持たない）ため、和文混じりの code span は
    // withFontFallback() で本文フォントにフォールバックする（下記参照）。
    normal: { filename: "RobotoMono-Regular.ttf", url: "https://raw.githubusercontent.com/googlefonts/robotomono/main/fonts/ttf/RobotoMono-Regular.ttf" },
    bold: { filename: "RobotoMono-Regular.ttf", url: "https://raw.githubusercontent.com/googlefonts/robotomono/main/fonts/ttf/RobotoMono-Regular.ttf" },
    italics: { filename: "RobotoMono-Regular.ttf", url: "https://raw.githubusercontent.com/googlefonts/robotomono/main/fonts/ttf/RobotoMono-Regular.ttf" },
    bolditalics: { filename: "RobotoMono-Regular.ttf", url: "https://raw.githubusercontent.com/googlefonts/robotomono/main/fonts/ttf/RobotoMono-Regular.ttf" },
  },
};

async function main(): Promise<void> {
  const markdown = readFileSync(join(__dirname, "report.md"), "utf8");

  // baseDir: report.md 内のローカル画像パス（sample.jpeg）を md 自身と同じ
  // ディレクトリからの相対パスとして解決する（compiler.ts の resolveLocalImageSrc() 参照）。
  let dd = markdownToDocDefinition(markdown, {
    defaultStyle: { font: BODY_FONT, fontSize: 10 },
    theme: mergeTheme(DEFAULT_THEME, { code: { font: CODE_FONT } }),
    baseDir: __dirname,
  });

  dd.pageSize = DEFAULT_THEME.page.size;
  dd.pageMargins = DEFAULT_THEME.page.margins;
  const [marginLeft, , marginRight] = DEFAULT_THEME.page.margins;
  // ヘッダー/フッターの組み方のサンプル。
  const FOOTER_FONT_SIZE = 7;
  dd.header = () => ({
    text: "DRAFT",
    alignment: "right",
    color: "#c00000",
    fontSize: FOOTER_FONT_SIZE,
    margin: [marginLeft, 20, marginRight, 0],
  });
  dd.footer = (currentPage: number, pageCount: number) => ({
    columns: [
      { text: "", width: "*" },
      { text: "サンプル出力 All rights reserved", alignment: "center", width: "auto", fontSize: FOOTER_FONT_SIZE, color: "#666" },
      { text: `${currentPage} / ${pageCount}`, alignment: "right", width: "*", fontSize: FOOTER_FONT_SIZE, color: "#666" },
    ],
    margin: [marginLeft, 0, marginRight, 20],
  });

  const fonts = await loadFonts(FONT_DIR, FONT_SOURCES);

  // Roboto Mono にグリフの無い文字（和文混じりの code span 等）を本文フォントに
  // フォールバックする（詳細は fontFallback.ts 参照）。loadFonts() が既に解決済みの
  // パスをそのまま使う（再度 fetch/キャッシュ確認はしない）。
  dd = withFontFallback(dd, { style: "code", fallbackFont: BODY_FONT, supports: fontSupports(fonts[CODE_FONT].normal as string) });

  // pdfmake 自身が実際にファイルを読む・URL を fetch する直前に検証するポリシー
  // （pdfmake の setLocalAccessPolicy()/setUrlAccessPolicy() にそのまま渡る。render.ts の
  // RenderPolicy 参照）。省略すると pdfmake が無制限アクセスである旨 console.warn を出す。
  // このサンプルは report.md・sample.jpeg・フォントキャッシュがすべて __dirname 配下に
  // あり、リモート画像も使わないため、ローカルは __dirname 配下だけを許可し、リモートは
  // 一律拒否する。
  const output = join(__dirname, "report.pdf");
  await renderToFile(dd, fonts, output, {
    localAccessPolicy: (path) => path.startsWith(__dirname),
    urlAccessPolicy: () => false,
  });
  process.stderr.write(`[sample] ${output}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exitCode = 1;
});
