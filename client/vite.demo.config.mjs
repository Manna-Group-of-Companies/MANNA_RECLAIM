/**
 * TEMPORARY - not part of the app, delete after screenshotting.
 * The project's vite config plus a dev-only plugin that seeds a session into
 * localStorage, so the guarded shop-floor tabs render without a real login.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const seedSession = {
  name: 'seed-session',
  transformIndexHtml: () => [
    {
      tag: 'script',
      injectTo: 'head-prepend',
      children: `
        localStorage.setItem('manna.accessToken', 'demo-token');
        localStorage.setItem('manna.user', JSON.stringify({
          id: 'u1', name: 'R. Kumar', role: 'supervisor', active: true
        }));
      `,
    },
  ],
};

export default defineConfig({
  plugins: [react(), seedSession],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5174,
    proxy: { '/api': { target: 'http://localhost:5055', changeOrigin: true } },
  },
});
