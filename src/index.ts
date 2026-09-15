// パイプライン: Markdown → mdast → hast → ddast → ddast（見た目確定済み）→ TDocumentDefinitions → PDF
// ARCHITECTURE.md 参照。
// default export は remark プラグインとして `remark().use()` で使える attacher
// （remarkPdfmake.ts 参照）。remark-pdfmake が remark 公式の命名規約
// （`remark-` prefix は attacher にのみ許される）を満たすための入口で、
// named export 側の既存 API（createProcessor()/markdownToDocDefinition() 等）とは
// 別の使い方（既存の unified パイプラインへの組み込み）を提供する。
export { default } from "./remarkPdfmake.ts";
export { parseMarkdown, hastProcessor } from "./ast.ts";
export type * as Ddast from "./ddast/ddast.ts";
export { createSlugger } from "./rehype-ddast/slug.ts";
export { hastToDdast, rehypeToDdast } from "./rehype-ddast/rehypeDdast.ts";
export { styleDdast, styleNode, styleTransform } from "./styler/styler.ts";
export { DEFAULT_THEME, mergeTheme, contentWidthOf } from "./styler/theme.ts";
export type { PdfmakeTheme, ThemeOverrides } from "./styler/theme.ts";
export { ddastToContent, ddastToDocDefinition, pdfmakeCompiler } from "./compiler/compiler.ts";
export type { ToDocDefinitionOptions } from "./compiler/compiler.ts";
export { createProcessor, markdownToDocDefinition } from "./processor.ts";
export { renderToBuffer, renderToFile } from "./render/render.ts";
export { withFontFallback } from "./fonts/fontFallback.ts";
export type { FontFallbackOptions } from "./fonts/fontFallback.ts";
export { ensureFont, loadFonts, fontSupports } from "./fonts/fonts.ts";
export type { FontSpec, FontFaceSources, FontSourceMap } from "./fonts/fonts.ts";
export type { Root as HastRoot } from "hast";
export type { Content } from "pdfmake";
