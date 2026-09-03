import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/PrivateHub/',
  plugins: [react()],
  build: { sourcemap: false },
})
