import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  // 依存（unified/remark-*/rehype-*/hast-util-to-text）がすべて ESM 専用（CJS エントリを
  // 持たない）で、require() 経由の相互運用に頼れないため ESM のみを出力する。
  format: ["esm"],
  dts: true,
  // 各層が将来別パッケージへ切り出せるよう、1バンドルにまとめず ARCHITECTURE.md の
  // ディレクトリ構成をそのまま出力に保つ（ARCHITECTURE.md の「公開時のパッケージ構成」参照）。
  unbundle: true,
  clean: true,
  platform: "node",
});
