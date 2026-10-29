import { defineConfig } from 'vite';

// base: './' 讓網站放在任何子路徑都能開（例如 toollab.link/potsticker-shop/）
export default defineConfig({
  base: './',
  build: {
    outDir: 'docs', // GitHub Pages 只能選根目錄或 /docs 當網站入口，所以輸出到 docs/
    chunkSizeWarningLimit: 1500, // Phaser 本身就約 1.2 MB
  },
});
