// Main-thread handle to the Pyodide worker. Restarting = terminating the worker and starting a new
// one, which is also how "interrupt" works (SharedArrayBuffer needs COOP/COEP headers, which GitHub
// Pages cannot send).
import type { MimeBundle } from '../lib/model'
import type { FileInfo, FromWorker, ToWorker } from './protocol'

export type KernelState = 'starting' | 'idle' | 'busy' | 'dead'

export interface RunHandlers {
  onStream(name: 'stdout' | 'stderr', text: string): void
  onDisplay(data: MimeBundle): void
}

export interface RunResult {
  data?: MimeBundle
  error?: { ename: string; evalue: string; traceback: string[] }
}

export interface KernelEvents {
  onState(state: KernelState, detail: string): void
  onFiles(files: FileInfo[]): void
}

interface Pending {
  resolve(r: RunResult): void
  reject(e: Error): void
  handlers: RunHandlers
}

export class Kernel {
  private worker: Worker | null = null
  private runs = new Map<string, Pending>()
  private requests = new Map<number, { resolve(m: FromWorker): void; reject(e: Error): void }>()
  private reqId = 0
  private ready: Promise<void> = Promise.resolve()
  private generation = 0
  private rejectReady: ((e: Error) => void) | null = null

  private events: KernelEvents

  constructor(events: KernelEvents) {
    this.events = events
  }

  /** Starts a fresh worker (terminating any old one). Pending runs are rejected. */
  start() {
    this.stop('Kernel restarted')
    const gen = ++this.generation
    this.events.onState('starting', 'Starting Python…')
    const worker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        if (gen !== this.generation) return
        const m = e.data
        if (m.type === 'ready') {
          this.events.onState('idle', '')
          resolve()
        } else if (m.type === 'fatal') {
          this.events.onState('dead', m.message)
          reject(new Error(m.message))
        } else this.handle(m)
      }
      worker.onerror = (e) => {
        if (gen !== this.generation) return
        this.events.onState('dead', e.message || 'Worker failed')
        reject(new Error(e.message || 'Worker failed'))
      }
    })
    this.ready.catch(() => undefined)
    this.send({ type: 'init' })
  }

  private handle(m: FromWorker) {
    switch (m.type) {
      case 'status':
        if (this.runs.size > 0 || m.text) this.events.onState(this.runs.size > 0 ? 'busy' : 'starting', m.text)
        break
      case 'stream':
        this.runs.get(m.id)?.handlers.onStream(m.name, m.text)
        break
      case 'display':
        this.runs.get(m.id)?.handlers.onDisplay(m.data)
        break
      case 'result': {
        const p = this.runs.get(m.id)
        this.runs.delete(m.id)
        p?.resolve({ data: m.data, error: m.error })
        if (this.runs.size === 0) this.events.onState('idle', '')
        break
      }
      case 'files':
        this.events.onFiles(m.files)
        break
      case 'file':
      case 'done': {
        const r = this.requests.get(m.reqId)
        this.requests.delete(m.reqId)
        r?.resolve(m)
        break
      }
    }
  }

  private send(m: ToWorker, transfer: Transferable[] = []) {
    this.worker?.postMessage(m, transfer)
  }

  /** Stops the worker, rejecting everything in flight. */
  stop(reason = 'Kernel stopped') {
    this.rejectReady?.(new Error(reason))
    this.worker?.terminate()
    this.worker = null
    for (const p of this.runs.values()) p.reject(new Error(reason))
    this.runs.clear()
    for (const r of this.requests.values()) r.reject(new Error(reason))
    this.requests.clear()
    this.generation++
  }

  async run(id: string, code: string, label: string, handlers: RunHandlers): Promise<RunResult> {
    await this.ready
    return new Promise<RunResult>((resolve, reject) => {
      this.runs.set(id, { resolve, reject, handlers })
      this.events.onState('busy', '')
      this.send({ type: 'run', id, code, label })
    })
  }

  private async request(m: (reqId: number) => ToWorker, transfer: Transferable[] = []): Promise<FromWorker> {
    await this.ready
    const reqId = ++this.reqId
    return new Promise((resolve, reject) => {
      this.requests.set(reqId, { resolve, reject })
      this.send(m(reqId), transfer)
    })
  }

  async upload(name: string, data: ArrayBuffer) {
    const r = await this.request((reqId) => ({ type: 'upload', reqId, name, data }), [data])
    if (r.type === 'done' && r.error) throw new Error(r.error)
  }

  async download(name: string): Promise<ArrayBuffer> {
    const r = await this.request((reqId) => ({ type: 'download', reqId, name }))
    if (r.type !== 'file' || !r.data) throw new Error(r.type === 'file' && r.error ? r.error : 'Download failed')
    return r.data
  }

  async remove(name: string) {
    const r = await this.request((reqId) => ({ type: 'remove', reqId, name }))
    if (r.type === 'done' && r.error) throw new Error(r.error)
  }
}
