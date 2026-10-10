import { readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The Pyodide runtime is loaded from the jsDelivr CDN; the npm package only provides the types
// and pins the version.
const pyodideVersion = (JSON.parse(readFileSync('./node_modules/pyodide/package.json', 'utf8')) as { version: string }).version

export default defineConfig({
  plugins: [react()],
  // Relative asset paths: the build works from any sub-path (GitHub Pages).
  base: './',
  define: { __PYODIDE_VERSION__: JSON.stringify(pyodideVersion) },
  worker: { format: 'es' },
  test: { testTimeout: 30000 },
})
