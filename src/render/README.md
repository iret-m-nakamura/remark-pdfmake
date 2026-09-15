# pdfmake-render

[pdfmake](https://github.com/bpampuch/pdfmake) の `TDocumentDefinitions` を実際に PDF バイト列へ
レンダリングする薄いラッパーと、呼び出し側が指示したフォントを取得・キャッシュする
ユーティリティ。木構造（ddast/docDefinition）は扱わない。

```ts
import { loadFonts, renderToBuffer } from "pdfmake-render";

const fonts = await loadFonts(fontCacheDir, {
  MyFont: { normal: { filename: "MyFont-Regular.ttf", url: "https://example.com/MyFont-Regular.ttf" } },
});

const buffer = await renderToBuffer(dd, fonts, {
  localAccessPolicy: (path) => path.startsWith(fontCacheDir),
  urlAccessPolicy: () => false,
});
```

## 責務

- **render**: pdfmake の Node 向け API（`PdfPrinter`/`URLResolver`/`virtual-fs`）を
  呼び出すだけの薄いラッパー。ネットワーク・ファイルアクセスに関する独自の判断は行わない。
  `RenderPolicy`（`localAccessPolicy`/`urlAccessPolicy`）は pdfmake 自身の
  `setLocalAccessPolicy()`/`setUrlAccessPolicy()` へそのまま中継するだけの必須引数
  （呼び出し側に必ず選択させるための設計。制限が要らなければ `{}` を渡す）
- **fonts**: どのフォントを・どの名前で・どこから取得するかは呼び出し側が
  `FontSourceMap` として指示し、`loadFonts()` はそれを取得・キャッシュするだけ
  （フォントの選定はこのパッケージの関心事ではない）

詳細な責務の境界は
[ARCHITECTURE.md](https://github.com/iret-m-nakamura/remark-pdfmake/blob/main/ARCHITECTURE.md)
の「render.ts（docDefinition → PDF バイト列）」参照。
