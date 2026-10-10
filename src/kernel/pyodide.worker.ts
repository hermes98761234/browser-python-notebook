// Runs Pyodide (loaded from the jsDelivr CDN) off the main thread.
import type { PyodideInterface } from 'pyodide'
import bootstrap from './bootstrap.py?raw'
import { prepareCode } from '../lib/magics'
import type { FileInfo, FromWorker, ToWorker } from './protocol'

const CDN = `https://cdn.jsdelivr.net/pyodide/v${__PYODIDE_VERSION__}/full/`
const HOME = '/home/pyodide'

const ctx = self as unknown as {
  postMessage(m: FromWorker, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null
}
const post = (m: FromWorker, transfer?: Transferable[]) => ctx.postMessage(m, transfer)

let py: PyodideInterface
let current = ''
let runner: ((code: string, label: string) => Promise<string>) | null = null

async function init() {
  post({ type: 'status', text: 'Downloading Python runtime…' })
  const mod = (await import(/* @vite-ignore */ `${CDN}pyodide.mjs`)) as typeof import('pyodide')
  py = await mod.loadPyodide({ indexURL: CDN })
  py.setStdout({ batched: (s) => post({ type: 'stream', id: current, name: 'stdout', text: s + '\n' }) })
  py.setStderr({ batched: (s) => post({ type: 'stream', id: current, name: 'stderr', text: s + '\n' }) })
  ;(globalThis as unknown as Record<string, unknown>).__nbEmit = (json: string) =>
    post({ type: 'display', id: current, data: JSON.parse(json) })
  try {
    py.FS.chdir(HOME)
  } catch {
    // keep the default directory
  }
  py.runPython(bootstrap)
  const fn = py.globals.get('_run') as (code: string, label: string) => Promise<string>
  runner = (code, label) => fn(code, label)
  post({ type: 'ready' })
  listFiles()
}

async function run(id: string, source: string, label: string) {
  current = id
  const { code, usesMicropip } = prepareCode(source)
  try {
    const messageCallback = (m: string) => post({ type: 'status', text: m })
    const errorCallback = (m: string) => post({ type: 'stream', id, name: 'stderr', text: m + '\n' })
    if (usesMicropip) await py.loadPackage('micropip', { messageCallback, errorCallback })
    try {
      await py.loadPackagesFromImports(code, { messageCallback, errorCallback })
    } catch (e) {
      post({ type: 'stream', id, name: 'stderr', text: `Could not load packages: ${String(e)}\n` })
    }
    post({ type: 'status', text: '' })
    const out = JSON.parse(await runner!(code, label)) as { result?: Record<string, string>; error?: { ename: string; evalue: string; traceback: string[] } }
    post({ type: 'result', id, data: out.result, error: out.error })
  } catch (e) {
    post({ type: 'result', id, error: { ename: 'KernelError', evalue: String(e), traceback: [String(e)] } })
  }
  listFiles()
}

function listFiles() {
  const files: FileInfo[] = []
  try {
    for (const name of py.FS.readdir(HOME)) {
      if (name === '.' || name === '..' || name.startsWith('.')) continue
      const st = py.FS.stat(`${HOME}/${name}`)
      if (py.FS.isFile(st.mode)) files.push({ name, size: st.size })
    }
  } catch {
    // directory missing: report nothing
  }
  files.sort((a, b) => a.name.localeCompare(b.name))
  post({ type: 'files', files })
}

const safeName = (n: string) => n.split(/[\\/]/).pop()!.replace(/^\.+/, '') || 'file'

ctx.onmessage = (e) => {
  const m = e.data
  switch (m.type) {
    case 'init':
      init().catch((err) => post({ type: 'fatal', message: String(err) }))
      break
    case 'run':
      void run(m.id, m.code, m.label)
      break
    case 'upload':
      try {
        py.FS.writeFile(`${HOME}/${safeName(m.name)}`, new Uint8Array(m.data))
        post({ type: 'done', reqId: m.reqId })
      } catch (err) {
        post({ type: 'done', reqId: m.reqId, error: String(err) })
      }
      listFiles()
      break
    case 'download':
      try {
        const data = py.FS.readFile(`${HOME}/${safeName(m.name)}`) as Uint8Array
        const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
        post({ type: 'file', reqId: m.reqId, name: m.name, data: buf }, [buf])
      } catch (err) {
        post({ type: 'file', reqId: m.reqId, name: m.name, error: String(err) })
      }
      break
    case 'remove':
      try {
        py.FS.unlink(`${HOME}/${safeName(m.name)}`)
        post({ type: 'done', reqId: m.reqId })
      } catch (err) {
        post({ type: 'done', reqId: m.reqId, error: String(err) })
      }
      listFiles()
      break
    case 'files':
      listFiles()
      break
  }
}
