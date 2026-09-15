// パイプライン: Markdown → mdast → hast → ddast → ddast（見た目確定済み）→ TDocumentDefinitions → PDF
// ARCHITECTURE.md 参照。
// default export は remark プラグインとして `remark().use()` で使える attacher
// （remarkPdfmake.ts 参照）。remark-pdfmake が remark 公式の命名規約
// （`remark-` prefix は attacher にのみ許される）を満たすための入口で、
// named export 側の既存 API（createProcessor()/markdownToDocDefinition() 等）とは
// 別の使い方（既存の unified パイプラインへの組み込み）を提供する。
export { default } from "./remarkPdfmake.ts";
export { parseMarkdown, hastProcessor } from "./ast.ts";
export type * as Ddast from "ddast";
export { createSlugger, hastToDdast, rehypeToDdast } from "rehype-ddast";
export { styleDdast, styleNode, styleTransform, DEFAULT_THEME, mergeTheme, contentWidthOf } from "ddast-util-style";
export type { PdfmakeTheme, ThemeOverrides } from "ddast-util-style";
export { ddastToContent, ddastToDocDefinition, pdfmakeCompiler } from "ddast-util-to-pdfmake";
export type { ToDocDefinitionOptions } from "ddast-util-to-pdfmake";
export { createProcessor, markdownToDocDefinition } from "./processor.ts";
export { renderToBuffer, renderToFile } from "pdfmake-render";
export type { RenderPolicy } from "pdfmake-render";
export { withFontFallback } from "pdfmake-render";
export type { FontFallbackOptions } from "pdfmake-render";
export { ensureFont, loadFonts, fontSupports } from "pdfmake-render";
export type { FontSpec, FontFaceSources, FontSourceMap } from "pdfmake-render";
export type { Root as HastRoot } from "hast";
export type { Content } from "pdfmake";
