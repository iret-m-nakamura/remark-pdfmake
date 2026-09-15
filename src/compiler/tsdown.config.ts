import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["compiler.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  platform: "node",
});
