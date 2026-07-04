import { resolve } from 'path';
import { readdirSync, existsSync } from 'fs';

// Get all HTML files from public directory
const publicHtmlFiles = readdirSync('./public')
  .filter(file => file.endsWith('.html'))
  .reduce((entries, file) => {
    entries[file.replace('.html', '')] = resolve(__dirname, 'public', file);
    return entries;
  }, {});

// Get HTML files from public/downloads if it exists
const downloadsPath = './public/downloads';
const downloadsHtmlFiles = existsSync(downloadsPath)
  ? readdirSync(downloadsPath)
      .filter(file => file.endsWith('.html'))
      .reduce((entries, file) => {
        entries[`downloads/${file.replace('.html', '')}`] = resolve(__dirname, 'public', 'downloads', file);
        return entries;
      }, {})
  : {};

export default {
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ...publicHtmlFiles,
        ...downloadsHtmlFiles
      },
      output: {
        dir: 'dist'
      }
    },
    target: 'es2020',
    minify: 'terser',
    sourcemap: false
  },
  server: {
    port: 5173
  }
}
