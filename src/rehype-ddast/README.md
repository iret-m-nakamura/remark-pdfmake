# rehype-ddast

hast（HTML 相当の構文木）を [ddast](https://github.com/iret-m-nakamura/remark-pdfmake/tree/main/src/ddast)
（pdfmake の組版要素を語彙にした構文木）へ変換する rehype プラグイン。

```ts
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { rehypeToDdast } from "rehype-ddast";

const ddastRoot = unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeToDdast)
  .runSync(unified().use(remarkParse).parse(markdown));
```

`hastToDdast(root)` として単発の関数でも使える。

## 責務

- `ul`/`ol`/`table`/内部リンク（anchor）/`<!-- pdf-page-break -->` マーカーなど、
  markdown 由来の hast 要素を ddast の語彙へ変換する
- HTML タグと ddast の role（`"strong"`/`"code"`/`"heading"` 等）の 1:1 対応表としての
  タグ付けもここで行う（判断に theme も計算も要らないもの限定）
- 出力する ddast は、theme を見て初めて決まる見た目・構造がまだ未確定な状態
  （それを確定させるのは `ddast-util-style`）

詳細な責務の境界（theme を必要とする判断は含まない、等）は
[ARCHITECTURE.md](https://github.com/iret-m-nakamura/remark-pdfmake/blob/main/ARCHITECTURE.md)
の「rehypeDdast.ts（hast → ddast）」参照。
