import { useEffect, useMemo, useRef, useState } from 'react'
import { tr, type T } from './i18n'
import { Kernel, type KernelState } from './kernel/client'
import type { FileInfo } from './kernel/protocol'
import { EXAMPLES, welcomeNotebook } from './lib/examples'
import { exportIpynb, importIpynb } from './lib/ipynb'
import {
  addCell, appendOutput, clearOutputs, codeCellIds, deleteCell, makeNotebook, moveCell, neighbour, nextExecutionCount,
  setCellType, setSource, startRun, type CellType, type Notebook,
} from './lib/model'
import { loadSettings, saveSettings, type Lang, type Settings, type Theme } from './lib/settings'
import { loadDraft, parseDraft, saveDraft, serializeDraft } from './lib/storage'
import CellView, { type CellActions, type RunState } from './components/CellView'
import FilesPanel from './components/FilesPanel'

const REPO = 'https://github.com/hermes98761234/browser-python-notebook'

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const hasContent = (nb: Notebook) => nb.cells.some((c) => c.source.trim() !== '' || c.outputs.length > 0)

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const t: T = (s, ...a) => tr(settings.lang, s, ...a)
  const tRef = useRef(t)
  useEffect(() => {
    tRef.current = t
  })

  const [nb, setNb] = useState<Notebook | null>(null)
  const nbRef = useRef<Notebook | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState<string | null>(null)
  const [queued, setQueued] = useState<string[]>([])
  const [kernel, setKernel] = useState<{ state: KernelState; detail: string }>({ state: 'starting', detail: '' })
  const [files, setFiles] = useState<FileInfo[]>([])
  const [filesOpen, setFilesOpen] = useState(false)
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const kernelRef = useRef<Kernel | null>(null)
  const queue = useRef<string[]>([])
  const pumping = useRef(false)
  const runningRef = useRef<string | null>(null)
  const epoch = useRef(0)
  const execCounter = useRef(1)
  const selRef = useRef<string | null>(null)
  const focusers = useRef(new Map<string, () => void>())
  const pendingFocus = useRef<string | null>(null)
  const noticeTimer = useRef<number | undefined>(undefined)

  // All handlers below only touch refs and stable setters, so this object never changes and
  // memoised cells do not re-render when another cell is edited.
  const api = useMemo(() => {
    const update = (f: (n: Notebook) => Notebook) => {
      if (!nbRef.current) return
      nbRef.current = f(nbRef.current)
      setNb(nbRef.current)
    }
    const replace = (n: Notebook) => {
      nbRef.current = n
      setNb(n)
      selRef.current = n.cells[0].id
      setSelected(n.cells[0].id)
      setEditing(new Set())
      execCounter.current = nextExecutionCount(n)
    }
    const say = (text: string, error = false) => {
      setNotice({ text, error })
      window.clearTimeout(noticeTimer.current)
      noticeTimer.current = window.setTimeout(() => setNotice(null), 5000)
    }
    const select = (id: string) => {
      selRef.current = id
      setSelected(id)
    }
    const focus = (id: string) => {
      select(id)
      pendingFocus.current = id
      setTimeout(() => {
        if (pendingFocus.current === id) {
          const f = focusers.current.get(id)
          if (f) {
            f()
            pendingFocus.current = null
          }
        }
      }, 0)
    }
    const setEditingFor = (id: string, on: boolean) =>
      setEditing((s) => {
        if (s.has(id) === on) return s
        const n = new Set(s)
        if (on) n.add(id)
        else n.delete(id)
        return n
      })

    const pump = async () => {
      if (pumping.current) return
      pumping.current = true
      const my = epoch.current
      try {
        while (my === epoch.current && queue.current.length > 0) {
          const id = queue.current.shift()!
          setQueued([...queue.current])
          const cell = nbRef.current?.cells.find((c) => c.id === id)
          const k = kernelRef.current
          if (!cell || cell.type !== 'code' || !k) continue
          const count = execCounter.current++
          update((n) => startRun(n, id, count))
          runningRef.current = id
          setRunning(id)
          try {
            const res = await k.run(id, cell.source, `Cell In[${count}]`, {
              onStream: (name, text) => update((n) => appendOutput(n, id, { output_type: 'stream', name, text })),
              onDisplay: (data) => update((n) => appendOutput(n, id, { output_type: 'display_data', data })),
            })
            if (res.data) update((n) => appendOutput(n, id, { output_type: 'execute_result', data: res.data!, execution_count: count }))
            if (res.error) {
              update((n) => appendOutput(n, id, { output_type: 'error', ...res.error! }))
              queue.current = []
              setQueued([])
            }
          } catch {
            break // the kernel was restarted under us
          }
        }
      } finally {
        if (my === epoch.current) {
          pumping.current = false
          runningRef.current = null
          setRunning(null)
          setQueued([])
        }
      }
    }

    const enqueue = (ids: string[]) => {
      for (const id of ids) if (!queue.current.includes(id) && runningRef.current !== id) queue.current.push(id)
      setQueued([...queue.current])
      void pump()
    }

    const restart = () => {
      epoch.current++
      queue.current = []
      pumping.current = false
      runningRef.current = null
      execCounter.current = 1
      setQueued([])
      setRunning(null)
      setFiles([])
      kernelRef.current?.start()
    }

    const interrupt = () => {
      const id = runningRef.current
      if (!id && queue.current.length === 0) return
      restart()
      if (id) {
        update((n) =>
          appendOutput(n, id, {
            output_type: 'error',
            ename: 'KeyboardInterrupt',
            evalue: 'interrupted',
            traceback: ['KeyboardInterrupt: ' + tRef.current('Execution interrupted: the kernel was restarted, variables are lost.')],
          }),
        )
      }
    }

    const addAfter = (type: CellType, afterId: string | null) => {
      if (!nbRef.current) return
      const r = addCell(nbRef.current, type, afterId)
      nbRef.current = r.nb
      setNb(r.nb)
      if (type === 'markdown') setEditingFor(r.id, true)
      focus(r.id)
    }

    const run = (id: string, how: 'next' | 'stay' | 'insert') => {
      const n = nbRef.current
      const cell = n?.cells.find((c) => c.id === id)
      if (!n || !cell) return
      if (cell.type === 'markdown') setEditingFor(id, false)
      else enqueue([id])
      if (how === 'insert') addAfter('code', id)
      else if (how === 'next') {
        const nxt = neighbour(n, id, 1)
        if (nxt) focus(nxt)
        else addAfter('code', id)
      }
    }

    const actions: CellActions = {
      select,
      setSource: (id, v) => update((n) => setSource(n, id, v)),
      setType: (id, type) => {
        update((n) => setCellType(n, id, type))
        setEditingFor(id, type === 'markdown')
      },
      run,
      move: (id, dir) => update((n) => moveCell(n, id, dir)),
      remove: (id) => {
        if (!nbRef.current) return
        const r = deleteCell(nbRef.current, id)
        nbRef.current = r.nb
        setNb(r.nb)
        select(r.selected)
        queue.current = queue.current.filter((q) => q !== id)
      },
      addBelow: (id, type) => addAfter(type, id),
      clearOutputs: (id) => update((n) => clearOutputs(n, id)),
      setEditing: setEditingFor,
      register: (id, f) => {
        if (f) {
          focusers.current.set(id, f)
          if (pendingFocus.current === id) {
            pendingFocus.current = null
            f()
          }
        } else focusers.current.delete(id)
      },
    }

    return { update, replace, say, actions, enqueue, restart, interrupt, addAfter }
  }, [])

  // Kernel lifecycle: one Pyodide worker per page, started right away so it is warm for the first run.
  useEffect(() => {
    const k = new Kernel({
      onState: (state, detail) => setKernel({ state, detail }),
      onFiles: setFiles,
    })
    kernelRef.current = k
    k.start()
    return () => {
      k.stop()
      kernelRef.current = null
    }
  }, [])

  // Restore the autosaved draft (or show the welcome notebook).
  useEffect(() => {
    let cancelled = false
    void loadDraft().then((raw) => {
      if (cancelled) return
      const draft = parseDraft(raw)
      let loaded: Notebook | null = null
      // A link like #example=pandas opens that example instead of the autosaved draft.
      const wanted = /^#example=([\w-]+)$/.exec(window.location.hash)?.[1]
      const ex = EXAMPLES.find((x) => x.key === wanted)
      if (ex) loaded = ex.make()
      else if (draft) {
        try {
          loaded = importIpynb(draft.ipynb, draft.name)
        } catch {
          loaded = null
        }
      }
      api.replace(loaded ?? welcomeNotebook())
    })
    return () => {
      cancelled = true
    }
  }, [api])

  // Autosave (debounced) to IndexedDB / localStorage.
  useEffect(() => {
    if (!nb) return
    const save = () => {
      const cur = nbRef.current
      if (cur) void saveDraft(serializeDraft({ name: cur.name, ipynb: exportIpynb(cur) })).then((where) => {
        if (where === 'none') api.say(tRef.current('Autosave is unavailable in this browser.'), true)
      })
    }
    const h = window.setTimeout(save, 700)
    return () => window.clearTimeout(h)
  }, [nb, api])

  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => {
    const root = document.documentElement
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.lang = settings.lang
  }, [settings.theme, settings.lang])
  useEffect(() => {
    document.title = nb ? `${nb.name} — ${t('Python Notebook')}` : t('Python Notebook')
  })

  const replaceNotebook = (next: Notebook) => {
    api.replace(next)
    api.restart()
  }
  const confirmReplace = () => !nbRef.current || !hasContent(nbRef.current) || window.confirm(t('Replace the current notebook? Unsaved changes will be lost.'))

  const openFile = async (f: File) => {
    try {
      const next = importIpynb(await f.text(), f.name)
      replaceNotebook(next)
    } catch (e) {
      api.say(t('Could not open file: {0}', e instanceof Error ? e.message : String(e)), true)
    }
  }

  const saveFile = () => {
    if (!nbRef.current) return
    download(new Blob([exportIpynb(nbRef.current)], { type: 'application/x-ipynb+json' }), `${nbRef.current.name || 'notebook'}.ipynb`)
  }

  const uploadFiles = async (list: FileList) => {
    const k = kernelRef.current
    if (!k) return
    for (const f of Array.from(list)) {
      try {
        await k.upload(f.name, await f.arrayBuffer())
        api.say(t('Uploaded {0}', f.name))
      } catch (e) {
        api.say(t('Upload failed: {0}', e instanceof Error ? e.message : String(e)), true)
      }
    }
  }
  const downloadFile = async (name: string) => {
    try {
      download(new Blob([await kernelRef.current!.download(name)]), name)
    } catch (e) {
      api.say(t('Download failed: {0}', e instanceof Error ? e.message : String(e)), true)
    }
  }
  const removeFile = async (name: string) => {
    try {
      await kernelRef.current!.remove(name)
    } catch (e) {
      api.say(String(e), true)
    }
  }

  if (!nb) return <div className="app" aria-busy="true" />

  const busy = running !== null || queued.length > 0
  const statusText =
    kernel.state === 'dead'
      ? t('Failed to start: {0}', kernel.detail)
      : kernel.state === 'starting'
        ? t(kernel.detail || 'Starting Python…')
        : kernel.state === 'busy'
          ? kernel.detail || t('Busy')
          : t('Idle')
  const runState = (id: string): RunState => (running === id ? 'running' : queued.includes(id) ? 'queued' : 'idle')
  const sel = selected ?? nb.cells[0].id

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">{t('Python Notebook')}</span>
        <input
          className="nbname"
          value={nb.name}
          placeholder={t('Unnamed')}
          aria-label={t('Notebook name')}
          onChange={(e) => api.update((n) => ({ ...n, name: e.target.value }))}
        />
        <span className={`status ${kernel.state}`} role="status" title={statusText}>
          <i className="dot" />
          <span className="status-text">{statusText}</span>
        </span>
        <span className="spacer" />
        <label className="field">
          <span className="sr">{t('Theme')}</span>
          <select value={settings.theme} aria-label={t('Theme')} onChange={(e) => setSettings({ ...settings, theme: e.target.value as Theme })}>
            <option value="auto">{t('System')}</option>
            <option value="light">{t('Light')}</option>
            <option value="dark">{t('Dark')}</option>
          </select>
        </label>
        <label className="field">
          <span className="sr">{t('Language')}</span>
          <select value={settings.lang} aria-label={t('Language')} onChange={(e) => setSettings({ ...settings, lang: e.target.value as Lang })}>
            <option value="en">English</option>
            <option value="uk">Українська</option>
          </select>
        </label>
      </header>

      <div className="toolbar" role="toolbar">
        <button className="primary" title={t('Run cell (Shift+Enter)')} onClick={() => api.actions.run(sel, 'next')}>
          ▶ {t('Run')}
        </button>
        <button onClick={() => api.enqueue(codeCellIds(nb))}>⏭ {t('Run all')}</button>
        <button className="danger" disabled={!busy} title={t('Interrupt (restarts the kernel)')} onClick={api.interrupt}>
          ■ {t('Interrupt')}
        </button>
        <button title={t('Restart kernel')} onClick={api.restart}>↻ {t('Restart')}</button>
        <button
          title={t('Restart and run all')}
          onClick={() => {
            api.restart()
            api.enqueue(codeCellIds(nbRef.current!))
          }}
        >
          ↻⏭
        </button>
        <span className="sep" />
        <button onClick={() => api.addAfter('code', sel)}>{t('+ Code')}</button>
        <button onClick={() => api.addAfter('markdown', sel)}>{t('+ Markdown')}</button>
        <button onClick={() => api.update((n) => clearOutputs(n))}>{t('Clear outputs')}</button>
        <span className="sep" />
        <button
          onClick={() => {
            if (confirmReplace()) replaceNotebook(makeNotebook(t('Unnamed')))
          }}
        >
          {t('New')}
        </button>
        <button title={t('Open .ipynb')} onClick={() => fileInput.current?.click()}>{t('Open')}</button>
        <input
          ref={fileInput}
          type="file"
          accept=".ipynb,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f && confirmReplace()) void openFile(f)
          }}
        />
        <button title={t('Save as .ipynb')} onClick={saveFile}>{t('Save')}</button>
        <select
          value=""
          aria-label={t('Examples')}
          onChange={(e) => {
            const ex = EXAMPLES.find((x) => x.key === e.target.value)
            if (ex && confirmReplace()) replaceNotebook(ex.make())
          }}
        >
          <option value="">{t('Load example…')}</option>
          {EXAMPLES.map((x) => (
            <option key={x.key} value={x.key}>{x.title}</option>
          ))}
        </select>
        <button className={filesOpen ? 'on' : ''} aria-pressed={filesOpen} onClick={() => setFilesOpen(!filesOpen)}>
          {t('Files')}{files.length > 0 ? ` (${files.length})` : ''}
        </button>
      </div>

      <div className="body">
        <main className="cells">
          {nb.cells.map((c, i) => (
            <CellView
              key={c.id}
              cell={c}
              index={i}
              selected={c.id === sel}
              editing={editing.has(c.id)}
              runState={runState(c.id)}
              actions={api.actions}
              t={t}
            />
          ))}
          <div className="add-row">
            <button onClick={() => api.addAfter('code', nb.cells[nb.cells.length - 1].id)}>{t('+ Code')}</button>
            <button onClick={() => api.addAfter('markdown', nb.cells[nb.cells.length - 1].id)}>{t('+ Markdown')}</button>
          </div>
        </main>
        {filesOpen && <FilesPanel files={files} onUpload={(l) => void uploadFiles(l)} onDownload={(n) => void downloadFile(n)} onRemove={(n) => void removeFile(n)} t={t} />}
      </div>

      {notice && (
        <div className={`toast${notice.error ? ' error' : ''}`} role="status" aria-live="polite">
          {notice.text}
        </div>
      )}
      <p className="hint foot">
        {t('Python in your browser: a Jupyter-style notebook powered by Pyodide. Your code and data never leave this page.')}{' '}
        {t('Python runtime is loaded from the jsDelivr CDN.')}{' '}
        <a href={REPO}>{t('Source on GitHub')}</a>
      </p>
    </div>
  )
}
