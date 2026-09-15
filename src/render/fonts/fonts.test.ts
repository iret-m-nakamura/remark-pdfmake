import { describe, it, mock, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureFont, loadFonts, fontSupports } from "./fonts.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("ensureFont()", () => {
  let dir: string;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "pdfmake-fonts-"));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
    mock.restoreAll();
  });

  it("cacheDir に既にファイルがあれば fetch せずそのパスを返す", async () => {
    const dest = join(dir, "already-there.otf");
    writeFileSync(dest, "cached");

    mock.method(globalThis, "fetch", () => {
      throw new Error("キャッシュがあるのに fetch してはいけない");
    });

    const path = await ensureFont(dir, { filename: "already-there.otf", url: "https://example.invalid/x" });
    assert.equal(path, dest);
  });

  it("cacheDir に無ければ fetch して保存し、パスを返す", async () => {
    const body = new TextEncoder().encode("font-bytes").buffer;
    mock.method(globalThis, "fetch", async (url: string) => {
      assert.equal(url, "https://example.invalid/new.ttf");
      return { ok: true, status: 200, arrayBuffer: async () => body } as Response;
    });

    const path = await ensureFont(dir, { filename: "new.ttf", url: "https://example.invalid/new.ttf" });
    assert.equal(path, join(dir, "new.ttf"));
    assert.equal(readFileSync(path, "utf8"), "font-bytes");
  });

  it("fetch が失敗（ok: false）したら status を含むエラーを投げる", async () => {
    mock.method(globalThis, "fetch", async () => ({ ok: false, status: 404 }) as Response);

    await assert.rejects(
      () => ensureFont(dir, { filename: "missing.ttf", url: "https://example.invalid/missing.ttf" }),
      /404/,
    );
    assert.equal(existsSync(join(dir, "missing.ttf")), false);
  });

  it("cacheDir が無ければ作成してから保存する", async () => {
    const nested = join(dir, "nested", "deeper");
    assert.equal(existsSync(nested), false);
    const body = new TextEncoder().encode("x").buffer;
    mock.method(globalThis, "fetch", async () => ({ ok: true, status: 200, arrayBuffer: async () => body }) as Response);

    await ensureFont(nested, { filename: "f.ttf", url: "https://example.invalid/f.ttf" });
    assert.equal(existsSync(join(nested, "f.ttf")), true);
  });
});

describe("loadFonts()", () => {
  let dir: string;

  before(() => {
    dir = mkdtempSync(join(tmpdir(), "pdfmake-fonts-"));
  });
  after(() => {
    rmSync(dir, { recursive: true, force: true });
    mock.restoreAll();
  });

  it("sources に渡した名前をそのままキーにした TFontDictionary を組み立てる（どのフォントを使うかは呼び出し側の指示のみに従う）", async () => {
    mock.method(globalThis, "fetch", async (url: string) => {
      const body = new TextEncoder().encode(url).buffer;
      return { ok: true, status: 200, arrayBuffer: async () => body } as Response;
    });

    const fonts = await loadFonts(dir, {
      MyBody: { normal: { filename: "body-normal.ttf", url: "https://example.invalid/body-normal.ttf" } },
      MyMono: { normal: { filename: "mono-normal.ttf", url: "https://example.invalid/mono-normal.ttf" } },
    });

    assert.deepEqual(Object.keys(fonts).sort(), ["MyBody", "MyMono"]);
    assert.equal(fonts.MyBody.normal, join(dir, "body-normal.ttf"));
    assert.equal(fonts.MyMono.normal, join(dir, "mono-normal.ttf"));
  });

  it("指定しなかった書体（bold/italics/bolditalics）は登録しない（省略された書体の代用を自分で選ばない）", async () => {
    mock.method(globalThis, "fetch", async () => {
      const body = new TextEncoder().encode("x").buffer;
      return { ok: true, status: 200, arrayBuffer: async () => body } as Response;
    });

    const fonts = await loadFonts(dir, { OnlyNormal: { normal: { filename: "only-normal.ttf", url: "https://example.invalid/only-normal.ttf" } } });

    assert.ok(fonts.OnlyNormal.normal);
    // 値が undefined なだけでなく、キー自体が無いことを確認する（{bold: undefined} は
    // pdfmake 側の動作には影響しないが、コメントで宣言した「キーごと省略する」という
    // 不変条件を裏切らないことを確認する）。
    assert.deepEqual(Object.keys(fonts.OnlyNormal), ["normal"]);
  });

  it("同じ宛先ファイルを複数の書体に指定しても、fetch は1回しか行わない（並行する ensureFont() が同じ宛先への取得を共有する）", async () => {
    let fetchCount = 0;
    mock.method(globalThis, "fetch", async () => {
      fetchCount++;
      const body = new TextEncoder().encode("x").buffer;
      return { ok: true, status: 200, arrayBuffer: async () => body } as Response;
    });

    const shared = { filename: "shared.ttf", url: "https://example.invalid/shared.ttf" };
    await loadFonts(dir, { Shared: { normal: shared, bold: shared, italics: shared, bolditalics: shared } });

    assert.equal(fetchCount, 1);
  });
});

describe("fontSupports()", () => {
  it("フォントに存在するグリフの文字は true、存在しない文字は false を返す（pdfmake が依存として同梱する実フォントで検証。ネットワーク不要）", () => {
    const robotoRegular = join(__dirname, "../node_modules/pdfmake/fonts/Roboto/Roboto-Regular.ttf");
    const supports = fontSupports(robotoRegular);
    assert.equal(supports("A".codePointAt(0)!), true);
    // U+E000 は private-use-area で、どの一般的な欧文フォントにも通常グリフが無い。
    assert.equal(supports(0xe000), false);
  });
});

