import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',        // required for Electron — makes asset paths relative
  server: {
    port: 5174,      // separate port from terminal (5173) for dev mode
  },
  build: {
    outDir: 'dist',
  },
});