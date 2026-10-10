/// <reference types="vite/client" />
declare const __PYODIDE_VERSION__: string
declare module '*.py?raw' {
  const src: string
  export default src
}
