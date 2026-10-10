// Notebook autosave: IndexedDB, with localStorage as a fallback.
const DB = 'browser-python-notebook'
const STORE = 'kv'
const KEY = 'current'
const LS_KEY = 'bpn.notebook.v1'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'))
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('indexedDB error'))
  })
}

async function idbGet(): Promise<string | null> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(KEY)
    r.onsuccess = () => {
      db.close()
      resolve(typeof r.result === 'string' ? r.result : null)
    }
    r.onerror = () => {
      db.close()
      reject(r.error ?? new Error('indexedDB error'))
    }
  })
}

async function idbSet(value: string): Promise<void> {
  const db = await open()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(value, KEY)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error ?? new Error('indexedDB error'))
    }
  })
}

/** Saves the serialized notebook (.ipynb JSON plus its name) and returns where it went. */
export async function saveDraft(json: string): Promise<'indexeddb' | 'localstorage' | 'none'> {
  try {
    await idbSet(json)
    return 'indexeddb'
  } catch {
    try {
      localStorage.setItem(LS_KEY, json)
      return 'localstorage'
    } catch {
      return 'none'
    }
  }
}

export async function loadDraft(): Promise<string | null> {
  try {
    const v = await idbGet()
    if (v) return v
  } catch {
    // fall through to localStorage
  }
  try {
    return localStorage.getItem(LS_KEY)
  } catch {
    return null
  }
}

export interface Draft {
  name: string
  ipynb: string
}

export const serializeDraft = (d: Draft): string => JSON.stringify(d)

export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null
  try {
    const v = JSON.parse(raw) as Partial<Draft>
    return typeof v.name === 'string' && typeof v.ipynb === 'string' ? { name: v.name, ipynb: v.ipynb } : null
  } catch {
    return null
  }
}
