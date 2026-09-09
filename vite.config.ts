import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  root: 'web',
  build: {
    emptyOutDir: true,
    outDir: '../dist/web',
  },
});
