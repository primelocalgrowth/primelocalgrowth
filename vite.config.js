export default {
  build: {
    rollupOptions: {
      output: {
        dir: 'dist'
          }
    },
    target: 'es2020',
          minify: 'terser',
          sourcemap: false
      },
        external: [/^\/_vercel\//]
        server: {
    port: 5173
      }
  }
