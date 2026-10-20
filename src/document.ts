import JSZip from 'jszip'
import mammoth from 'mammoth/mammoth.browser'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import DOMPurify from 'dompurify'
import { renderAsync } from 'docx-preview'

export const MAX_FILE_BYTES = 40 * 1024 * 1024
export interface DocumentResult {
  preview: string; markdown: string; bundleMarkdown: string; editableHtml: string
  images: { name: string; base64: string }[]
  headings: { text: string; level: number }[]
  words: number; pages: number; warnings: string[]
}
export async function validateDocx(bytes: Uint8Array, name: string) {
  if (!/\.docx$/i.test(name)) throw new Error('Please choose a .docx file. Legacy .doc and password-protected documents are not supported.')
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('This document exceeds the 40 MB file limit.')
  let archive: JSZip
  try { archive = await JSZip.loadAsync(bytes) } catch { throw new Error('This file is damaged, encrypted, or is not a valid DOCX document.') }
  const entries = Object.values(archive.files)
  if (entries.length > 3000) throw new Error('This document contains too many archive entries to open safely.')
  const expanded = entries.reduce((sum, file) => sum + ((file as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0)
  if (expanded > 120 * 1024 * 1024) throw new Error('This document expands beyond the 120 MB safety limit.')
  if (!archive.file('[Content_Types].xml') || !archive.file('word/document.xml')) throw new Error('This archive does not contain a Word document.')
  return archive
}
const documentStyles = `html,body{margin:0;padding:0;background:transparent;color:#182326}.docx-wrapper{background:transparent!important;padding:0!important}.docx-wrapper>section.docx{box-shadow:0 2px 10px #18332b0d!important;margin:0 auto 24px!important}img{max-width:100%}a{pointer-events:none}::highlight(nebula-search){background:#fce09c;color:#172d28}@media print{html,body,.docx-wrapper{margin:0!important;padding:0!important;background:white!important}.docx-wrapper>section.docx{box-shadow:none!important;margin:0!important;break-after:page}.docx-wrapper>section.docx:last-child{break-after:auto}@page{margin:0}}`
export function previewShell(content: string) {
  return `<!doctype html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><style>${documentStyles}</style></head><body>${content}</body></html>`
}
export async function readDocument(bytes: Uint8Array, name: string): Promise<DocumentResult> {
  const archive = await validateDocx(bytes, name)
  const container = document.createElement('div')
  const buffer = bytes.slice().buffer as ArrayBuffer
  const [conversion] = await Promise.all([
    mammoth.convertToHtml({ arrayBuffer: buffer }, { externalFileAccess: false, styleMap: ["p[style-name='Title'] => h1:fresh", "br[type='page'] => br.nebula-page-break"] }),
    renderAsync(buffer.slice(0), container, undefined, { className: 'docx', inWrapper: true, breakPages: true, useBase64URL: true, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true, ignoreLastRenderedPageBreak: false, renderComments: false, renderAltChunks: false }),
  ])
  const pageRules: string[] = []
  container.querySelectorAll<HTMLElement>('section.docx').forEach((section, index) => {
    const width = section.style.width, height = section.style.minHeight
    if (/^[\d.]+pt$/.test(width) && /^[\d.]+pt$/.test(height)) {
      const name = `nebula-page-${index + 1}`
      section.style.page = name
      if (index === 0) pageRules.push(`@page{size:${width} ${height};margin:0}`)
      pageRules.push(`@page ${name}{size:${width} ${height};margin:0}`)
    }
  })
  const printStyles = document.createElement('style'); printStyles.textContent = pageRules.join('\n'); container.append(printStyles)
  const preview = DOMPurify.sanitize(container.innerHTML, { FORCE_BODY: true, ADD_TAGS: ['style'], ADD_ATTR: ['style'], FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'base'] })
  const content = new DOMParser().parseFromString(DOMPurify.sanitize(conversion.value), 'text/html')
  // GFM requires a header row. Word often stores its first row as ordinary cells.
  content.querySelectorAll('table').forEach(table => {
    const row = table.querySelector('tr')
    row?.querySelectorAll('td').forEach(cell => {
      const header = content.createElement('th'); header.innerHTML = cell.innerHTML; cell.replaceWith(header)
    })
  })
  const editableHtml = content.body.innerHTML
  const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-', emDelimiter: '*' })
  converter.use(gfm)
  converter.addRule('wordTableCell', {
    filter: ['th', 'td'],
    replacement: (value, node) => `${node.previousSibling ? ' ' : '| '}${value.trim().replace(/\|/g, '\\|').replace(/\n+/g, '<br>')} |`,
  })
  const markdown = converter.turndown(content.body.innerHTML) + '\n'
  const images: DocumentResult['images'] = []
  content.querySelectorAll('img').forEach((img, index) => {
    const match = /^data:image\/(png|jpeg|gif|webp|bmp|svg\+xml);base64,([\s\S]+)$/.exec(img.src)
    if (!match) { img.remove(); return }
    const extension = match[1] === 'jpeg' ? 'jpg' : match[1] === 'svg+xml' ? 'svg' : match[1]
    const imageName = `images/image-${String(index + 1).padStart(3, '0')}.${extension}`
    images.push({ name: imageName, base64: match[2] }); img.setAttribute('src', imageName)
    if (!img.alt) img.alt = `Document image ${index + 1}`
  })
  const text = content.body.textContent ?? ''
  const headings = Array.from(content.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => ({ text: h.textContent ?? '', level: Number(h.tagName[1]) }))
  const warnings = [...new Set(conversion.messages.map(message => message.message))]
  const xml = await archive.file('word/document.xml')!.async('string')
  if (/<w:(?:drawing|pict)[\s>]/.test(xml)) warnings.push('Images are included where supported. Floating shapes, charts and text boxes may differ from Word.')
  return { preview: previewShell(preview), editableHtml, markdown, bundleMarkdown: converter.turndown(content.body.innerHTML) + '\n', images, headings, words: text.trim() ? text.trim().split(/\s+/u).length : 0, pages: container.querySelectorAll('section.docx').length || 1, warnings }
}
export async function markdownBundle(result: DocumentResult, basename: string) {
  const zip = new JSZip(); zip.file(`${basename}.md`, result.bundleMarkdown)
  for (const image of result.images) zip.file(image.name, image.base64, { base64: true })
  return zip.generateAsync({ type: 'uint8array' })
}
