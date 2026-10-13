import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  publicDir: 'public-release',
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom', 'react-router', 'gsap', '@gsap/react'],
  },
});
