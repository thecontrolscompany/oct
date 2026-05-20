import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws':  { target: 'ws://localhost:3001', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main:  resolve(__dirname, 'index.html'),
        oscvt: resolve(__dirname, 'oscvt/index.html'),
      },
    },
  },
});
