import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


// https://vite.dev/config/
export default defineConfig({
  base: '/BaseModel/',
  plugins: [react()],
  server: {
    fs: {
      // Allow serving files from three levels up to the project root
      allow: ['../../..']
    }
  }
})
