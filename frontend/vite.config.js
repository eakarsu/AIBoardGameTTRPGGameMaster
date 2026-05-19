import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react({
      // allow JSX inside .js files (components are *.js per spec)
      include: /\.(js|jsx|ts|tsx)$/,
    }),
  ],
  esbuild: {
    loader: 'jsx',
    include: /src\/.*\.jsx?$/,
    exclude: [],
  },
  optimizeDeps: {
    esbuildOptions: {
      loader: { '.js': 'jsx' },
    },
  },
  server: {
    port: 5273,
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3201',
        changeOrigin: true,
      },
    },
  },
});
