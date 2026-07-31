import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig(({ command, mode }) => {
  // '' loads every key, not just VITE_ ones - this is the dev server's own
  // config and never reaches the browser, so it must not be VITE_-prefixed.
  const dotenv = loadEnv(mode, process.cwd(), '');

  /**
   * Where `npm run dev` sends /api. Localhost by default; point DEV_API_PROXY at
   * the Railway URL to develop against the deployed API without running the
   * server locally - the browser still only ever talks to 5173, so this stays a
   * single origin and the refresh cookie keeps working on SameSite=lax.
   *
   * Nothing listening on the target is what makes Vite answer 500: the proxy
   * reports ECONNREFUSED as a server error, which reads in devtools exactly
   * like the API itself having failed.
   */
  const apiTarget = dotenv.DEV_API_PROXY || 'http://localhost:5000';

  return {
  plugins: [react()],
  resolve: {
    // matches the "@/*" path mapping in tsconfig.json
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: {
      // keeps the browser on one origin in dev, so cookies just work
      '/api': { target: apiTarget, changeOrigin: true },
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
  };
});
