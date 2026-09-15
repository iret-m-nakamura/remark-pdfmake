# ddast-util-style

[ddast](https://github.com/iret-m-nakamura/remark-pdfmake/tree/main/src/ddast) に theme を
適用し、見た目を確定させる ddast → ddast のユーティリティ。

```ts
import { styleDdast, DEFAULT_THEME, mergeTheme } from "ddast-util-style";

const styled = styleDdast(ddastRoot, mergeTheme(DEFAULT_THEME, { heading: { decorations: [] } }));
```

unified の Transformer としても使える（`styleTransform`）。

## 責務

- theme を受け取り、ddast ノードに **見た目を確定させた値** を書き込む
  （見出しの左バー/下線、引用のバー有無、テーブルのゼブラ塗り・罫線、named style 名など）
- theme を見て初めて決まる **構造の組み立て**（見出しを sidebar table にするか
  headingWithRule にするか等）もここで終わらせる
- pdfmake 固有のキー名・shape（`ContentTable` 等）は持たず、あくまで ddast の語彙の
  範囲内で値・構造を確定させる（pdfmake の形への転写は `ddast-util-to-pdfmake` の仕事）

詳細な責務の境界は
[ARCHITECTURE.md](https://github.com/iret-m-nakamura/remark-pdfmake/blob/main/ARCHITECTURE.md)
の「styler.ts（ddast → ddast）」参照。
