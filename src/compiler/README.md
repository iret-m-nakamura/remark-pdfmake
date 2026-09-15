# ddast-util-to-pdfmake

見た目が確定した [ddast](https://github.com/iret-m-nakamura/remark-pdfmake/tree/main/src/ddast)
を、[pdfmake](https://github.com/bpampuch/pdfmake) の `TDocumentDefinitions`
（docDefinition）へ転写するユーティリティ。

```ts
import { ddastToDocDefinition } from "ddast-util-to-pdfmake";

const dd = ddastToDocDefinition(styledDdastRoot, { baseDir: import.meta.dirname });
```

unified の Compiler としても使える（`pdfmakeCompiler`）。

## 責務

- ddast に **既に書き込まれている情報をそのまま** pdfmake のキー名・shape に転写するだけ
  （`depth`/`role`/行位置などの構造的事実から新しい値を計算しない）
- 例外として、named style 辞書の組み立て（theme → `docDefinition.styles`）・ローカル
  画像パスの `baseDir` 結合・外部リンク href の scheme 検証（`javascript:` 等の拒否）の
  3つだけは compiler 自身が行う
- 画像・フォント・添付ファイルの実際のアクセス可否（読んでよいか）は検証しない。
  実際にファイルを読む・fetch するのは pdfmake 自身であり、その可否は
  `pdfmake-render` の `RenderPolicy` 経由で呼び出し側が指示する

詳細な責務の境界（3つの例外の根拠を含む）は
[ARCHITECTURE.md](https://github.com/iret-m-nakamura/remark-pdfmake/blob/main/ARCHITECTURE.md)
の「compiler.ts（ddast → docDefinition）」参照。
