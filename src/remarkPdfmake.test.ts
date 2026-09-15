import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { remark } from "remark";
import remarkPdfmake from "./remarkPdfmake.ts";
import { markdownToDocDefinition } from "./processor.ts";
import { mergeTheme, DEFAULT_THEME } from "./styler/theme.ts";

const MARKDOWN = "# hello\n\nSome **text** and a [link](https://example.com).\n\n- a\n- b\n";

describe("remarkPdfmake（default export の attacher）", () => {
  it("remark().use(remarkPdfmake) で markdownToDocDefinition() と同じ docDefinition が得られる", () => {
    const viaAttacher = remark().use(remarkPdfmake).processSync(MARKDOWN).result;
    const viaExisting = markdownToDocDefinition(MARKDOWN);
    assert.deepEqual(viaAttacher, viaExisting);
  });

  it("opts（theme 上書き含む）をそのまま pdfmakeCompiler まで渡す", () => {
    const theme = mergeTheme(DEFAULT_THEME, { heading: { levels: { 1: { fontSize: 30, bold: true } } } });
    const viaAttacher = remark().use(remarkPdfmake, { theme }).processSync(MARKDOWN).result;
    const viaExisting = markdownToDocDefinition(MARKDOWN, { theme });
    assert.deepEqual(viaAttacher, viaExisting);
  });
});
