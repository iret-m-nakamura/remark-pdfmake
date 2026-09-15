import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * sample/generate.ts が選ぶ Noto Sans CJK JP・Roboto Mono の埋め込み許諾の法的根拠
 * （sample/licenses/README.md 参照）は、ここに置く OFL 原文の実際の条項に基づく。
 * fonts.ts（pdfmake-render パッケージ）はどのフォントも選ばない設計のため、この検証は
 * fonts.ts の単体テストではなく sample/ 側の関心事としてここに置く。
 */
const __dirname = dirname(fileURLToPath(import.meta.url));

describe("sample/licenses/ のライセンス原文", () => {
  it("licenses/ 配下に OFL の原文が存在し、埋め込み許諾の条項を含む", () => {
    for (const file of ["OFL-NotoSansCJK.txt", "OFL-RobotoMono.txt"]) {
      const text = readFileSync(join(__dirname, file), "utf8");
      assert.match(text, /SIL Open Font License/);
      assert.match(text, /can be bundled, embedded,\s+redistributed/);
    }
  });
});
