import { defineConfig } from 'astro/config';

// `format: 'file'` emits dist/services.html rather than dist/services/index.html,
// which combined with vercel.json `cleanUrls` reproduces exactly the URLs the
// site serves today (/services, no trailing slash). Preserving the 23 indexed
// URLs matters more than Astro's default directory layout.
export default defineConfig({
  site: 'https://www.primelocalgrowth.com',
  outDir: 'dist',
  build: {
    format: 'file',
    // Keep CSS in a single predictable file rather than per-page chunks so the
    // existing long-lived cache headers stay meaningful.
    inlineStylesheets: 'never',
  },
  devToolbar: { enabled: false },
});
