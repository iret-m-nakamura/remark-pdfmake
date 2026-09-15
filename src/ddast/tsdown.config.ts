import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["ddast.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  platform: "node",
});
