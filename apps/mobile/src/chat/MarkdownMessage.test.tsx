import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { MarkdownMessage } from './MarkdownMessage'

function render(text: string): string {
  return renderToStaticMarkup(<MarkdownMessage text={text} />)
}

describe('MarkdownMessage', () => {
  it('renders headings, bold, lists, and inline code instead of literal markers', () => {
    const html = render('### Release proof\n\n- **Tests:** 31/31 passed\n- `VALID`')

    expect(html).toContain('<h3>Release proof</h3>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<strong>Tests:</strong> 31/31 passed')
    expect(html).toContain('<code>VALID</code>')
    expect(html).not.toContain('### Release proof')
    expect(html).not.toContain('**Tests:**')
  })

  it('renders fenced code safely and omits raw HTML', () => {
    const html = render('```json\n{"ok":true}\n```\n\n<script>alert(1)</script>')

    expect(html).toContain('<pre><code class="language-json">')
    expect(html).toContain('{&quot;ok&quot;:true}')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('alert(1)')
  })

  it('adds safe external-link attributes and disables task checkboxes', () => {
    const html = render('[Hermes](https://example.com)\n\n- [x] Shipped')

    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noreferrer noopener"')
    expect(html).toMatch(/<input[^>]*disabled=""/)
    expect(html).toMatch(/<input[^>]*checked=""/)
  })
})
