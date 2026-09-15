#!/usr/bin/env node
// pack した tarball を moduleResolution: nodenext のクリーンなプロジェクトへ実際に install し、
// 公開 API の型が単体で解決できることを確認する（README.md の「公開前の検証」参照）。
//
// dist/**/*.d.mts の文字列検査（publish.test.ts）では、Buffer のようなグローバル型
// （@types/node 経由）の解決漏れは検出できない。ここでは実際に別プロジェクトとして
// install・tsc --noEmit まで通すことで、その種の解決漏れも含めて検証する。
// ネットワークアクセスが発生するため pnpm test には含めず、公開前に個別に実行する。

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const tarballName = `${pkg.name}-${pkg.version}.tgz`;

const workDir = mkdtempSync(join(tmpdir(), "remark-pdfmake-verify-nodenext-"));
try {
  console.log("[verify-nodenext] ビルド中...");
  execFileSync(join(repoRoot, "node_modules/.bin/tsdown"), { cwd: repoRoot, stdio: "inherit" });

  console.log("[verify-nodenext] pack 中...");
  execFileSync("pnpm", ["pack", "--pack-destination", workDir], { cwd: repoRoot, stdio: "inherit" });
  const tarball = join(workDir, tarballName);

  const projectDir = join(workDir, "project");
  mkdirSync(projectDir);
  writeFileSync(join(projectDir, "package.json"), JSON.stringify({ name: "verify-nodenext", private: true, type: "module" }, null, 2));
  writeFileSync(
    join(projectDir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext", strict: true, skipLibCheck: false, noEmit: true } }, null, 2),
  );
  writeFileSync(
    join(projectDir, "index.ts"),
    [
      'import { markdownToDocDefinition, renderToBuffer, withFontFallback, type Content } from "remark-pdfmake";',
      "",
      "async function main() {",
      '  const dd = markdownToDocDefinition("# hello\\n\\nSome **text**.");',
      '  const fallback = withFontFallback(dd, { style: "code", fallbackFont: "NotoSansJP", supports: () => true });',
      '  const buf: Buffer = await renderToBuffer(fallback, { Roboto: { normal: "x", bold: "x", italics: "x", bolditalics: "x" } }, {});',
      '  const c: Content = "hi";',
      "  console.log(buf, c);",
      "}",
      "main();",
      "",
    ].join("\n"),
  );

  console.log("[verify-nodenext] install 中...");
  execFileSync("npm", ["install", tarball, "--no-audit", "--no-fund"], { cwd: projectDir, stdio: "inherit" });

  console.log("[verify-nodenext] tsc --noEmit（moduleResolution: nodenext）...");
  execFileSync(join(repoRoot, "node_modules/.bin/tsc"), ["--noEmit", "-p", join(projectDir, "tsconfig.json")], {
    cwd: projectDir,
    stdio: "inherit",
  });

  console.log("[verify-nodenext] OK");
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
