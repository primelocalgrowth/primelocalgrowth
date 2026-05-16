export default {
  build: {
    rollupOptions: {
      output: {
        dir: 'dist'
          }
            external: [/^\/_vercel\//, /^\/__manus__\//, /^\/__/],
    },
    target: 'es2020',
          minify: 'terser',
          sourcemap: false
      },
        server: {
    port: 5173
      }
  }
