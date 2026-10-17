import { defineConfig } from "vite";

// Relative base so the build works from any folder (and as a published artifact).
// Fixed file names let artifact/index.html reference the bundle directly.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        entryFileNames: "assets/app.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name][extname]"
      }
    }
  }
});
