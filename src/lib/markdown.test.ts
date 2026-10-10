// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { extractMath, renderMarkdown } from './markdown'
import { sanitizeHtml } from './sanitize'

describe('markdown', () => {
  it('renders basic markdown', () => {
    const h = renderMarkdown('# Title\n\nSome **bold** and `code`.\n\n- a\n- b')
    expect(h).toContain('<h1>Title</h1>')
    expect(h).toContain('<strong>bold</strong>')
    expect(h).toContain('<code>code</code>')
    expect(h).toContain('<li>a</li>')
  })

  it('renders inline and display math with KaTeX', () => {
    const h = renderMarkdown('Euler: $e^{i\\pi}+1=0$\n\n$$\\int_0^1 x^2\\,dx = \\tfrac13$$')
    expect(h).toContain('class="katex"')
    expect(h).toContain('katex-display')
    expect(h).not.toContain('@@MATH')
    expect(h).not.toContain('$$')
  })

  it('supports \\( \\) and \\[ \\] delimiters', () => {
    const h = renderMarkdown('\\(a^2\\) and \\[b^2\\]')
    expect(h.match(/class="katex"/g)?.length).toBe(2)
    expect(h).toContain('katex-display')
  })

  it('leaves prices and code alone', () => {
    const { math } = extractMath('It costs $5 and $6 today.')
    expect(math).toHaveLength(0)
    const h = renderMarkdown('Use `$x$` literally.\n\n```\n$$a$$\n```')
    expect(h).not.toContain('class="katex"')
    expect(h).toContain('$x$')
    expect(h).toContain('$$a$$')
  })

  it('does not throw on invalid TeX', () => {
    expect(() => renderMarkdown('$\\frac{$')).not.toThrow()
  })
})

describe('sanitizeHtml', () => {
  it('keeps tables and images but drops scripts, handlers and js urls', () => {
    const out = sanitizeHtml(
      '<table><tr><td onclick="x()">1</td></tr></table><script>alert(1)</script><img src="data:image/png;base64,AA" onerror="y()"><a href="javascript:alert(1)">l</a><iframe></iframe>',
    )
    expect(out).toContain('<td>1</td>')
    expect(out).toContain('data:image/png')
    expect(out).not.toMatch(/script|onclick|onerror|javascript:|iframe/i)
  })
})

describe('sanitizeHtml edge cases', () => {
  it('catches obfuscated javascript: urls and svg data urls', () => {
    const out = sanitizeHtml('<a href="java\tscript:alert(1)">x</a><img src="data:image/svg+xml;base64,AAAA"><a href="https://example.com">ok</a>')
    expect(out).not.toMatch(/script:/i)
    expect(out).not.toContain('svg+xml')
    expect(out).toContain('href="https://example.com"')
    expect(out).toContain('rel="noopener noreferrer"')
  })
})
