import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withFontFallback } from "./fontFallback.ts";
import type { TDocumentDefinitions } from "pdfmake/interfaces";

// テスト用の「フォント」: ASCII (コードポイント < 128) だけをサポートする、という体で
// supports() を組み立てる。実際の呼び出し側では fontkit の hasGlyphForCodePoint() 等を渡す
// 想定だが、このモジュール自体はフォントファイルを読まないので、任意の述語関数で足りる。
const asciiOnly = (codePoint: number) => codePoint < 128;

// compiler.ts の compileRun() が実際に code 要素を出力する形。
// 対象は `font` プロパティではなく `style` 名（ここでは "code"）で探す
// （named style 経由でしかフォントが登録されないため。fontFallback.ts のコメント参照）。
const codeRun = (text: string) => ({ text, style: "code" });

describe("withFontFallback()", () => {
  it("対象 style の text がすべて supports() を満たす場合は変更しない", () => {
    const dd = { content: [codeRun("SAMPLE_CODE")] } as unknown as TDocumentDefinitions;
    const result = withFontFallback(dd, { style: "code", fallbackFont: "NotoSansJP", supports: asciiOnly });
    assert.deepEqual(result.content, [codeRun("SAMPLE_CODE")]);
  });

  it("対象フォントで表示できない文字だけをフォールバックフォントの run に分割する。分割後の各区間には style を明示的に付ける（wrapper 側の style は残しても、pdfmake の flattenTextArray() が「text が配列の wrapper 自身の style」を捨ててしまう既知の制限があり、背景色・フォントの両方が効かなくなるため）", () => {
    const dd = { content: [codeRun("[SAMPLE_CODE] サンプル名称")] } as unknown as TDocumentDefinitions;
    const result = withFontFallback(dd, { style: "code", fallbackFont: "NotoSansJP", supports: asciiOnly });
    const [content] = result.content as any[];
    assert.equal(content.style, "code");
    assert.ok(Array.isArray(content.text));
    assert.deepEqual(content.text[0], { text: "[SAMPLE_CODE] ", style: "code" });
    assert.deepEqual(content.text[1], { text: "サンプル名称", style: "code", font: "NotoSansJP" });
  });

  it("対象 style 以外の text（本文など）には触れない", () => {
    const dd = { content: [{ text: "本文はそのまま" }] } as unknown as TDocumentDefinitions;
    const result = withFontFallback(dd, { style: "code", fallbackFont: "NotoSansJP", supports: asciiOnly });
    assert.deepEqual(result.content, [{ text: "本文はそのまま" }]);
  });

  it("段落の text 配列やテーブルのセルなど、ネストした構造の中も再帰的に処理する", () => {
    const dd = {
      content: [
        { text: ["前置き ", codeRun("[SAMPLE_CODE] サンプル名称"), " 後書き"] },
        {
          table: {
            body: [[{ text: "見出し" }, { text: [codeRun("sample-code-123 サンプル和文")] }]],
          },
        },
      ],
    } as unknown as TDocumentDefinitions;
    const result = withFontFallback(dd, { style: "code", fallbackFont: "NotoSansJP", supports: asciiOnly });

    const [p, tableBlock] = result.content as any[];
    const code = p.text[1];
    assert.equal(code.style, "code");
    assert.deepEqual(code.text[0], { text: "[SAMPLE_CODE] ", style: "code" });
    assert.deepEqual(code.text[1], { text: "サンプル名称", style: "code", font: "NotoSansJP" });

    const cell = tableBlock.table.body[0][1];
    const cellCode = cell.text[0];
    assert.deepEqual(cellCode.text[0], { text: "sample-code-123 ", style: "code" });
    assert.deepEqual(cellCode.text[1], { text: "サンプル和文", style: "code", font: "NotoSansJP" });
  });

  it("入力の TDocumentDefinitions を変更しない（新しいオブジェクトを返す）", () => {
    const dd = { content: [codeRun("SAMPLE_CODE サンプル和文")] } as unknown as TDocumentDefinitions;
    const before = JSON.stringify(dd);
    withFontFallback(dd, { style: "code", fallbackFont: "NotoSansJP", supports: asciiOnly });
    assert.equal(JSON.stringify(dd), before);
  });
});
