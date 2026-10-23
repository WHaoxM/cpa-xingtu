/**
 * Lightweight Markdown → HTML for chat bubbles.
 * Escapes raw HTML first; supports headings, lists, quotes, fences, inline marks.
 */
import MarkdownIt from 'markdown-it'

// Reuse markdown-it 14.1.1 (MIT), rules_block/table.mjs, for GFM tables only.
// Existing prose rendering stays unchanged; raw HTML, images and unsafe links
// are never enabled by this student-only presentation option.
const studentTableMarkdown = new MarkdownIt({ html: false, linkify: false, typographer: false }).disable('image')
studentTableMarkdown.renderer.rules.table_open = () => '<div class="md-table-scroll" tabindex="0" role="region" aria-label="表格，可横向滚动"><table class="md-table">\n'
studentTableMarkdown.renderer.rules.table_close = () => '</table></div>\n'

function renderWithTables(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const tokens = studentTableMarkdown.parse(lines.join('\n'), {})
  const out: string[] = []
  let cursor = 0
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!
    if (token.type !== 'table_open' || !token.map) continue
    const end = tokens.findIndex((candidate, next) => next > index && candidate.type === 'table_close')
    if (end < 0) continue
    out.push(renderMarkdown(lines.slice(cursor, token.map[0]).join('\n')))
    out.push(studentTableMarkdown.renderer.render(tokens.slice(index, end + 1), studentTableMarkdown.options, {}))
    cursor = token.map[1]
    index = end
  }
  out.push(renderMarkdown(lines.slice(cursor).join('\n')))
  return out.join('')
}

/** Remove decorative emoji outside fenced code (keeps technical content intact). */
function stripDecorativeEmoji(source: string): string {
  const parts = source.split(/(```[\s\S]*?```)/g)
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part
      return part
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/[\uFE0F\u200D]/g, '')
        .replace(/[ \t]{2,}/g, ' ')
        .replace(/^ ([^\s])/gm, '$1')
    })
    .join('')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function inlineMarkdown(text: string): string {
  let s = escapeHtml(text)
  s = s.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/_([^_\n]+)_/g, '<em>$1</em>')
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="md-link" href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
  return s
}

function flushParagraph(buf: string[], out: string[]) {
  const text = buf.join('\n').trim()
  if (!text) return
  out.push(`<p class="md-p">${inlineMarkdown(text).replace(/\n/g, '<br>')}</p>`)
  buf.length = 0
}

function flushList(items: string[], ordered: boolean, out: string[]) {
  if (!items.length) return
  const tag = ordered ? 'ol' : 'ul'
  const cls = ordered ? 'md-ol' : 'md-ul'
  const body = items.map(item => `<li class="md-li">${inlineMarkdown(item)}</li>`).join('')
  out.push(`<${tag} class="${cls}">${body}</${tag}>`)
  items.length = 0
}

/** Convert a Markdown string to safe HTML for `v-html`. */
export function renderMarkdown(source: string, options?: { studentTables?: boolean }): string {
  if (!source) return ''
  if (options?.studentTables) return renderWithTables(source)

  const lines = stripDecorativeEmoji(source).replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  const para: string[] = []
  const listItems: string[] = []
  let listOrdered = false
  let inFence = false
  let fenceLang = ''
  let fenceBuf: string[] = []

  const endList = () => flushList(listItems, listOrdered, out)

  for (const raw of lines) {
    if (inFence) {
      if (/^```/.test(raw)) {
        const code = escapeHtml(fenceBuf.join('\n'))
        const lang = fenceLang ? ` data-lang="${escapeHtml(fenceLang)}"` : ''
        out.push(`<pre class="md-pre"${lang}><code class="md-codeblock">${code}</code></pre>`)
        inFence = false
        fenceLang = ''
        fenceBuf = []
      } else {
        fenceBuf.push(raw)
      }
      continue
    }

    const fenceOpen = raw.match(/^```([\w+-]*)\s*$/)
    if (fenceOpen) {
      flushParagraph(para, out)
      endList()
      inFence = true
      fenceLang = fenceOpen[1] || ''
      fenceBuf = []
      continue
    }

    if (/^\s*$/.test(raw)) {
      flushParagraph(para, out)
      endList()
      continue
    }

    if (/^---+$/.test(raw.trim())) {
      flushParagraph(para, out)
      endList()
      out.push('<hr class="md-hr" />')
      continue
    }

    const heading = raw.match(/^(#{1,3})\s+(.+)$/)
    if (heading?.[1] && heading[2]) {
      flushParagraph(para, out)
      endList()
      const level = heading[1].length
      out.push(`<h${level} class="md-h md-h${level}">${inlineMarkdown(heading[2])}</h${level}>`)
      continue
    }

    const quote = raw.match(/^>\s?(.*)$/)
    if (quote?.[1] !== undefined) {
      flushParagraph(para, out)
      endList()
      out.push(`<blockquote class="md-quote">${inlineMarkdown(quote[1])}</blockquote>`)
      continue
    }

    const ul = raw.match(/^[-*]\s+(.+)$/)
    if (ul?.[1]) {
      flushParagraph(para, out)
      if (listItems.length && listOrdered) endList()
      listOrdered = false
      listItems.push(ul[1])
      continue
    }

    const ol = raw.match(/^\d+\.\s+(.+)$/)
    if (ol?.[1]) {
      flushParagraph(para, out)
      if (listItems.length && !listOrdered) endList()
      listOrdered = true
      listItems.push(ol[1])
      continue
    }

    endList()
    para.push(raw)
  }

  if (inFence) {
    const code = escapeHtml(fenceBuf.join('\n'))
    out.push(`<pre class="md-pre"><code class="md-codeblock">${code}</code></pre>`)
  }
  flushParagraph(para, out)
  endList()

  return out.join('')
}
