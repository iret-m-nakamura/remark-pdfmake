import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * npm に配布する dist/**\/*.d.mts が、外部から解決できない参照を含んでいないことを検証する。
 * ここは producer/styler/compiler のような特定の層ではなく、公開物（npm パッケージ）としての
 * 契約を検証する（詳細は pdfmakeTypes.ts・ARCHITECTURE.md 参照）。
 *
 * - `pdfmake` 本体は package.json に `exports` を持たないため、`pdfmake/interfaces` の
 *   ようなサブパスは Node.js の nodenext モジュール解決では型として解決できない
 *   （`@types/pdfmake` による型のシャドーイングはパッケージの bare 名にしか働かない）。
 *   公開 API の型がこのサブパスを参照すると、nodenext を使う利用者の環境で
 *   `Cannot find module 'pdfmake/interfaces'` になる。
 * - 外部パッケージの型定義を dist/node_modules へコピーすると、ライセンス表記の無い
 *   再配布になる上、node_modules を特別扱いするツールに対して壊れやすい。
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(repoRoot, "dist");

function collectFiles(dir: string, suffix: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectFiles(full, suffix));
    else if (entry.endsWith(suffix)) out.push(full);
  }
  return out;
}

const UNRESOLVABLE_SUBPATH_IMPORT = /(?:from\s+|import\()["']pdfmake\/interfaces["']/;

describe("dist/（npm に配布する公開物）", () => {
  before(() => {
    execFileSync(join(repoRoot, "node_modules/.bin/tsdown"), { cwd: repoRoot, stdio: "ignore" });
  });

  it("公開 API の型が pdfmake のサブパス（pdfmake/interfaces）を参照しない（nodenext 解決の利用者向け）", () => {
    for (const file of collectFiles(distDir, ".d.mts")) {
      assert.doesNotMatch(readFileSync(file, "utf8"), UNRESOLVABLE_SUBPATH_IMPORT, `${file} が pdfmake/interfaces を import している`);
    }
  });

  it("外部パッケージの型定義を dist/node_modules へコピーしない", () => {
    assert.equal(existsSync(join(distDir, "node_modules")), false);
  });
});
