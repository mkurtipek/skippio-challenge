import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The UI calls /api/*; Vite forwards it to the backend, so no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
