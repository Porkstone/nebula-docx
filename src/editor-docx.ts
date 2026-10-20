import type { JSONContent } from '@tiptap/react'
import { AlignmentType, BorderStyle, Document as WordDocument, ExternalHyperlink, HeadingLevel, ImageRun, LevelFormat, Packer, PageBreak, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import type { IParagraphOptions, ParagraphChild } from 'docx'
import JSZip from 'jszip'
import { validateDocx } from './document'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships'
const XMLNS = 'http://www.w3.org/2000/xmlns/'
const parse = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('The document contains invalid XML and cannot be edited safely.')
  return doc
}
const xml = (node: Node) => new XMLSerializer().serializeToString(node)
const wordElements = (node: Element | globalThis.Document, name: string) => Array.from(node.getElementsByTagNameNS(W, name))
const wordAttribute = (node: Element, name: string) => node.getAttributeNS(W, name) ?? ''

async function imageRun(node: JSONContent) {
  const source = String(node.attrs?.src ?? '')
  if (!/^data:image\/(png|jpeg|gif|webp|bmp|svg\+xml);base64,/i.test(source)) throw new Error('Only embedded images can be saved. Remove externally linked images and try again.')
  const image = new Image(); image.src = source
  await image.decode().catch(() => { throw new Error('An image could not be read. Remove it from the document and try saving again.') })
  if (image.naturalWidth * image.naturalHeight > 25_000_000) throw new Error('An image is too large to save safely (25 megapixels maximum).')
  const scale = Math.min(1, 1600 / image.naturalWidth, 1600 / image.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
  const binary = atob(canvas.toDataURL('image/png').split(',')[1])
  const data = Uint8Array.from(binary, c => c.charCodeAt(0))
  const width = Math.min(Number(node.attrs?.width) || image.naturalWidth, 580)
  const height = width * image.naturalHeight / image.naturalWidth
  return new ImageRun({ type: 'png', data, transformation: { width, height }, altText: { name: 'Image', title: String(node.attrs?.title ?? ''), description: String(node.attrs?.alt ?? '') } })
}

export async function writeEditedDocx(model: JSONContent, original: Uint8Array, filename: string): Promise<Uint8Array> {
  const numbering: { reference: string; levels: { level: number; format: typeof LevelFormat.DECIMAL | typeof LevelFormat.BULLET; text: string; start: number; style: { paragraph: { indent: { left: number; hanging: number } } } }[] }[] = []
  const inline = async (nodes: JSONContent[] = []): Promise<ParagraphChild[]> => {
    const children: ParagraphChild[] = []
    for (const node of nodes) {
      if (node.type === 'hardBreak') { children.push(new TextRun({ break: 1 })); continue }
      if (node.type === 'pageBreak') { children.push(new PageBreak()); continue }
      if (node.type === 'image') { children.push(await imageRun(node)); continue }
      if (node.type !== 'text') continue
      const marks = new Set(node.marks?.map(mark => mark.type))
      const run = new TextRun({ text: node.text ?? '', bold: marks.has('bold'), italics: marks.has('italic'), strike: marks.has('strike'), underline: marks.has('underline') ? {} : undefined, font: marks.has('code') ? 'Consolas' : undefined })
      const link = node.marks?.find(mark => mark.type === 'link')?.attrs?.href
      children.push(typeof link === 'string' && /^(https?:|mailto:|tel:)/i.test(link) ? new ExternalHyperlink({ link, children: [run] }) : run)
    }
    return children
  }
  const blocks = async (nodes: JSONContent[] = [], list?: { reference: string; level: number }): Promise<(Paragraph | Table)[]> => {
    const output: (Paragraph | Table)[] = []
    for (const node of nodes) {
      if (node.type === 'paragraph' || node.type === 'heading' || node.type === 'codeBlock') {
        const heading = node.type === 'heading' ? [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][Number(node.attrs?.level ?? 1) - 1] : undefined
        const alignment = ({ left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED } as const)[node.attrs?.textAlign as 'left']
        const options: IParagraphOptions = { heading, alignment, numbering: list, spacing: { after: 180, line: 276 }, children: await inline(node.content) }
        if (node.type === 'codeBlock') output.push(new Paragraph({ ...options, children: [new TextRun({ text: node.content?.map(child => child.text ?? '').join('') ?? '', font: 'Consolas' })] }))
        else output.push(new Paragraph(options))
      } else if (node.type === 'image') output.push(new Paragraph({ children: [await imageRun(node)] }))
      else if (node.type === 'bulletList' || node.type === 'orderedList') {
        const reference = `nebula-list-${numbering.length + 1}`
        numbering.push({ reference, levels: Array.from({ length: 9 }, (_, level) => ({ level, format: node.type === 'orderedList' ? LevelFormat.DECIMAL : LevelFormat.BULLET, text: node.type === 'orderedList' ? `%${level + 1}.` : '•', start: Number(node.attrs?.start) || 1, style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } } })) })
        for (const item of node.content ?? []) {
          let first = true
          for (const child of item.content ?? []) {
            output.push(...await blocks([child], child.type === 'paragraph' && first ? { reference, level: Math.min(8, (list?.level ?? -1) + 1) } : child.type?.endsWith('List') ? { reference, level: (list?.level ?? -1) + 1 } : undefined))
            first = false
          }
        }
      } else if (node.type === 'table') {
        const rows: TableRow[] = []
        for (const row of node.content ?? []) {
          const cells: TableCell[] = []
          for (const cell of row.content ?? []) {
            const contents = await blocks(cell.content)
            if (!contents.length || contents.at(-1) instanceof Table) contents.push(new Paragraph(''))
            cells.push(new TableCell({ children: contents, columnSpan: Number(cell.attrs?.colspan) || 1, rowSpan: Number(cell.attrs?.rowspan) || 1, shading: cell.type === 'tableHeader' ? { fill: 'E7EEDF' } : undefined, margins: { top: 90, bottom: 90, left: 120, right: 120 } }))
          }
          rows.push(new TableRow({ children: cells, tableHeader: row.content?.every(cell => cell.type === 'tableHeader') }))
        }
        if (rows.length) output.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }))
      } else if (node.type === 'horizontalRule') output.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'A7B59D' } } }))
      else if (node.content) output.push(...await blocks(node.content, list))
    }
    return output
  }
  const children = await blocks(model.content)
  const document = new WordDocument({ creator: 'Nebula DOCX', styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } }, numbering: { config: numbering }, sections: [{ children: children.length ? children : [new Paragraph('')] }] })
  const generated = await JSZip.loadAsync(await Packer.toBlob(document))
  const source = await validateDocx(original, filename)
  await mergeBody(source, generated)
  return source.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

// Preserve original headers, footers, page settings and unrelated parts. Import
// only the edited body and its resources, remapping IDs to avoid collisions.
async function mergeBody(source: JSZip, generated: JSZip) {
  const sourceDoc = parse(await source.file('word/document.xml')!.async('string'))
  const editedDoc = parse(await generated.file('word/document.xml')!.async('string'))
  const body = wordElements(sourceDoc, 'body')[0], editedBody = wordElements(editedDoc, 'body')[0]
  const section = Array.from(body.children).findLast(node => node.localName === 'sectPr')?.cloneNode(true)
  const prefix = `NebulaEdit${crypto.randomUUID().replaceAll('-', '')}_`
  const styles = await mergeStyles(source, generated, prefix)
  const numbers = await mergeNumbering(source, generated, styles)
  remapStylesAndNumbers(editedBody, styles, numbers)
  const relationshipsPath = 'word/_rels/document.xml.rels'
  const relationships = source.file(relationshipsPath) ? parse(await source.file(relationshipsPath)!.async('string')) : parse(`<Relationships xmlns="${PKG}"/>`)
  const newRelationships = parse(await generated.file(relationshipsPath)!.async('string'))
  const ids = new Map<string, string>()
  const originalRelationships = Array.from(relationships.documentElement.children)
  for (const relationship of Array.from(newRelationships.documentElement.children)) {
    const oldId = relationship.getAttribute('Id')!, type = relationship.getAttribute('Type')!, target = relationship.getAttribute('Target')!
    const shared = originalRelationships.find(item => item.getAttribute('Type') === type)
    if (!type.endsWith('/image') && !type.endsWith('/hyperlink') && shared) { ids.set(oldId, shared.getAttribute('Id')!); continue }
    const id = `${prefix}${oldId}`; ids.set(oldId, id); relationship.setAttribute('Id', id)
    if (type.endsWith('/image')) {
      const resolved = target.startsWith('/') ? target.slice(1) : `word/${target}`
      const basename = target.split('/').pop()!
      const mediaPath = `word/media/${prefix}${basename}`
      const image = generated.file(resolved)
      if (!image) throw new Error('An edited image could not be packaged.')
      source.file(mediaPath, await image.async('uint8array'))
      relationship.setAttribute('Target', mediaPath.slice(5))
    } else if (!shared && relationship.getAttribute('TargetMode') !== 'External') {
      const part = `word/${target}`
      if (!source.file(part) && generated.file(part)) source.file(part, await generated.file(part)!.async('uint8array'))
    }
    relationships.documentElement.append(sourceDoc.importNode(relationship, true))
  }
  for (const element of Array.from(editedBody.getElementsByTagName('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      if (attribute.namespaceURI === R && ids.has(attribute.value)) element.setAttributeNS(R, attribute.name, ids.get(attribute.value)!)
    }
  }
  body.replaceChildren(...Array.from(editedBody.childNodes).filter(node => !(node.nodeType === 1 && (node as Element).localName === 'sectPr')).map(node => sourceDoc.importNode(node, true)))
  if (section) body.append(section)
  for (const attribute of Array.from(editedDoc.documentElement.attributes)) {
    if (attribute.namespaceURI === XMLNS && !sourceDoc.documentElement.hasAttribute(attribute.name)) sourceDoc.documentElement.setAttributeNS(XMLNS, attribute.name, attribute.value)
  }
  source.file('word/document.xml', xml(sourceDoc)); source.file(relationshipsPath, xml(relationships))
  const contentTypes = parse(await source.file('[Content_Types].xml')!.async('string'))
  const extraTypes = parse(await generated.file('[Content_Types].xml')!.async('string'))
  for (const type of Array.from(extraTypes.documentElement.children)) {
    const key = type.localName === 'Default' ? 'Extension' : 'PartName'
    if (key === 'PartName' && !source.file(type.getAttribute(key)!.replace(/^\//, ''))) continue
    if (!Array.from(contentTypes.documentElement.children).some(item => item.localName === type.localName && item.getAttribute(key) === type.getAttribute(key))) contentTypes.documentElement.append(contentTypes.importNode(type, true))
  }
  source.file('[Content_Types].xml', xml(contentTypes))
}

function remapStylesAndNumbers(root: Element, styles: Map<string, string>, numbers = new Map<string, string>()) {
  for (const tag of ['pStyle', 'rStyle', 'tblStyle', 'basedOn', 'next', 'link', 'styleLink', 'numStyleLink']) {
    for (const node of wordElements(root, tag)) { const value = wordAttribute(node, 'val'); if (styles.has(value)) node.setAttributeNS(W, 'w:val', styles.get(value)!) }
  }
  for (const node of wordElements(root, 'numId')) { const value = wordAttribute(node, 'val'); if (numbers.has(value)) node.setAttributeNS(W, 'w:val', numbers.get(value)!) }
}
async function mergeStyles(source: JSZip, generated: JSZip, prefix: string) {
  const path = 'word/styles.xml'
  const edited = parse(await generated.file(path)!.async('string'))
  const original = source.file(path) ? parse(await source.file(path)!.async('string')) : parse(`<w:styles xmlns:w="${W}"/>`)
  const styles = new Map<string, string>()
  for (const style of wordElements(edited, 'style')) {
    const old = wordAttribute(style, 'styleId'), id = prefix + old
    styles.set(old, id); style.setAttributeNS(W, 'w:styleId', id); style.removeAttributeNS(W, 'default')
  }
  remapStylesAndNumbers(edited.documentElement, styles)
  for (const style of wordElements(edited, 'style')) original.documentElement.append(original.importNode(style, true))
  source.file(path, xml(original))
  return styles
}
async function mergeNumbering(source: JSZip, generated: JSZip, styles: Map<string, string>) {
  const path = 'word/numbering.xml', numbers = new Map<string, string>()
  if (!generated.file(path)) return numbers
  const edited = parse(await generated.file(path)!.async('string'))
  const original = source.file(path) ? parse(await source.file(path)!.async('string')) : parse(`<w:numbering xmlns:w="${W}"/>`)
  const abstracts = new Map<string, string>()
  let abstractId = Math.max(-1, ...wordElements(original, 'abstractNum').map(node => Number(wordAttribute(node, 'abstractNumId')))) + 1
  let numId = Math.max(0, ...wordElements(original, 'num').map(node => Number(wordAttribute(node, 'numId')))) + 1
  for (const item of wordElements(edited, 'abstractNum')) { const id = String(abstractId++); abstracts.set(wordAttribute(item, 'abstractNumId'), id); item.setAttributeNS(W, 'w:abstractNumId', id) }
  for (const item of wordElements(edited, 'num')) { const id = String(numId++); numbers.set(wordAttribute(item, 'numId'), id); item.setAttributeNS(W, 'w:numId', id) }
  for (const item of wordElements(edited, 'abstractNumId')) { const old = wordAttribute(item, 'val'); if (abstracts.has(old)) item.setAttributeNS(W, 'w:val', abstracts.get(old)!) }
  remapStylesAndNumbers(edited.documentElement, styles, numbers)
  for (const item of Array.from(edited.documentElement.children)) {
    const imported = original.importNode(item, true)
    if (item.localName === 'abstractNum') original.documentElement.insertBefore(imported, wordElements(original, 'num')[0] ?? null)
    else original.documentElement.append(imported)
  }
  source.file(path, xml(original)); return numbers
}
