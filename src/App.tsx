import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, Clipboard, FileText, FolderOpen, Layers, List, LoaderCircle, Maximize2, Minus, Monitor, PanelLeftClose, Plus, Printer, Search, ShieldCheck, Sparkles, X, AlertCircle, FileCode2, Archive, Pencil, Save } from 'lucide-react'
import { MAX_FILE_BYTES, markdownBundle, readDocument } from './document'
import type { DocumentResult } from './document'
import type { OpenedFile, RecentFile } from './native'
import DocumentEditor from './DocumentEditor'
import type { EditorHandle } from './DocumentEditor'
import { getAppearance, setAppearance } from './theme'
import type { Appearance } from './theme'
import { version } from '../package.json'
type ViewMode = 'document' | 'markdown' | 'edit'

export default function App() {
  const [appearance, updateAppearance] = useState<Appearance>(getAppearance)
  const [changingAppearance, setChangingAppearance] = useState(false)
  const [file, setFile] = useState<OpenedFile | null>(null)
  const [result, setResult] = useState<DocumentResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mode, setMode] = useState<ViewMode>('document')
  const [dirty, setDirty] = useState(false)
  const [editorHtml, setEditorHtml] = useState('')
  const [editorStarted, setEditorStarted] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [sidebar, setSidebar] = useState(true)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Range[]>([])
  const [matchIndex, setMatchIndex] = useState(0)
  const [page, setPage] = useState(1)
  const [recent, setRecent] = useState<RecentFile[]>([])
  const [dragging, setDragging] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [showWarnings, setShowWarnings] = useState(false)
  const [frameSize, setFrameSize] = useState({ width: 794, height: 1123 })
  const fileInput = useRef<HTMLInputElement>(null)
  const iframe = useRef<HTMLIFrameElement>(null)
  const workspace = useRef<HTMLDivElement>(null)
  const sequence = useRef(0)
  const actionRef = useRef({ open: () => {}, print: () => {}, save: () => {}, saveDocx: () => {} })
  const editor = useRef<EditorHandle>(null)
  const dirtyRef = useRef(false)
  const sourceFile = useRef<OpenedFile | null>(null)
  const currentBytes = useRef<Uint8Array | null>(null)
  const revision = useRef(0), appliedRevision = useRef(0)

  const openFile = useCallback(async (opened: OpenedFile) => {
    if (dirtyRef.current) {
      const discard = window.nebula ? await window.nebula.confirmDiscard() : window.confirm('Discard unsaved changes and open another document?')
      if (!discard) return
    }
    const ticket = ++sequence.current
    setBusy(true); setError(''); setNotice(''); setExporting(false)
    try {
      const parsed = await readDocument(new Uint8Array(opened.bytes), opened.name)
      if (ticket !== sequence.current) return
      setFile(opened); setResult(parsed); setMode('document'); setPage(1); setQuery(''); setShowWarnings(false)
      sourceFile.current = opened; currentBytes.current = opened.bytes
      revision.current = 0; appliedRevision.current = 0; dirtyRef.current = false
      setDirty(false); setEditorStarted(false); setEditorHtml(parsed.editableHtml); setEditorKey(ticket)
      workspace.current?.scrollTo(0, 0)
      if (window.nebula) setRecent(await window.nebula.recent())
    } catch (err) { if (ticket === sequence.current) setError(err instanceof Error ? err.message : 'Could not open this document.') }
    finally { if (ticket === sequence.current) setBusy(false) }
  }, [])
  const open = useCallback(async () => {
    try {
      if (window.nebula) { const opened = await window.nebula.open(); if (opened) await openFile(opened) }
      else fileInput.current?.click()
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not open the file picker.') }
  }, [openFile])
  const openBrowserFile = async (chosen: File) => {
    if (chosen.size > MAX_FILE_BYTES) { setError('This document exceeds the 40 MB file limit.'); return }
    try { await openFile({ name: chosen.name, bytes: new Uint8Array(await chosen.arrayBuffer()) }) }
    catch { setError('The document could not be read. Please try opening it again.') }
  }
  useEffect(() => {
    const bridge = window.nebula
    if (!bridge) return
    bridge.recent().then(setRecent).catch(() => {})
    const removeOpen = bridge.onOpen(openFile)
    const removeCommand = bridge.onCommand(command => {
      if (command === 'open') actionRef.current.open()
      if (command === 'print') actionRef.current.print()
      if (command === 'exportMarkdown') actionRef.current.save()
      if (command === 'saveDocx') actionRef.current.saveDocx()
    })
    bridge.ready()
    return () => { removeOpen(); removeCommand() }
  }, [openFile])
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(timer) } }, [notice])
  useEffect(() => {
    dirtyRef.current = dirty
    window.nebula?.setDirty(dirty)
    const preventClose = (event: BeforeUnloadEvent) => { if (dirty && !window.nebula) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', preventClose)
    return () => window.removeEventListener('beforeunload', preventClose)
  }, [dirty])

  const ensureCurrent = async () => {
    if (!result || !file || !currentBytes.current) throw new Error('Open a document first.')
    if (revision.current === appliedRevision.current || !editor.current || !sourceFile.current) return { result, bytes: currentBytes.current }
    const model = editor.current.getJSON(), ticket = sequence.current, snapshot = revision.current
    setBusy(true); setError('')
    try {
      const { writeEditedDocx } = await import('./editor-docx')
      const bytes = editor.current.isOriginal() ? new Uint8Array(sourceFile.current.bytes) : await writeEditedDocx(model, new Uint8Array(sourceFile.current.bytes), sourceFile.current.name)
      const updated = await readDocument(bytes, file.name)
      if (ticket !== sequence.current) throw new Error('The document changed while the preview was being prepared.')
      currentBytes.current = bytes; appliedRevision.current = snapshot
      setResult(updated); setPage(1)
      return { result: updated, bytes }
    } finally { setBusy(false) }
  }
  const switchMode = async (next: ViewMode) => {
    if (busy) return
    try {
      if (next === 'edit') setEditorStarted(true)
      else if (result) await ensureCurrent()
      setMode(next); workspace.current?.scrollTo(0, 0)
    } catch (err) { setError(err instanceof Error ? err.message : 'The document could not be updated.') }
  }
  const download = (name: string, bytes: Uint8Array) => {
    const url = URL.createObjectURL(new Blob([bytes.slice().buffer as ArrayBuffer]))
    const link = document.createElement('a'); link.href = url; link.download = name; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const saveDocx = async () => {
    if (!file || busy) return
    try {
      const { bytes } = await ensureCurrent()
      setBusy(true)
      const name = `${file.name.replace(/(?:-edited)?\.docx$/i, '')}-edited.docx`
      if (window.nebula) {
        const saved = await window.nebula.saveDocx(name, bytes)
        if (!saved) return
        setFile(saved); setRecent(await window.nebula.recent())
      } else download(name, bytes)
      editor.current?.markSaved(); dirtyRef.current = false; setDirty(false)
      setNotice('DOCX copy saved successfully.')
    } catch (err) { setError(err instanceof Error ? err.message : 'The DOCX file could not be saved.') }
    finally { setBusy(false) }
  }

  const save = async (bundle = false) => {
    if (!result || !file || busy) return
    setExporting(false)
    try {
      const { result: updated } = await ensureCurrent()
      const base = file.name.replace(/\.docx$/i, '')
      const name = `${base}.${bundle ? 'zip' : 'md'}`
      const bytes = bundle ? await markdownBundle(updated, base) : new TextEncoder().encode(updated.markdown)
      if (window.nebula) { if (await window.nebula.save(name, bytes)) setNotice('Markdown exported successfully.') }
      else {
        download(name, bytes); setNotice('Markdown exported successfully.')
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Export failed.') }
  }
  const print = async () => {
    if (!result || busy) return
    try {
      const { result: updated } = await ensureCurrent()
      if (window.nebula) {
        const response = await window.nebula.print(updated.preview)
        if (!response.success && response.reason && !/cancel/i.test(response.reason)) setError(response.reason)
      } else { setMode('document'); setTimeout(() => iframe.current?.contentWindow?.print(), 150) }
    } catch (err) { setError(err instanceof Error ? err.message : 'Printing failed.') }
  }
  actionRef.current = { open, print, save, saveDocx }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'o') { event.preventDefault(); void open() }
      if (key === 'p') { event.preventDefault(); void print() }
      if (key === 's') { event.preventDefault(); void saveDocx() }
      if (key === 'm' && event.shiftKey) { event.preventDefault(); void save() }
      if (key === 'f') { event.preventDefault(); void switchMode('document').then(() => document.getElementById('document-search')?.focus()) }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  })
  const searchDocument = useCallback(() => {
    const doc = iframe.current?.contentDocument
    if (!doc?.body) return
    const found: Range[] = []
    if (query.trim()) {
      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, { acceptNode: node => node.parentElement?.closest('style,script') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT })
      let node: Node | null
      while ((node = walker.nextNode())) {
        const text = (node.textContent ?? '').toLocaleLowerCase(), needle = query.toLocaleLowerCase()
        let index = text.indexOf(needle)
        while (index !== -1 && found.length < 2000) {
          const range = doc.createRange(); range.setStart(node, index); range.setEnd(node, index + needle.length); found.push(range)
          index = text.indexOf(needle, index + needle.length)
        }
      }
    }
    const frameWindow = iframe.current!.contentWindow as unknown as { Highlight?: new (...ranges: Range[]) => unknown; CSS?: { highlights: Map<string, unknown> } }
    if (frameWindow.Highlight && frameWindow.CSS?.highlights) frameWindow.CSS.highlights.set('nebula-search', new frameWindow.Highlight(...found))
    setMatches(found); setMatchIndex(0)
  }, [query])
  useEffect(() => { searchDocument() }, [searchDocument, result, mode])
  const scrollToElement = (element: Element | null | undefined) => {
    if (!element || !workspace.current) return
    workspace.current.scrollTo({ top: element.getBoundingClientRect().top * zoom / 100, behavior: 'smooth' })
  }
  const goToMatch = (index: number) => {
    if (!matches.length) return
    const next = (index + matches.length) % matches.length; setMatchIndex(next)
    scrollToElement(matches[next].startContainer.parentElement)
  }
  const goToPage = (next: number) => {
    const pages = iframe.current?.contentDocument?.querySelectorAll('section.docx')
    const bounded = Math.max(1, Math.min(next, result?.pages ?? 1)); setPage(bounded)
    scrollToElement(pages?.[bounded - 1])
  }
  const frameLoaded = () => {
    const doc = iframe.current?.contentDocument
    if (doc) {
      const width = Math.ceil(doc.querySelector('section.docx')?.getBoundingClientRect().width ?? 794)
      setFrameSize({ width: Math.max(width, 794), height: doc.documentElement.scrollHeight + 24 }); searchDocument()
    }
  }
  const fit = () => setZoom(Math.max(25, Math.min(200, Math.floor(((workspace.current?.clientWidth ?? 900) - 96) / frameSize.width * 100))))

  return <div className="app" onDragOver={event => { if (!Array.from(event.dataTransfer.types).includes('Files')) return; event.preventDefault(); setDragging(true) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={async event => {
    if (!event.dataTransfer.files.length) return
    event.preventDefault(); setDragging(false)
    const dropped = event.dataTransfer.files[0]
    if (dropped) await openBrowserFile(dropped)
  }}>
    <input ref={fileInput} className="hidden" type="file" accept=".docx" aria-label="Choose DOCX file" onChange={async event => {
      const chosen = event.target.files?.[0]
      if (chosen) await openBrowserFile(chosen)
      event.target.value = ''
    }} />
    <header className="topbar"><div className="brand"><span className="brand-icon"><Layers size={23} strokeWidth={1.6} /></span><span>nebula<span className="brand-docx">DOCX</span></span></div><div className="topbar-center"><span className="tiny-dot" /> Your documents, in a clearer light.</div><div className="topbar-settings"><span className="offline"><ShieldCheck size={16} /> Files stay on this device</span><label className="appearance-control"><Monitor size={16} /><span className="sr-only">Appearance</span><select aria-label="Appearance" value={appearance} disabled={changingAppearance} onChange={async event => {
      const next = event.target.value as Appearance
      setChangingAppearance(true)
      try { await setAppearance(next); updateAppearance(next) }
      catch { setError('Could not save appearance. Please try again.') }
      finally { setChangingAppearance(false) }
    }}><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label></div></header>
    <div className="app-body">
      {sidebar && <aside className="sidebar">
        <div className="sidebar-label">WORKSPACE<button className="icon-button" title="Hide sidebar" aria-label="Hide sidebar" onClick={() => setSidebar(false)}><PanelLeftClose size={16} /></button></div>
        <button className="nav-item active" onClick={() => void switchMode('document')}><BookOpen size={17} /> Document viewer<span className="nav-dot" /></button>
        <button className="open-sidebar" onClick={open}><Plus size={17} /> Open document<span className="shortcut">Ctrl O</span></button>
        {result && <div className="document-outline"><div className="sidebar-label"><span>IN THIS DOCUMENT</span><List size={14} /></div>{result.headings.length ? result.headings.map((heading, index) => <button key={index} style={{ paddingLeft: 14 + (heading.level - 1) * 10 }} onClick={async () => {
          await switchMode('document')
          setTimeout(() => scrollToElement(Array.from(iframe.current?.contentDocument?.querySelectorAll('h1,h2,h3,h4,h5,h6,p') ?? []).find(el => el.textContent?.trim() === heading.text.trim())), 50)
        }}>{heading.text}</button>) : <p className="sidebar-hint">No headings in this document.</p>}</div>}
        <div className="recent"><div className="sidebar-label">RECENT DOCUMENTS<span>{recent.length.toString().padStart(2, '0')}</span></div>{recent.length ? recent.map(item => <button className="recent-file" key={item.id} title={item.name} onClick={async () => {
          try { if (window.nebula) await openFile(await window.nebula.openRecent(item.id)) } catch (err) { setError(err instanceof Error ? err.message : 'File is no longer available.') }
        }}><FileText size={17} /><span>{item.name}<small>{new Date(item.openedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span></button>) : <p className="sidebar-hint">Your next good read starts here.<br />Open a document to get started.</p>}</div>
        <div className="sidebar-bottom"><span className="mini-logo"><Sparkles size={16} /></span><p>A little space for your words.<small>Nebula DOCX · v{version}</small></p></div>
      </aside>}
      <main className="main">
        <div className="document-bar"><div className="document-title">{!sidebar && <button className="icon-button" aria-label="Show sidebar" onClick={() => setSidebar(true)}><List size={18} /></button>}<span className="file-badge"><FileText size={19} /></span><div><h1>{file ? file.name : 'Document workspace'}</h1>{dirty && <span className="unsaved-indicator">Unsaved changes</span>}<p>{file ? `${(file.bytes.byteLength / 1024).toFixed(1)} KB · Microsoft Word document` : 'A fresh perspective on your documents'}</p></div></div>
          <div className="document-actions"><button className="button" onClick={open}><FolderOpen size={16} /> Open file</button><button className={`button ${mode === 'edit' ? 'primary' : ''}`} onClick={saveDocx} disabled={!result || busy}><Save size={16} /> Save DOCX</button><button className="button" onClick={print} disabled={!result || busy}><Printer size={16} /> Print</button><div className="export-wrap"><button className={`button ${result && mode !== 'edit' ? 'primary' : ''}`} disabled={!result || busy} aria-expanded={exporting} onClick={() => setExporting(!exporting)}><ArrowDownToLine size={16} /> Export Markdown<ChevronDown size={14} /></button>{exporting && <><button className="menu-backdrop" aria-label="Close export menu" onClick={() => setExporting(false)} /><div className="export-menu"><button onClick={() => save()}><FileCode2 size={17} /><span>Markdown file<small>.md with embedded images</small></span></button><button onClick={() => save(true)}><Archive size={17} /><span>Markdown + images<small>.zip with a separate images folder</small></span></button></div></>}</div></div>
        </div>
        <div className="toolbar"><div className="view-tabs"><button className={mode === 'document' ? 'selected' : ''} onClick={() => void switchMode('document')}><BookOpen size={15} /> Document</button><button disabled={!result} className={mode === 'markdown' ? 'selected' : ''} onClick={() => void switchMode('markdown')}><FileCode2 size={15} /> Markdown</button><button disabled={!result || busy} className={mode === 'edit' ? 'selected' : ''} aria-pressed={mode === 'edit'} onClick={() => void switchMode('edit')}><Pencil size={15} /> Edit document</button></div>{result && mode !== 'edit' && <div className="tools"><div className="search-box"><Search size={14} /><input id="document-search" placeholder="Find in document" value={query} onChange={event => { setQuery(event.target.value); setMode('document') }} onKeyDown={event => { if (event.key === 'Enter') goToMatch(matchIndex + (event.shiftKey ? -1 : 1)); if (event.key === 'Escape') setQuery('') }} />{query && <><span>{matches.length ? `${matchIndex + 1}/${matches.length}` : '0'}</span><button className="icon-button" aria-label="Next search result" onClick={() => goToMatch(matchIndex + 1)}><ChevronDown size={13} /></button></>}</div><span className="divider" /><button className="icon-button" disabled={zoom <= 25} aria-label="Zoom out" onClick={() => setZoom(Math.max(25, zoom - 10))}><Minus size={15} /></button><span className="zoom">{zoom}%</span><button className="icon-button" disabled={zoom >= 200} aria-label="Zoom in" onClick={() => setZoom(Math.min(200, zoom + 10))}><Plus size={15} /></button><button className="icon-button" title="Fit to width" aria-label="Fit to width" onClick={fit}><Maximize2 size={15} /></button></div>}</div>
        {error && <div className="message error" role="alert"><AlertCircle size={17} /><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={15} /></button></div>}
        {result?.warnings.length ? <div className="warnings"><button onClick={() => setShowWarnings(!showWarnings)}><AlertCircle size={14} /> {result.warnings.length} conversion {result.warnings.length === 1 ? 'note' : 'notes'}<ChevronDown size={13} /></button>{showWarnings && <ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}</div> : null}
        <div className={`workspace ${!result ? 'empty-workspace' : ''} ${mode === 'edit' ? 'editing-workspace' : ''}`} ref={workspace} onScroll={() => {
          if (!result || mode !== 'document') return
          const pages = iframe.current?.contentDocument?.querySelectorAll('section.docx')
          if (pages) { let current = 1; pages.forEach((item, index) => { if (item.getBoundingClientRect().top * zoom / 100 <= (workspace.current?.scrollTop ?? 0) + 150) current = index + 1 }); setPage(current) }
        }}>
          {!result && !busy && <div className="welcome"><div className="eyebrow"><span /> YOUR DOCUMENT WORKSPACE</div><h2>Good documents deserve<br />a <em>clearer view.</em></h2><p>Read, edit and print your Word documents.<br />Export Markdown when you need a different format.</p><button className="drop-zone" onClick={open}><span className="document-illustration"><span className="illustration-back" /><span className="illustration-paper"><FileText size={39} strokeWidth={1.1} /><span className="docx-tag">DOCX</span></span><span className="illustration-plus"><Plus size={19} /></span></span><strong>Drop a document here</strong><span>or <u>browse your files</u> to get started</span><small>.docx files · up to 40 MB</small></button><div className="welcome-features"><span><BookOpen size={16} /> Preview</span><span><Pencil size={16} /> Edit</span><span><Printer size={16} /> Print</span><span><FileCode2 size={16} /> Markdown</span></div><div className="privacy-note"><ShieldCheck size={15} /> Files stay on this device. No uploads or accounts.</div></div>}
          {result && editorStarted && <DocumentEditor key={editorKey} ref={editor} html={editorHtml} active={mode === 'edit'} disabled={busy} onError={setError} onUpdate={changed => { revision.current++; dirtyRef.current = changed; setDirty(changed) }} />}
          {result && mode === 'document' && <div className="page-stage" style={{ width: frameSize.width * zoom / 100, height: frameSize.height * zoom / 100 }}><iframe ref={iframe} title="Document preview" sandbox="allow-same-origin allow-modals" srcDoc={result.preview} onLoad={frameLoaded} style={{ width: frameSize.width, height: frameSize.height, transform: `scale(${zoom / 100})` }} /></div>}
          {result && mode === 'markdown' && <div className="markdown-panel"><div className="markdown-heading"><span><FileCode2 size={17} /> MARKDOWN SOURCE</span><button className="button" onClick={async () => { try { if (window.nebula) await window.nebula.copy(result.markdown); else await navigator.clipboard.writeText(result.markdown); setNotice('Markdown copied to clipboard.') } catch { setError('Clipboard access failed. Use Export Markdown to save a file.') } }}><Clipboard size={14} /> Copy</button></div><pre><code>{result.markdown}</code></pre></div>}
          {busy && <div className="loading" role="status"><LoaderCircle size={28} className="spin" /><strong>Preparing your document…</strong><span>Preparing the preview and Markdown, right here.</span></div>}
        </div>
        <footer className="statusbar"><div><span className="status-dot" /> {busy ? 'Preparing document' : mode === 'edit' ? (dirty ? 'Editing · unsaved changes' : 'Editing document') : result ? 'Ready to read' : 'Ready when you are'}{result && <><span className="status-separator">/</span>{result.words.toLocaleString()} words<span className="status-separator">/</span>{result.images.length} images</>}</div>{result ? <div className="page-controls"><button className="icon-button" disabled={page <= 1 || mode !== 'document'} aria-label="Previous page" onClick={() => goToPage(page - 1)}><ArrowLeft size={13} /></button><span>Page {page} of {result.pages}</span><button className="icon-button" disabled={page >= result.pages || mode !== 'document'} aria-label="Next page" onClick={() => goToPage(page + 1)}><ArrowRight size={13} /></button></div> : <span>DOCX · Offline workspace</span>}</footer>
      </main>
    </div>
    {dragging && <div className="drag-overlay"><FolderOpen size={48} /><h2>Drop to open your document</h2><p>Your files stay on this device.</p></div>}
    {notice && <div className="toast" role="status"><Check size={16} />{notice}</div>}
  </div>
}
