import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendPort = process.env.BACKEND_PORT || process.env.PORT || 3001;
const frontendPort = process.env.FRONTEND_PORT || 5273;

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
    port: Number(frontendPort),
    strictPort: true,
    host: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${backendPort}`,
        changeOrigin: true,
      },
    },
  },
});
