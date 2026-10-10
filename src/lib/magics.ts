// A few IPython conveniences handled before the code reaches Python.

export interface Prepared {
  code: string
  /** True when the code installs packages, so micropip has to be loaded first. */
  usesMicropip: boolean
}

const PIP = /^(\s*)[%!]\s*pip\s+install\s+(.*)$/
const MATPLOTLIB = /^\s*%matplotlib\b.*$/

/**
 * `%pip install pkg` / `!pip install pkg` become `await micropip.install([...])`; `%matplotlib ...`
 * is dropped (figures always render inline). Line numbers are preserved.
 */
export function prepareCode(code: string): Prepared {
  let usesMicropip = false
  const lines = code.split('\n').map((line) => {
    const pip = PIP.exec(line)
    if (pip) {
      const pkgs = pip[2]
        .split(/\s+/)
        .filter((a) => a !== '' && !a.startsWith('-'))
        .map((a) => a.replace(/^['"]|['"]$/g, ''))
      usesMicropip = true
      return `${pip[1]}await __import__('micropip').install(${JSON.stringify(pkgs)})`
    }
    if (MATPLOTLIB.test(line)) return 'pass'
    return line
  })
  return { code: lines.join('\n'), usesMicropip }
}
