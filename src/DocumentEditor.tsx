import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/react'
import { Node } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import ImageExtension from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import DOMPurify from 'dompurify'
import { AlignCenter, AlignLeft, AlignRight, Bold, ImagePlus, Italic, Link, List, ListOrdered, Redo2, ScissorsLineDashed, Table2, Underline, Undo2, Unlink, Plus, Minus } from 'lucide-react'

const PageBreakNode = Node.create({
  name: 'pageBreak', priority: 1000, group: 'inline', inline: true, atom: true,
  parseHTML: () => [{ tag: 'br.nebula-page-break' }, { tag: 'span[data-page-break]' }],
  renderHTML: () => ['span', { 'data-page-break': 'true', contenteditable: 'false', class: 'editor-page-break' }, 'Page break'],
})
const InlineImage = ImageExtension.configure({ inline: true, allowBase64: true })

export interface EditorHandle { getJSON: () => JSONContent; isOriginal: () => boolean; markSaved: () => void }
interface Props { html: string; active: boolean; disabled: boolean; onUpdate: (dirty: boolean) => void; onError: (error: string) => void }
export default forwardRef<EditorHandle, Props>(function DocumentEditor({ html, active, disabled, onUpdate, onError }, ref) {
  const saved = useRef('')
  const original = useRef('')
  const [, render] = useState(0)
  const [showLink, setShowLink] = useState(false)
  const [link, setLink] = useState('')
  const imageInput = useRef<HTMLInputElement>(null)
  const callback = useRef(onUpdate); callback.current = onUpdate
  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: false } }), TableKit.configure({ table: { resizable: false } }), InlineImage, TextAlign.configure({ types: ['heading', 'paragraph'] }), PageBreakNode],
    content: html,
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': 'Document editor', 'aria-multiline': 'true', spellcheck: 'true' },
      transformPastedHTML: source => {
        const clean = new DOMParser().parseFromString(DOMPurify.sanitize(source), 'text/html')
        clean.querySelectorAll('img').forEach(img => { if (!/^data:image\//i.test(img.getAttribute('src') ?? '')) img.remove() })
        return clean.body.innerHTML
      },
    },
    onCreate: ({ editor: instance }) => { original.current = saved.current = JSON.stringify(instance.getJSON()); render(value => value + 1) },
    onUpdate: ({ editor: instance }) => { callback.current(JSON.stringify(instance.getJSON()) !== saved.current); render(value => value + 1) },
    onSelectionUpdate: () => render(value => value + 1),
  })
  useEffect(() => { editor?.setEditable(active && !disabled, false) }, [editor, active, disabled])
  useImperativeHandle(ref, () => ({ getJSON: () => editor?.getJSON() ?? { type: 'doc', content: [] }, isOriginal: () => !!editor && JSON.stringify(editor.getJSON()) === original.current, markSaved: () => { if (editor) saved.current = JSON.stringify(editor.getJSON()) } }), [editor])
  if (!editor) return null
  const tool = (name: string, icon: React.ReactNode, run: () => unknown, selected = false, unavailable = false) => <button type="button" className={`editor-tool ${selected ? 'is-active' : ''}`} title={name} aria-label={name} aria-pressed={selected} disabled={disabled || unavailable} onMouseDown={event => event.preventDefault()} onClick={() => { run(); render(value => value + 1) }}>{icon}</button>
  const applyLink = () => {
    if (!link.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else if (/^(https?:\/\/|mailto:|tel:)/i.test(link.trim())) editor.chain().focus().extendMarkRange('link').setLink({ href: link.trim() }).run()
    else { onError('Use a link beginning with https://, http://, mailto: or tel:.'); return }
    setShowLink(false)
  }
  return <section className="editor-container" hidden={!active} aria-label="Edit mode">
    <div className="editor-toolbar" role="toolbar" aria-label="Text formatting">
      {tool('Undo', <Undo2 size={16} />, () => editor.chain().focus().undo().run(), false, !editor.can().undo())}
      {tool('Redo', <Redo2 size={16} />, () => editor.chain().focus().redo().run(), false, !editor.can().redo())}
      <span className="divider" />
      <select aria-label="Paragraph style" disabled={disabled} value={editor.isActive('heading') ? String(editor.getAttributes('heading').level) : 'paragraph'} onChange={event => { const value = event.target.value; if (value === 'paragraph') editor.chain().focus().setParagraph().run(); else editor.chain().focus().setHeading({ level: Number(value) as 1 | 2 | 3 }).run(); render(current => current + 1) }}><option value="paragraph">Normal text</option>{[1,2,3,4,5,6].map(level => <option key={level} value={level}>Heading {level}</option>)}</select>
      <span className="divider" />
      {tool('Bold', <Bold size={16} />, () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
      {tool('Italic', <Italic size={16} />, () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
      {tool('Underline', <Underline size={16} />, () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'))}
      <span className="divider" />
      {tool('Align left', <AlignLeft size={16} />, () => editor.chain().focus().setTextAlign('left').run(), editor.isActive({ textAlign: 'left' }))}
      {tool('Align center', <AlignCenter size={16} />, () => editor.chain().focus().setTextAlign('center').run(), editor.isActive({ textAlign: 'center' }))}
      {tool('Align right', <AlignRight size={16} />, () => editor.chain().focus().setTextAlign('right').run(), editor.isActive({ textAlign: 'right' }))}
      <span className="divider" />
      {tool('Bullet list', <List size={16} />, () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
      {tool('Numbered list', <ListOrdered size={16} />, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
      {tool('Insert link', <Link size={16} />, () => { setLink(editor.getAttributes('link').href ?? ''); setShowLink(!showLink) }, editor.isActive('link'))}
      {tool('Remove link', <Unlink size={16} />, () => editor.chain().focus().unsetLink().run(), false, !editor.isActive('link'))}
      {tool('Insert image', <ImagePlus size={16} />, () => imageInput.current?.click())}
      {tool('Insert table', <Table2 size={16} />, () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}
      {tool('Insert page break', <ScissorsLineDashed size={16} />, () => editor.chain().focus().insertContent({ type: 'pageBreak' }).run())}
      {editor.isActive('table') && <div className="table-actions"><span>Table</span>{tool('Add row', <><Plus size={13} /> Row</>, () => editor.chain().focus().addRowAfter().run())}{tool('Add column', <><Plus size={13} /> Column</>, () => editor.chain().focus().addColumnAfter().run())}{tool('Delete row', <><Minus size={13} /> Row</>, () => editor.chain().focus().deleteRow().run())}{tool('Delete table', <><Minus size={13} /> Table</>, () => editor.chain().focus().deleteTable().run())}</div>}
    </div>
    {showLink && <form className="editor-link-form" onSubmit={event => { event.preventDefault(); applyLink() }}><label htmlFor="edit-link">Link URL</label><input autoFocus id="edit-link" value={link} placeholder="https://example.com" onChange={event => setLink(event.target.value)} /><button type="submit" className="button">Apply link</button><button type="button" className="button" onClick={() => setShowLink(false)}>Cancel</button></form>}
    <p className="editor-note">Edit text, formatting, lists, tables and images. Advanced Word body layouts may be simplified; Save DOCX creates a copy by default.</p>
    <div className="editor-sheet"><EditorContent editor={editor} /></div>
    <input className="hidden" ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp,image/bmp" aria-label="Choose image" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''
      if (!file) return
      if (file.size > 10 * 1024 * 1024) { onError('Choose an image smaller than 10 MB.'); return }
      const reader = new FileReader()
      reader.onload = () => editor.chain().focus().setImage({ src: String(reader.result), alt: file.name }).run()
      reader.onerror = () => onError('The image could not be read.')
      reader.readAsDataURL(file)
    }} />
  </section>
})
