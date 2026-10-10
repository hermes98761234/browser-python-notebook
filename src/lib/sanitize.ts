// Minimal HTML sanitizer for notebook outputs and Markdown (imported notebooks are untrusted).
// Removes scripts, embedded documents, event handlers and javascript: URLs. Needs DOMParser.

const DROP = new Set(['SCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'BASE', 'FRAME', 'FRAMESET', 'APPLET', 'FORM'])

function bad(name: string, value: string): boolean {
  if (name.startsWith('on')) return true
  if (name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action' || name === 'formaction' || name === 'srcdoc') {
    // Browsers ignore control characters and spaces inside URL schemes ("java\tscript:").
    const v = Array.from(value).filter((ch) => ch.charCodeAt(0) > 0x20 && (ch.charCodeAt(0) < 0x7f || ch.charCodeAt(0) > 0x9f)).join('').toLowerCase()
    if (name === 'srcdoc') return true
    if (v.startsWith('javascript:') || v.startsWith('vbscript:')) return true
    if (v.startsWith('data:') && !v.startsWith('data:image/') ) return true
    if (v.startsWith('data:image/svg')) return true
  }
  return false
}

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      if (DROP.has(child.tagName.toUpperCase())) {
        child.remove()
        continue
      }
      for (const attr of Array.from(child.attributes)) {
        if (bad(attr.name.toLowerCase(), attr.value)) child.removeAttribute(attr.name)
      }
      if (child.tagName === 'A') {
        child.setAttribute('target', '_blank')
        child.setAttribute('rel', 'noopener noreferrer')
      }
      walk(child)
    }
  }
  walk(doc.body)
  return doc.body.innerHTML
}
