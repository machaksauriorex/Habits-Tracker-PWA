import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    pool: 'forks', // evita el fallo de memoria de vmForks con Node 24
  },
})
