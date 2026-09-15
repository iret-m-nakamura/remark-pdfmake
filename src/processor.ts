import type { Root as MdastRoot } from "mdast";
import type { Processor } from "unified";
import type { TDocumentDefinitions } from "./pdfmakeTypes.ts";
import { hastProcessor } from "./ast.ts";
import type * as dd from "ddast";
import { rehypeToDdast } from "rehype-ddast";
import { styleTransform, DEFAULT_THEME } from "ddast-util-style";
import { pdfmakeCompiler } from "ddast-util-to-pdfmake";
import type { ToDocDefinitionOptions } from "ddast-util-to-pdfmake";

/**
 * Markdown → mdast → hast → ddast → ddast（見た目確定済み）→ TDocumentDefinitions の
 * パイプライン全体を1本の unified Processor として組み立てる（ARCHITECTURE.md 参照）。
 *
 *   mdast   (remark-parse, remark-gfm)
 *   → hast  (remark-rehype + rehype-raw: 生 HTML の開始/終了タグを正しくネストさせる。
 *            ast.ts のコメント参照)
 *   → ddast (rehypeToDdast: どの pdfmake 要素を使うかという構造の決定。
 *            ddast.ts・rehypeDdast.ts 参照。theme は参照しない)
 *   → ddast (styleTransform: theme を適用し、見た目（Decoration）を確定させる。styler.ts 参照)
 *   → docDefinition（pdfmakeCompiler: 確定済みの値を pdfmake の形に転写するだけ。
 *            named style 辞書の組み立てだけ theme を使う。compiler.ts 参照）
 *
 * mdast→hast の設定（remark-parse/remark-gfm/remark-rehype/rehype-raw）は ast.ts の
 * hastProcessor() が唯一の置き場所で、ここではそれを `.use()` で延長するだけにする
 * （同じ設定を2箇所に書き分けない。木の型（ddast.ts）・構造の変換（rehypeDdast.ts）・
 * 見た目の確定（styler.ts）・レンダラー（compiler.ts）がそれぞれ疎結合で、unified の
 * `.use()` が繋ぐ、というエコシステムの作法に合わせるため）。
 *
 * 各段は unified の Transformer（木を別の木に変える）・Compiler（木を最終出力に変える）の
 * 素直な用法で、remark-rehype 自身が mdast→hast という木の種類変更を Transformer として
 * 行っているのと同じ仕組みを踏襲している。
 *
 * rehypeToDdast 以降の並びは remarkPdfmake.ts の attacher にも同じものがある
 * （remarkPdfmake.ts のコメント参照）。attacher 経由でこの関数を組み立てると、attacher の
 * `this` が unified の型上 `Processor`（木の型が未確定）にしかならないため、戻り値の
 * HeadTree/TailTree（hast/ddast の木の型）が失われ、`.use()` でさらに延長する用途に
 * 使えなくなる。そのため、個々の段（rehypeToDdast・styleTransform・pdfmakeCompiler）は
 * ddast.ts・styler.ts・compiler.ts に一元化した上で、並びだけをここと attacher の
 * 2箇所に書く。
 *
 * 戻り値の型は明示する（推論に任せない）。`.use()` チェーンの推論結果をそのまま公開
 * 型にすると、TDocumentDefinitions が pdfmakeTypes.ts の型ではなく pdfmake 本体の
 * サブパス（pdfmake/interfaces）由来の構造的な型に展開されてしまい、公開 API の型に
 * サブパス import が漏れ出す（pdfmakeTypes.ts 参照）。
 */
export function createProcessor(opts: ToDocDefinitionOptions = {}): Processor<MdastRoot, MdastRoot, dd.Root, dd.Root, TDocumentDefinitions> {
  const theme = opts.theme ?? DEFAULT_THEME;
  return hastProcessor().use(rehypeToDdast).use(styleTransform, theme).use(pdfmakeCompiler, opts);
}

/** Markdown 文字列を直接 pdfmake の TDocumentDefinitions に変換する（PDF バイト列への
 * 描画自体はこの関数の範囲外。フォント埋め込みは render.ts 参照）。 */
export function markdownToDocDefinition(markdown: string, opts: ToDocDefinitionOptions = {}): TDocumentDefinitions {
  const file = createProcessor(opts).processSync(markdown);
  return file.result as TDocumentDefinitions;
}
