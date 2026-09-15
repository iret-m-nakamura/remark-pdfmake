import type { Plugin } from "unified";
import type { Root as MdastRoot } from "mdast";
import { withMdastToHast } from "./ast.ts";
import { rehypeToDdast } from "./rehype-ddast/rehypeDdast.ts";
import { styleTransform } from "./styler/styler.ts";
import { pdfmakeCompiler } from "./compiler/compiler.ts";
import type { ToDocDefinitionOptions } from "./compiler/compiler.ts";
import { DEFAULT_THEME } from "./styler/theme.ts";
import type { TDocumentDefinitions } from "./pdfmakeTypes.ts";

/**
 * remark プラグインとして `remark().use(remarkPdfmake)` で使える attacher（default export）。
 * remark 公式の命名規約（`remark-` prefix は `remark().use()` で使える attacher にのみ許される。
 * ARCHITECTURE.md の「公開時のパッケージ構成」参照）を満たすための入口で、
 * parser（remark-parse）は呼び出し側の `remark()`/`unified().use(remarkParse)` が持つ前提のため
 * ここでは足さない（ast.ts の withMdastToHast() コメント参照）。
 *
 * mdast を受け取ってからの配線（mdast→hast→ddast→ddast（見た目確定済み）→
 * TDocumentDefinitions）は processor.ts の createProcessor() と同じ並びを使う。
 * createProcessor() からこの attacher を呼ぶ形にはしない: attacher 内の `this` は
 * unified の型上 `Processor`（木の型が未確定）にしかならないため、`.use(remarkPdfmake)`
 * を経由すると createProcessor() の戻り値の HeadTree/TailTree（hast/ddast の木の型）が
 * 失われ、戻り値を `.use()` でさらに延長する用途（README 参照）に使えなくなる。
 * 同じ並びを2箇所（ここと processor.ts）に書く代わりに、rehypeToDdast・styleTransform・
 * pdfmakeCompiler という個々の段は ddast.ts・styler.ts・compiler.ts に一元化されており、
 * ここでの重複は「どの順で `.use()` するか」という配線だけに留める。
 *
 * markdown を渡すだけで済む簡便な入口が欲しい場合は processor.ts の
 * `markdownToDocDefinition()` を使う（この attacher は既存の unified パイプラインへ
 * 組み込みたい場合の入口）。
 */
const remarkPdfmake: Plugin<[ToDocDefinitionOptions?], MdastRoot, TDocumentDefinitions> = function (opts = {}) {
  const theme = opts.theme ?? DEFAULT_THEME;
  withMdastToHast(this).use(rehypeToDdast).use(styleTransform, theme).use(pdfmakeCompiler, opts);
};

export default remarkPdfmake;
