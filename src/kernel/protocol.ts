// Messages between the page and the Pyodide worker.
import type { MimeBundle } from '../lib/model'

export interface FileInfo {
  name: string
  size: number
}

export type ToWorker =
  | { type: 'init' }
  | { type: 'run'; id: string; code: string; label: string }
  | { type: 'upload'; reqId: number; name: string; data: ArrayBuffer }
  | { type: 'download'; reqId: number; name: string }
  | { type: 'remove'; reqId: number; name: string }
  | { type: 'files' }

export type FromWorker =
  | { type: 'status'; text: string }
  | { type: 'ready' }
  | { type: 'fatal'; message: string }
  | { type: 'stream'; id: string; name: 'stdout' | 'stderr'; text: string }
  | { type: 'display'; id: string; data: MimeBundle }
  | { type: 'result'; id: string; data?: MimeBundle; error?: { ename: string; evalue: string; traceback: string[] } }
  | { type: 'files'; files: FileInfo[] }
  | { type: 'file'; reqId: number; name: string; data?: ArrayBuffer; error?: string }
  | { type: 'done'; reqId: number; error?: string }
