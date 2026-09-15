import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createProcessor, markdownToDocDefinition } from "./processor.ts";

describe("markdownToDocDefinition()", () => {
  it("Markdown 文字列から直接 pdfmake の TDocumentDefinitions を返す（mdast→hast→ddast→docDefinition の全段を通す）", () => {
    const dd = markdownToDocDefinition("# タイトル\n\n本文\n\n## 見出し2\n");
    assert.ok(Array.isArray(dd.content));
    assert.equal(dd.content.length, 3);
    assert.ok(dd.styles && "strong" in dd.styles);
  });

  it("opts（defaultStyle・theme）を反映する", () => {
    const dd = markdownToDocDefinition("# t", { defaultStyle: { font: "NotoSansJP" } });
    assert.deepEqual(dd.defaultStyle, { font: "NotoSansJP" });
  });
});

describe("createProcessor()", () => {
  it("unified の Processor として .processSync().result で TDocumentDefinitions が取れる", () => {
    const file = createProcessor().processSync("# タイトル");
    assert.ok(Array.isArray((file.result as any).content));
  });
});
