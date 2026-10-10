// Markdown -> HTML with KaTeX math ($...$, $$...$$, \(...\), \[...\]).
import katex from 'katex'
import { marked } from 'marked'

interface Math {
  tex: string
  display: boolean
}

/** Replaces code (kept verbatim) and math (rendered later) by placeholders. */
export function extractMath(src: string): { text: string; math: Math[]; code: string[] } {
  const math: Math[] = []
  const code: string[] = []
  const stash = (s: string) => `@@CODE${code.push(s) - 1}@@`
  let text = src
    .replace(/^(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\1[ \t]*$/gm, stash)
    .replace(/(`+)(?!`)[\s\S]*?[^`]\1(?!`)/g, stash)
  const put = (tex: string, display: boolean) => `@@MATH${math.push({ tex, display }) - 1}@@`
  text = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, t: string) => put(t, true))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, t: string) => put(t, true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, t: string) => put(t, false))
    // Inline $...$: no space just inside the dollars, and the closer is not followed by a digit ("$5 and $6").
    .replace(/(?<![\\$])\$(?=\S)((?:\\.|[^$\\\n])*?\S)\$(?!\d)/g, (_, t: string) => put(t, false))
  return { text, math, code }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function renderTex(m: Math): string {
  try {
    return katex.renderToString(m.tex, { displayMode: m.display, throwOnError: false, output: 'htmlAndMathml' })
  } catch {
    return `<code>${esc(m.tex)}</code>`
  }
}

/** Renders Markdown to (unsanitized) HTML. Run the result through sanitizeHtml before inserting. */
export function renderMarkdown(src: string): string {
  const { text, math, code } = extractMath(src)
  const restoredCode = text // code placeholders are restored before marked so it formats them
    .replace(/@@CODE(\d+)@@/g, (_, i: string) => code[+i])
  // Math placeholders survive marked as plain words.
  const html = marked.parse(restoredCode, { async: false, gfm: true, breaks: false })
  return html.replace(/@@MATH(\d+)@@/g, (_, i: string) => renderTex(math[+i]))
}
