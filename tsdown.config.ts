import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  // 依存（unified/remark-*/rehype-*/hast-util-to-text）がすべて ESM 専用（CJS エントリを
  // 持たない）で、require() 経由の相互運用に頼れないため ESM のみを出力する。
  format: ["esm"],
  dts: true,
  // ddast/rehype-ddast/ddast-util-style/ddast-util-to-pdfmake/pdfmake-render は別パッケージの
  // 依存として import しており（package.json 参照）、この build には含まれない（外部依存として
  // 扱われる）。ここでバンドルするのはこのパッケージ自身のファイル（ast.ts・processor.ts・
  // remarkPdfmake.ts・pdfmakeTypes.ts・index.ts）だけで、1バンドルにまとめず個別ファイルの
  // まま出力する。
  unbundle: true,
  clean: true,
  platform: "node",
});
