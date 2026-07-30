import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  resolve: {
    // matches the "@/*" path mapping in tsconfig.json
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      // keeps the browser on one origin in dev, so cookies just work
      '/api': { target: 'http://localhost:5000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    /**
     * Source maps are a development tool. Shipped as they were, they published
     * the app's whole readable source next to the bundle - every route, guard
     * and API call, comments and all - to anyone who opened devtools.
     *
     * Off for a production build rather than merely unlinked: a map file sitting
     * in dist/ is still fetchable at `<bundle>.js.map` whether or not the bundle
     * points at it, and dist/ is deployed wholesale. Not writing one is the only
     * version of this that survives a careless upload.
     *
     * To debug a production crash, build once with BUILD_SOURCEMAP=1 and keep
     * that dist/ locally - do not deploy it.
     */
    sourcemap: command === 'build' ? (process.env.BUILD_SOURCEMAP === '1' && 'hidden') : true,
  },
}));
