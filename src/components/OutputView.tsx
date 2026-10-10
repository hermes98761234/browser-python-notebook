import { useMemo } from 'react'
import type { MimeBundle, Output } from '../lib/model'
import { renderMarkdown } from '../lib/markdown'
import { sanitizeHtml } from '../lib/sanitize'

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g')
const stripAnsi = (s: string) => s.replace(ANSI, '')

function Bundle({ data }: { data: MimeBundle }) {
  const html = data['text/html']
  const md = data['text/markdown']
  const rendered = useMemo(() => {
    if (data['image/png'] || data['image/jpeg'] || data['image/svg+xml']) return null
    if (html !== undefined) return sanitizeHtml(html)
    if (md !== undefined) return sanitizeHtml(renderMarkdown(md))
    return null
  }, [data, html, md])

  if (data['image/png']) return <img className="out-img" alt="" src={`data:image/png;base64,${data['image/png'].replace(/\s+/g, '')}`} />
  if (data['image/jpeg']) return <img className="out-img" alt="" src={`data:image/jpeg;base64,${data['image/jpeg'].replace(/\s+/g, '')}`} />
  if (data['image/svg+xml']) return <img className="out-img" alt="" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(data['image/svg+xml'])}`} />
  if (rendered !== null) return <div className="out-html" dangerouslySetInnerHTML={{ __html: rendered }} />
  const text = data['text/plain'] ?? data['text/latex'] ?? data['application/json'] ?? ''
  return <pre className="out-text">{stripAnsi(text)}</pre>
}

export default function OutputView({ outputs }: { outputs: Output[] }) {
  if (outputs.length === 0) return null
  return (
    <div className="outputs">
      {outputs.map((o, i) => {
        switch (o.output_type) {
          case 'stream':
            return (
              <pre key={i} className={`out-text ${o.name}`}>
                {stripAnsi(o.text)}
              </pre>
            )
          case 'error':
            return (
              <pre key={i} className="out-text error">
                {stripAnsi(o.traceback.length > 0 ? o.traceback.join('\n') : `${o.ename}: ${o.evalue}`)}
              </pre>
            )
          default:
            return <Bundle key={i} data={o.data} />
        }
      })}
    </div>
  )
}
