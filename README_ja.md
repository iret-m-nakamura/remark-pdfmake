# remark-pdfmake

[English](./README.md)

Markdown を [pdfmake](https://github.com/bpampuch/pdfmake) の `TDocumentDefinitions`
（docDefinition）へ変換し、そのまま PDF バイト列にする [unified](https://github.com/unifiedjs/unified)
ベースのパイプライン。headless browser（puppeteer 等）を起動せず、Node.js だけで
PDF を生成できる。

## なぜ

headless browser 経由の PDF 生成は、Chrome プロセスの起動コスト・ポート枯渇・同時実行時の
リソース消費が大きい。remark-pdfmake は Markdown → HTML → CSS 描画という経路を取らず、
markdown の構造を直接 pdfmake の組版要素（`text`/`stack`/`table`/`ul`/`ol`/`canvas`/`image`）
へ変換するため、これらの問題を避けられる。

## パイプライン

```
markdown --(remark-parse, remark-gfm)--> mdast
        --(remark-rehype + rehype-raw)--> hast
        --(rehypeToDdast)--> ddast
        --(styleTransform + theme)--> ddast（見た目確定済み）
        --(pdfmakeCompiler)--> docDefinition
        --(pdfmake)--> PDF
```

各段の詳細（層ごとの責務・禁止事項）は [ARCHITECTURE.md](./ARCHITECTURE.md) 参照。
**ddast**（Document Definition AST。pdfmake の要素を語彙にした unist 準拠の構文木）自体の
仕様は [src/ddast/README.md](./src/ddast/README.md) 参照。

サポートする Markdown 記法: GFM（テーブル・取り消し線・タスクリスト等）、本文中に埋め込んだ
生 HTML（`<br>`・`<small>` 等）、`<!-- width="..." -->`（テーブル列幅の希望値）・
`<!-- pdf-page-break -->`（改ページ）という2つの pdfmake 専用マーカー（HTML コメントのため
他の Markdown ビューアで開いても見た目には何も表示されない）。

## インストール

```
npm install remark-pdfmake
```

ESM 専用パッケージ（`require()` 不可。依存の unified/remark/rehype 系がすべて ESM 専用の
ため）。Node.js 22 以降が必要。

## 使い方

```ts
import { markdownToDocDefinition, renderToFile, loadFonts, DEFAULT_THEME } from "remark-pdfmake";

// どのフォントを・どの名前で・どこから取得するかは呼び出し側が決める（remark-pdfmake
// 自体は関与しない）。CJK 対応・等幅の code フォントまで含めた完全な例は
// sample/generate.ts 参照。
const fonts = await loadFonts(fontCacheDir, {
  MyFont: { normal: { filename: "MyFont-Regular.ttf", url: "https://example.com/MyFont-Regular.ttf" } },
});

const dd = markdownToDocDefinition(markdown, {
  defaultStyle: { font: "MyFont", fontSize: 10 },
  theme: DEFAULT_THEME,
});
dd.pageSize = DEFAULT_THEME.page.size;
dd.pageMargins = DEFAULT_THEME.page.margins;

// renderToFile()/renderToBuffer() はこの引数を必須にしている（省略不可）。実際に
// ローカルファイルを読む・リモート URL を fetch するのは pdfmake であり、それぞれの
// 可否を決めるのは呼び出し側の役目である。無制限で構わなければ {} を渡す。拒否した
// パス・URL は黙ってスキップされず pdfmake が例外を投げる（fail-closed）ため、
// 信頼できない markdown を扱う場合はこの呼び出しを try/catch で囲むこと。
await renderToFile(dd, fonts, "output.pdf", {
  localAccessPolicy: (path) => path.startsWith(fontCacheDir),
  urlAccessPolicy: () => false,
});
```

unified の Processor としてもそのまま使える（`.use()` で延長できる）:

```ts
import { createProcessor } from "remark-pdfmake";

const file = createProcessor({ theme: DEFAULT_THEME }).processSync(markdown);
const dd = file.result; // TDocumentDefinitions
```

remark プラグイン（default export）として、既存の remark パイプラインに組み込むこともできる:

```ts
import { remark } from "remark";
import remarkPdfmake from "remark-pdfmake";

const file = remark().use(remarkPdfmake, { theme: DEFAULT_THEME }).processSync(markdown);
const dd = file.result; // TDocumentDefinitions
```

より小さい動作例は [sample/](./sample/)（`sample/generate.ts` を `npx tsx` で実行すると
`sample/report.md` から `sample/report.pdf` を生成する）を参照。

## フォント

remark-pdfmake はどのフォントを使うかについて意見を持たない。どのフォントを・どの名前で・
どこから取得するかは呼び出し側が決め、`FontSourceMap` として `loadFonts()`
（[src/fonts/fonts.ts](./src/fonts/fonts.ts) 参照）に渡す。`loadFonts()` はそれを実行時に
取得・キャッシュし（フォントファイル自体はリポジトリに同梱しない）、
`renderToFile()`/`renderToBuffer()` が要求する `TFontDictionary` に組み立てる。
[sample/generate.ts](./sample/generate.ts) は日本語フォント（Noto Sans CJK JP）・
等幅フォント（Roboto Mono、code 要素用）を選ぶ完全な例で、どちらも SIL Open Font License
のもとで配布されている（この選定についてのライセンス根拠は
[sample/licenses/README.md](./sample/licenses/README.md) 参照）。

## 公開前の検証

`pnpm test`/`pnpm run typecheck` はこのリポジトリ内の `tsconfig.json`
（`moduleResolution: "Bundler"`）でのみ検証する。公開する型定義
（`dist/**/*.d.mts`）が `moduleResolution: "nodenext"` の利用者の環境でも単体で
解決できることは、`pnpm run verify:nodenext` で確認する（pack した tarball を
クリーンなプロジェクトへ実際に install し、`tsc --noEmit` を通す。ネットワーク
アクセスが発生するため通常の test には含めない）。

## License

[MIT](./LICENSE)
