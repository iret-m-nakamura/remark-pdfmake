# remark-pdfmake パイプラインの層と責務（自己参照用の仕様）

このドキュメントは、各層の役割と禁止事項の確定版である。`compiler.ts`（や `rehypeDdast.ts`）に
本来別の層が持つべき判断ロジック（lineHeight・ゼブラ模様・見出し装飾の構造決定等）を書かせない
ための境界を定める。実装・変更前に必ずこれを読み、判断に迷ったらここに立ち返る。

## パイプライン全体

```
markdown --(remark)--> mdast --(remark-rehype+rehype-raw)--> hast
  --(rehypeDdast.ts)--> ddast --(styler.ts)--> ddast（見た目が確定済み）
  --(compiler.ts)--> docDefinition（TDocumentDefinitions）--(pdfmake)--> PDF
```

## ディレクトリ構成

ソースは `src/` 配下に置き、ビルド成果物（`dist/`）・設定・ドキュメントとリポジトリ
ルートで分離する。各層は将来的に別パッケージへ切り出せるよう、責務ごとに `src/` 内の
サブディレクトリへ分けてある（`src/index.ts` が全体の公開面。呼び出し側は
`src/index.ts` からのみ import する）。

| ディレクトリ / ファイル | 内容 |
|---|---|
| `src/ddast/` | ddast の型定義（`ddast.ts`）と仕様書（`README.md`）。他ディレクトリの実装を参照しない、型だけの置き場所（`tsc --noEmit` のみで検証する） |
| `src/rehype-ddast/` | hast → ddast の構造変換（`rehypeDdast.ts`）と見出しスラッグ算出（`slug.ts`。rehypeDdast.ts の内部実装で、利用箇所もそこだけのためここに置く） |
| `src/styler/` | theme 定義（`theme.ts`）・ページサイズ（`pageSizes.ts`）・ddast への見た目確定（`styler.ts`） |
| `src/compiler/` | ddast → docDefinition への転写（`compiler.ts`） |
| `src/render/` | docDefinition → PDF バイト列（`render.ts`） |
| `src/fonts/` | フォントに関する関心事（呼び出し側が指示したフォントの実ファイルの取得・キャッシュ）を引き受ける層。どのフォントを使うかは決めない（`fonts.ts`）。フォントフォールバック（`fontFallback.ts`。対象フォントで表示できない文字を判定するのもフォントの関心事であり、docDefinition → PDF バイト列の変換そのものである render.ts とは別に扱う） |
| `src/ast.ts` / `src/processor.ts` / `src/index.ts` | mdast→hast の設定・パイプライン全体の配線・公開面 |
| `src/remarkPdfmake.ts` | `remark().use()` で使える attacher。`src/index.ts` の default export（下記「公開時のパッケージ構成」参照）。parser（remark-parse）は呼び出し側が持つ前提で、mdast→hast の設定は `ast.ts` の `withMdastToHast()` を共有する |
| `src/pdfmakeTypes.ts` | 公開 API が使う pdfmake の型（`TDocumentDefinitions`/`TFontDictionary`/`PageSize`）の置き場所。`pdfmake` 本体は package.json に `exports` を持たず、`pdfmake/interfaces` のようなサブパスは nodenext モジュール解決の利用者には届かないため、bare import（`from "pdfmake"`）から辿れる値の型を `Parameters<>`/インデックスアクセスで引用する（型の複製はしない）。公開 API の型はここ経由のものだけを使い、`pdfmake/interfaces` への参照を公開面に残さない |
| `dist/` | `tsdown` のビルド成果物（git 管理外。`pnpm run build` で生成し、npm には `files` 経由でこれだけを配布する） |
| `sample/` | 動作例（リポジトリのみで配布。npm パッケージには含めない） |
| `README.md` / `README_ja.md` / `LICENSE` | 利用者向けの概要・使い方（英語版 README.md・日本語版 README_ja.md。内容は互いの翻訳で、常に両方を更新する）とライセンス（MIT） |

## 公開時のパッケージ構成

ddast は hast/mdast/nlcst と並ぶ、unified エコシステム内の独立したツリー種別である
（HTML でも Markdown でもなく、pdfmake の組版要素を語彙にする）。公開時は
ディレクトリ単位で以下のパッケージ名を用いる（remark/rehype 公式の命名規約
（[remarkjs/remark `doc/plugins.md`](https://github.com/remarkjs/remark/blob/main/doc/plugins.md)、
rehype 側も同様）に従う）。

| ディレクトリ | 公開パッケージ名 | 命名根拠 |
|---|---|---|
| `src/ddast/` | `ddast` | ツリー定義そのもの。`hast`/`mdast`/`nlcst` と同じ「裸のツリー名」パターン |
| `src/rehype-ddast/` | `rehype-ddast` | hast → ddast の Transformer。rehype パイプラインで `.use()` される producer のため `rehype-` prefix |
| `src/styler/` | `ddast-util-style` | ddast → ddast（見た目確定）。特定ツリー専用ユーティリティの `[tree]-util-` パターン |
| `src/compiler/` | `ddast-util-to-pdfmake` | ddast → pdfmake docDefinition。`hast-util-to-html` 等と同じ「ツリー → 他形式」の `-util-to-` パターン |
| `src/render/` + `src/fonts/` | `pdfmake-render` | 木構造を扱わない素の PDF レンダリング・フォント取得ユーティリティ。unified 系 prefix は不要 |
| トップレベル（`src/ast.ts`/`src/processor.ts`/`src/remarkPdfmake.ts`/`src/index.ts`） | `remark-pdfmake` | 「markdown を渡せば PDF になる」一括パッケージ。default export（`remarkPdfmake.ts`）が `remark().use()` 対応の attacher で、`remark-` prefix の要件を満たす |

GitHub リポジトリ名（`remark-pdfmake`）は、上記パッケージ群を束ねる monorepo の
コンテナ名として用いる。

## 各層の責務と禁止事項

### rehypeDdast.ts（hast → ddast）
- **責務**: hast（HTML 相当）を受け取り、ddast の content 配列に変換する。
  ul/ol/table/anchor（内部リンク）/page-break マーカー/その他、**dd として変換すべき
  要素の変換はすべてこの層の仕事**。marked 互換の slug 算出、内部リンク着地点名の
  ハッシュ化（`pdfDestinationName`）もここ（一方向変換が許容される唯一の場所）。
  - **簡単なスタイリングもこの層**: 「この HTML タグ・要素には、この role/style を
    直接対応させる」という **1:1 の対応表としてのタグ付け**（`<strong>` → role
    "strong"、`<code>` → role "code"、見出し → role "heading"、blockquote → role
    "blockquoteBody" 等）はここで良い。判断に theme も計算も要らない（どんな入力でも
    同じ対応表を引くだけ）ため「簡単」。
- **除外**（次項の styler へ）: **theme を見て初めて決まる構造の組み立て**。
  「見出しに左バーを付けるか下線にするか」「引用に左バーを付けるかどうか」といった
  判断は、depth や role といった構造的事実だけでは決まらず theme（見た目の設定）を
  必要とするため、ここには書かない。depth の集合を rehypeDdast.ts 側に定数で持たせると
  theme.heading.decorations と二重管理になる。行位置からのゼブラ判定、depth からの
  色・フォントサイズの算出、出現回数からの pageBreak 判定なども同じ理由でここには書かない。
- 出力する ddast は、まだ「見た目の計算が必要な部分」が未確定な状態
  （role タグはここで確定するが、theme に依存する具体的な値・構造は持たない）。
- **1つの hast ノードが複数の ddast ノードになってよい**（1:1 である必要は無い）:
  pdfmake の text 配列は画像を行内要素として描画できない（theme とは無関係な pdfmake
  自体の制約）ため、画像が他のテキストと混在する段落は、画像を
  独立した Image ノードとして挟み込む形に分割する（`splitParagraphAtImages()`）。
  「入力を握りつぶして消してよい」わけではなく、theme 抜きでも表示可能な形に
  組み替えることは許容される。

### styler.ts（ddast → ddast）
- **責務**: theme を受け取り、ddast ノードに **見た目を確定させた値を書き込む**、
  および **theme を見て初めて決まる構造を組み立てる**。compiler.ts が pdfmake の形へ
  機械的に転写するだけで済むように、判断はすべてここで終わらせる。
  - 見出し（`styleHeading()`）: `theme.heading.decorations[depth]` を見て、左バー付きの
    sidebar table にするか、下線付きの headingWithRule stack にするか、装飾無しの
    見出しのみにするかを **ここで組み立てる**（rehypeDdast.ts はどの depth に何の
    装飾が付くか知らない）。同時に named style 名（`"h2"` 等）・margin・pageBreak も確定する
  - 引用（`styleBlockquote()`）: `theme.blockquote.bar` の有無で sidebar table にするか
    どうかを **ここで組み立てる**。無ければバー無しのまま background/padding/margin を適用する
  - 段落: `role: "paragraph"` → lineHeight を持つ named style 名を書き込む
  - テーブル: 各行の zebra 判定（行位置 → 塗るか否か）、ヘッダー行の fill、罫線の
    太さ・色、`theme.table.dontBreakRows` を行ごと・テーブルごとに確定させて書き込む
    （compiler.ts 側は行位置の計算をしない）
  - named style 辞書（`styles.h1 = {...}` 等）の中身を組み立てるのも styler.ts の
    仕事（theme.ts の `headingStyles()`/`otherStyles()`。compiler.ts から呼ぶ）
- **持たない**: pdfmake 固有のキー名・形状の知識（`table.headerRows` や `ContentTable`
  の shape 等）。あくまで ddast の語彙のまま、値・構造だけを確定させる。
- ddast に判別用の追加フィールド（例: `dontBreakRows`）を生やすことは許容される
  （style 参照は途中で入れ替わりうるため、最終的な値を持つフィールドが必要）。
- **構造の組み立て自体は許容される**: 「見出し1つの入力から table/stack/text のいずれかを
  作る」のように、入力と出力で ddast の形が変わること自体は禁止しない。禁止されるのは
  pdfmake 固有の shape（`ContentTable` 等）を作ることであり、ddast の語彙の範囲内で
  構造を組み立てることは styler.ts の本来の責務である。

### compiler.ts（ddast → docDefinition）
- **責務**: ddast に **書き込まれている情報をそのまま** pdfmake の形（キー名・shape）に
  転写するだけ。table の `children`（`TableRow[]`、各行は `TableCell[]`）を pdfmake の `TableCell[][]` に、`headerRowCount` を
  `headerRows` に、といった構造の付け替えは許可（意味的に相同な変換のため）。
- **禁止**: ddast ノード（content）を転写する際に、ddast に無い情報を作り出すこと。
  具体的には `depth`/`role`/行位置などの構造的事実から新しい値（色・サイズ・
  lineHeight・fillColor・線の座標）を計算すること、またはそれに該当する分岐
  （`if (role === "paragraph") lineHeight = ...` 等）。
- **例外（named style 辞書のみ）**: `docDefinition.styles`（`styles.h1 = {...}` 等）の
  組み立てだけは compiler.ts が theme を直接読んで行う（`headingStyles()`/
  `otherStyles()`）。ddast の content 転写とは別の、theme → pdfmake の Style オブジェクトへの
  単純な写像（見出しレベルごとの fontSize/bold/color 等をそのまま Style にする）であり、
  ddast の構造的事実から新しい値を計算するものではないため、上記の禁止事項には抵触しない。
- **例外（ローカル画像パスの解決）**: `Image.src` がローカルファイルパスの場合、
  `opts.baseDir`（呼び出し側が渡す）と結合して絶対パスにするのも compiler.ts の仕事
  （`resolveLocalImageSrc()`）。実際にファイルを読むのは compiler.ts の外（Node.js 環境では
  pdfmake/pdfkit が直接読む。CLAUDE.md の「関心事の分離」参照。この層は「解決」を
  行わない）で、そのときの `process.cwd()` 基準では markdown ファイル自身の場所を
  考慮できないため、compiler.ts の時点でパスを確定させる。theme・ddast の構造的事実とは
  無関係な、呼び出し側から渡された値との単純な文字列結合であり、上記の禁止事項には
  抵触しない。
  - **画像・フォント・添付ファイルの実際のアクセス可否は検証しない**: 絶対パス・`..`・
    リモート URL の宛先など「読ませてよいか」の判断は、実際にファイルを読む・fetch する
    pdfmake 自身が `setLocalAccessPolicy()`/`setUrlAccessPolicy()`（render.ts の
    `RenderPolicy` 経由で呼び出し側が指示する）として公式に提供しているため、
    compiler.ts では行わない。判断を重複させると、`content` とは別に組み立てる
    `docDefinition.images`（`collectRemoteImages()` 参照）が2つの経路で別々に
    「許可されているか」を判定することになり、両者を一致させ続ける保守コストが生じる。
- **例外（外部リンク href の scheme 検証）**: `Link.url` は markdown（信頼できるとは
  限らない入力）から直接転写されてくるため、compiler.ts は転写の前段として scheme を
  検証する（`externalLinkUrlSchema`。zod による宣言的な拒否。`javascript:`/`data:`/
  `file:` 等を拒否し http(s)/mailto/tel のみ許可する）。この検証は pdfmake の
  local/urlAccessPolicy とは無関係である（リンクはクリック時に PDF ビューアが開くだけで
  pdfmake 自身が fetch・読み込みをしないため、これらのポリシーの対象にならない）。
  検証に失敗したリンクは例外を投げず、装飾を持たないプレーンテキストとして残す
  （markdown 1件の不正な参照のために文書全体の生成を失敗させないため）。theme・ddast の
  構造的事実から新しい値を計算するものではなく、1つの値の妥当性を検証するだけなので、
  上記の禁止事項には抵触しない。
- compiler は「ddast に書き込まれた情報（と上記3つの例外）から dd を吐き出す
  以外の副作用を持ってはいけない」。

### render.ts（docDefinition → PDF バイト列）
- **責務**: pdfmake の Node 向け API（`PdfPrinter`/`URLResolver`/`virtual-fs`。README には
  Node 向けの言及が無いため詳細は render.ts 自身のコメントに記す）を呼び出す薄い
  ラッパーに徹する。Node/CJS/ESM の相互運用上の差異を吸収する以上のロジックを持たない。
  仮想ファイルシステムは自前実装せず、pdfmake 自身が同梱するもの（`pdfmake/js/
  virtual-fs.js`）をそのまま使う。
- **禁止**: ネットワーク・ファイルアクセスに関する独自の判断（DNS 解決・IP レンジによる
  到達可能性の判定・fetch のリトライ等）を実装すること。画像・フォントの実体
  （ローカルファイル・リモート URL）を実際に解決する（読む・fetch する）のは pdfmake
  自身の仕事であり、render.ts はそれを呼び出すだけである（CLAUDE.md の「関心事の分離」
  参照）。
  - **例外（アクセスポリシーの配線）**: `renderToBuffer()`/`renderToFile()` は
    `RenderPolicy`（`localAccessPolicy`/`urlAccessPolicy`）を受け取り、pdfmake 自身の
    `setLocalAccessPolicy()`/`setUrlAccessPolicy()`（`PdfPrinter`のコンストラクタ引数・
    `URLResolver.setUrlAccessPolicy()`）にそのまま渡すだけの、パラメータの中継である。
    判断ロジック自体は呼び出し側が渡すコールバックの中にあり、render.ts はそれを
    合成・解釈しない。この引数は必須（省略不可）にしている——ライブラリが黙って
    「無制限」を既定にする、あるいはその旨を勝手に console へ書き出すのではなく、
    呼び出し側に必ずこの選択をさせるための設計であり、制限が要らない場合は `{}` を
    明示的に渡す。
- **例外（fonts.ts）**: フォントファイルの取得・キャッシュ（`loadFonts()`/`ensureFont()`）は、
  compiler.ts/render.ts が組み立てる変換パイプラインの外側で、呼び出し側が明示的に呼ぶ
  独立したユーティリティとして「解決」を行う（`markdownToDocDefinition()` 自体は
  fonts.ts を呼ばない。呼び出し側が `loadFonts()` の結果を `renderToBuffer()` に自分で
  渡す）。パイプラインの内部に暗黙の「解決」を混ぜないための区別。
  どのフォントを・どの名前で・どこから取得するかは fonts.ts 自身が決めず、呼び出し側が
  `FontSourceMap` で指示した内容をそのまま解決するだけにする。theme の `font` 値
  （例: `theme.code.font`）も同様に呼び出し側が決める値で、styler.ts はそれを受け取って
  named style に書き込むだけであり、fonts.ts から特定の名前を import しない
  （sample/generate.ts が両者を橋渡しする具体例）。

## ddast は unist に準拠する

ddast は mdast/hast と同じ **unist** の木として扱えることを不変条件にする（`ddast.ts`
自身は型だけの置き場所で他ディレクトリの実装を参照しないため、rehypeDdast.ts/styler.ts の
出力が実際に準拠しているかは producer 側のテスト末尾で `unist-util-assert` を使い検証する。
`rehype-ddast/rehypeDdast.test.ts`・`styler/styler.test.ts` 参照）。具体的には:

- すべてのノードが空でない `type` を持つ（生の文字列を子に混ぜない。文字列そのものは
  Literal の `{type: "text", value}` で表す）
- `children` は常に **1次元** の `Node[]`（pdfmake の `Table.body` のような2次元配列は
  木の中に持たない。そのため行を `TableRow`、セルを `TableCell` というノードで包み、
  2次元化は compiler.ts の転写でのみ行う）
- 値を持たないプロパティは **キーごと省略** する（`undefined` という値で「値が無いこと」を
  表さない。`unist-util-assert` は JSON 化不可として拒否する）

準拠している限り、`unist-util-visit` をはじめとする unified エコシステムの汎用ツールを
ddast にそのまま適用できる。pdfmake 固有の shape（2次元の `Table.body`、`text` に直接
文字列を並べる run 等）を作ってよいのは compiler.ts の転写だけ。

## ddast と docDefinition の関係

ddast（rehypeDdast.ts の出力）と docDefinition（compiler.ts の出力）は pdfmake の語彙を
互いに転写しているだけの相同な構造だが、**完全な双方向変換ではない**。`withId()` の
半角スペース挿入（pdfmake が空 text で id を登録しないための回避）や `collapse()`
（隣接する同じ style の run の結合）など、意味的に等価だが元の形には戻せない変換を
compiler.ts 側に含む。保証しているのは「compiler.ts は ddast に無い情報を作らない」
ことであり、「ddast の情報を一切失わずに転写する」ことではない。

## named style 辞書の組み立て

`compiler.ts` の `headingStyles()`/`otherStyles()` が `styles.h1 = {...}` 等の named style
辞書を theme から組み立て、`ddastToDocDefinition()` がそれを `opts.styles`（呼び出し側の
個別上書き）とマージして docDefinition に載せる（上記「compiler.ts」の例外参照）。
