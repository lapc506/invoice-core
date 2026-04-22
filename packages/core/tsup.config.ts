import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/domain/index.ts", "src/app/index.ts"],
  format: ["esm"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2023",
});
