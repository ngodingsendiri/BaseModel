import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  base: '/BaseModel/',
  plugins: [react()],
  server: {
    fs: {
      // Allow serving files from three levels up to the project root
      allow: ['../../..'],
    },
  },
});
