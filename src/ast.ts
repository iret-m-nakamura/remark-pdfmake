import { unified } from "unified";
import type { Processor } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import type { Root as MdastRoot } from "mdast";
import type { Root } from "hast";

/**
 * mdast→hast の設定（remark-gfm・remark-rehype（allowDangerousHtml）・rehype-raw）を
 * Processor に足す。parser（remark-parse）は含まない: remarkPdfmake.ts の attacher は
 * 呼び出し側の `remark()`/`unified().use(remarkParse)` が既に持つ parser にこれを足すだけで、
 * hastProcessor() は自前で remark-parse から組み立てる。この関数を唯一の置き場所にすることで、
 * mdast→hast の設定を hastProcessor()・remarkPdfmake.ts の2箇所に書き分けない。
 *
 * `.use()` の戻り値をそのまま連鎖させることで、木の型（TailTree）の推論を保つ
 * （プレーンな `Preset` オブジェクトに包むと、この情報が失われて processor.ts 側の
 * 型が壊れる）。
 *
 * - remark-gfm: テーブル・取り消し線・タスクリストなど GFM 記法をパースする
 * - remark-rehype（allowDangerousHtml）+ rehype-raw: 本文中に埋め込まれた生 HTML
 *   （`<br>` `<small>...</small>` など）を、mdast のような未解釈の文字列ノードではなく
 *   正しくネストした hast の element ノードとして解釈する
 *
 * mdast ではなく hast を最終形とするのは、mdast だと `<br>` `<small>` のような生 HTML が
 * 開始/終了タグ・中身がバラバラの兄弟ノードとしてしか得られず、対応関係を自前で
 * 追跡する必要があるため（詳細は ddast.ts のコメント参照）。
 *
 * この関数を呼ぶ2箇所（下記 hastProcessor()・remarkPdfmake.ts の attacher）で入力の
 * 木の型が揃わない（hastProcessor() が渡す `unified().use(remarkParse)` は
 * ParseTree=mdast.Root、attacher 内の `this` は unified の型上 `Processor`
 * （全て `undefined` の既定値）にしかならない）。実装シグネチャを1本の総称関数にして
 * ParseTree を汎用的に締めようとすると、関数内部での `.use()` の戻り値の型計算が
 * P の実際の実引数ではなく制約（bound）を基準に行われるため、ParseTree に
 * `| undefined` が混じって呼び出し側の戻り値の型まで緩んでしまう（実際に試して確認
 * 済み）。そのため、呼び出し側ごとに戻り値の型を確定させるオーバーロードを用意し、
 * 内部の実装シグネチャだけを緩くする（実装シグネチャは外部から見えないため、型の
 * 緩さが呼び出し側に漏れない。TypeScript の関数オーバーロードの通常の書き方であり、
 * 型アサーションで迂回しているわけではない）。
 */
export function withMdastToHast(processor: Processor<MdastRoot, undefined, undefined, undefined, undefined>): Processor<MdastRoot, MdastRoot, Root, undefined, undefined>;
export function withMdastToHast(processor: Processor): Processor<undefined, MdastRoot, Root, undefined, undefined>;
export function withMdastToHast(processor: Processor<any, any, any, any, any>) {
  return processor.use(remarkGfm).use(remarkRehype, { allowDangerousHtml: true }).use(rehypeRaw);
}

/**
 * Markdown → hast（mdast 段を含む）を組み立てる unified Processor。
 *
 * processor.ts はこの Processor を `.use(rehypeToDdast).use(pdfmakeCompiler)` で
 * 延長して Markdown → docDefinition の全段を組み立てる。remarkPdfmake.ts の attacher は
 * withMdastToHast() を直接使う（parser 込みのこの関数は使わない。attacher は呼び出し側の
 * parser に相乗りするため）。
 */
export function hastProcessor() {
  return withMdastToHast(unified().use(remarkParse));
}

/** Markdown 文字列を hast（HTML の構文木）に変換する。hast だけが欲しい場合の薄いラッパー */
export function parseMarkdown(markdown: string): Root {
  const processor = hastProcessor();
  const mdast = processor.parse(markdown);
  return processor.runSync(mdast) as Root;
}
