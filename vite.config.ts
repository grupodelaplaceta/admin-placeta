import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// RSP Web — SPA de administración.
// El backend (API JSON) se configura con VITE_API_URL; en modo mock
// (VITE_USE_MOCK=true, por defecto en local) la app funciona sin backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    // En modo live, proxeamos /api y /login al backend RSP para evitar CORS.
    proxy: {
      '/api': { target: process.env.VITE_API_URL || 'http://localhost:4000', changeOrigin: true },
      '/login': { target: process.env.VITE_API_URL || 'http://localhost:4000', changeOrigin: true },
      '/rsp': { target: process.env.VITE_API_URL || 'http://localhost:4000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    css: false,
    // Vitest solo corre los tests del SPA; los del servidor usan node:test
    // (cd server && npm test / node --test).
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    env: {
      // Los tests usan el proveedor mock (con el snapshot real del banco).
      VITE_USE_MOCK: 'true',
    },
  },
});
