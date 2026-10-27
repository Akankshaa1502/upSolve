import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the client calls /api/* and Vite forwards it to the Express server.
export default defineConfig({
  plugins: [react()],
  build: { chunkSizeWarningLimit: 800 }, // Recharts is most of the bundle; fine for this app
  server: {
    port: 5173,
    proxy: { '/api': process.env.API_PROXY_TARGET || 'http://localhost:4000' },
  },
});
