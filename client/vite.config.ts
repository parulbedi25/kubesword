import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Ports can be overridden with env vars (used by `npm start`):
//   CLIENT_PORT — UI port (default 5173)
//   API_PORT    — API server port the dev proxy points at (default 3001)
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.CLIENT_PORT || 5173),
    // Comma-separated extra hosts allowed to access the dev server
    // (e.g. cloud preview URLs). Leave unset to keep the secure default.
    allowedHosts: process.env.VITE_ALLOWED_HOSTS
      ? process.env.VITE_ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
      : undefined,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || 3001}`,
        changeOrigin: true,
      },
      '/ws': {
        target: `ws://localhost:${process.env.API_PORT || 3001}`,
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
});
