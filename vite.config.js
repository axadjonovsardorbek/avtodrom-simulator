import { defineConfig } from "vite";

// Relative base so the build works from any folder (and as a published artifact).
// Fixed file names let artifact/index.html reference the bundle directly; the GitHub
// Pages build (HASHED=1) puts a content hash in the names so browsers never run a
// stale copy after an update.
const hashed = !!process.env.HASHED;
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 700,          // three.js alone is ~640 kB
    rollupOptions: {
      output: {
        entryFileNames: hashed ? "assets/app-[hash].js" : "assets/app.js",
        chunkFileNames: hashed ? "assets/[name]-[hash].js" : "assets/[name].js",
        assetFileNames: hashed ? "assets/[name]-[hash][extname]" : "assets/[name][extname]",
        // three.js in its own file: it changes far less often than the app, so browsers keep it cached
        manualChunks: hashed ? id => (/node_modules\/three\//.test(id) ? "three" : undefined) : undefined
      }
    }
  }
});
