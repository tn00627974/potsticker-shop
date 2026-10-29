import { defineConfig } from 'vite';

// base: './' 讓 build 出來的 dist/ 放在任何子路徑都能開
export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1500 }, // Phaser 本身就約 1.2 MB
});
