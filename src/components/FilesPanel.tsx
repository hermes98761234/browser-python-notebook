import { useRef } from 'react'
import type { FileInfo } from '../kernel/protocol'
import type { T } from '../i18n'

function human(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

interface Props {
  files: FileInfo[]
  onUpload(files: FileList): void
  onDownload(name: string): void
  onRemove(name: string): void
  t: T
}

export default function FilesPanel({ files, onUpload, onDownload, onRemove, t }: Props) {
  const input = useRef<HTMLInputElement>(null)
  return (
    <aside className="files" aria-label={t('Files')}>
      <div className="files-head">
        <strong>{t('Files')}</strong>
        <button className="small" onClick={() => input.current?.click()}>
          {t('Upload')}
        </button>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) onUpload(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      <p className="hint">{t('Files live in the in-browser file system (/home/pyodide). Read them from Python with open() or pandas.read_csv().')}</p>
      {files.length === 0 ? (
        <p className="hint">{t('No files yet.')}</p>
      ) : (
        <ul>
          {files.map((f) => (
            <li key={f.name}>
              <span className="fname" title={f.name}>{f.name}</span>
              <span className="fsize">{human(f.size)}</span>
              <button className="small" title={t('Download')} aria-label={`${t('Download')} ${f.name}`} onClick={() => onDownload(f.name)}>↓</button>
              <button className="small danger" title={t('Delete')} aria-label={`${t('Delete')} ${f.name}`} onClick={() => onRemove(f.name)}>✕</button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
