import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The development server proxies the API to the backend, so the browser
// only ever talks to one origin. That keeps the CORS rules out of the way
// and it keeps the token out of the URL.
const API_PROXY_TARGET = 'http://127.0.0.1:8000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
