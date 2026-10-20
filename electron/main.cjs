const { app, BrowserWindow, Menu, dialog, ipcMain, session, clipboard, nativeTheme } = require('electron')
const { readFile, writeFile, stat, mkdir, mkdtemp, rm, rename } = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { createHash, randomUUID } = require('node:crypto')
const os = require('node:os')

app.setName('Nebula DOCX')
if (process.env.NEBULA_USER_DATA) app.setPath('userData', process.env.NEBULA_USER_DATA)
app.enableSandbox()
const development = !app.isPackaged && process.argv.includes('--dev')
const devURL = 'http://127.0.0.1:5173'
const rendererPath = path.join(__dirname, '../dist/index.html')
let mainWindow, rendererReady = false, queuedPath, printing = false
let documentDirty = false, confirmingClose = false
const MAX_BYTES = 40 * 1024 * 1024
const historyPath = () => path.join(app.getPath('userData'), 'recent-files.json')
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json')
let appearance = 'system'
const validAppearance = value => ['light', 'dark', 'system'].includes(value)
async function loadAppearance() {
  try {
    const settings = JSON.parse(await readFile(settingsPath(), 'utf8'))
    if (validAppearance(settings.appearance)) appearance = settings.appearance
  } catch { /* A missing or damaged preference uses the system appearance. */ }
  nativeTheme.themeSource = appearance
}
async function history() {
  try { const value = JSON.parse(await readFile(historyPath(), 'utf8')); return Array.isArray(value) ? value.filter(item => typeof item.path === 'string' && typeof item.id === 'string').slice(0, 8) : [] } catch { return [] }
}
async function openDocument(filename) {
  if (typeof filename !== 'string' || path.extname(filename).toLowerCase() !== '.docx') throw new Error('Please choose a DOCX document.')
  const resolved = path.resolve(filename)
  const info = await stat(resolved).catch(() => { throw new Error('This file is no longer available. It may have been moved or deleted.') })
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('Choose a DOCX file smaller than 40 MB.')
  const bytes = await readFile(resolved)
  if (bytes.length > MAX_BYTES) throw new Error('This file exceeds the 40 MB limit.')
  const id = createHash('sha256').update(resolved).digest('hex').slice(0, 20)
  const entry = { id, path: resolved, name: path.basename(resolved), openedAt: new Date().toISOString() }
  const entries = [entry, ...(await history()).filter(item => item.id !== id)].slice(0, 8)
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(historyPath(), JSON.stringify(entries, null, 2))
  return { id, name: entry.name, bytes: new Uint8Array(bytes) }
}
function trusted(event) {
  const frame = event.senderFrame
  return !!mainWindow && event.sender === mainWindow.webContents && frame === mainWindow.webContents.mainFrame && (development ? frame.url.startsWith(devURL + '/') : frame.url === pathToFileURL(rendererPath).href)
}
function handle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => { if (!trusted(event)) throw new Error('Untrusted request'); return handler(...args) })
}
function harden(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', event => event.preventDefault())
  window.webContents.on('will-attach-webview', event => event.preventDefault())
}
async function printDocument(html) {
  if (printing) return { success: false, reason: 'A print dialog is already open.' }
  if (typeof html !== 'string' || Buffer.byteLength(html) > 180 * 1024 * 1024) throw new Error('The document is too large to print.')
  printing = true
  let directory, printWindow
  try {
    directory = await mkdtemp(path.join(os.tmpdir(), 'nebula-print-'))
    const target = path.join(directory, 'document.html')
    // A second CSP enforced before supplied markup prevents scripts and external resources even if IPC is misused.
    const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">`
    await writeFile(target, policy + html, 'utf8')
    printWindow = new BrowserWindow({ show: false, parent: mainWindow, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } })
    harden(printWindow)
    await printWindow.loadFile(target)
    const dimensions = html.match(/@page\s*\{\s*size:\s*([\d.]+)pt\s+([\d.]+)pt/)
    const pageSize = dimensions && dimensions.slice(1).every(value => Number(value) >= 72 && Number(value) <= 1800)
      ? { width: Math.round(Number(dimensions[1]) * 25400 / 72), height: Math.round(Number(dimensions[2]) * 25400 / 72) } : 'A4'
    return await new Promise(resolve => printWindow.webContents.print({ silent: false, printBackground: true, margins: { marginType: 'none' }, pageSize, usePrinterDefaultPageSize: false }, (success, reason) => resolve({ success, reason })))
  } finally {
    printWindow?.destroy()
    if (directory) await rm(directory, { recursive: true, force: true })
    printing = false
  }
}
function command(name) { mainWindow?.webContents.send('app:command', name) }
function createWindow() {
  rendererReady = false
  mainWindow = new BrowserWindow({ width: 1360, height: 940, minWidth: 900, minHeight: 650, title: 'Nebula DOCX', backgroundColor: nativeTheme.shouldUseDarkColors ? '#040E12' : '#F4F8F9', icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(__dirname, '../build/icon.ico'), show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true } })
  harden(mainWindow)
  mainWindow.once('ready-to-show', () => { if (rendererReady) mainWindow.show() })
  mainWindow.on('closed', () => { mainWindow = null; rendererReady = false })
  mainWindow.on('close', event => {
    if (!documentDirty) return
    event.preventDefault()
    if (confirmingClose) return
    confirmingClose = true
    dialog.showMessageBox(mainWindow, { type: 'question', title: 'Unsaved changes', message: 'Close without saving your document?', detail: 'Use Save DOCX to save a copy before closing.', buttons: ['Keep editing', 'Discard changes'], defaultId: 0, cancelId: 0, noLink: true }).then(({ response }) => {
      confirmingClose = false
      if (response === 1 && mainWindow) { documentDirty = false; mainWindow.close() }
    }).catch(() => { confirmingClose = false })
  })
  if (development) mainWindow.loadURL(devURL)
  else mainWindow.loadFile(rendererPath)
}
async function dispatchFile(filename) {
  if (!rendererReady || !mainWindow) { queuedPath = filename; return }
  try { mainWindow.webContents.send('document:opened', await openDocument(filename)) } catch (error) { await dialog.showMessageBox(mainWindow, { type: 'error', title: 'Unable to open document', message: error.message }) }
}
function docxArgument(args) { return args.find(arg => typeof arg === 'string' && !arg.startsWith('--') && /\.docx$/i.test(arg)) }
const lock = app.requestSingleInstanceLock()
if (!lock) app.quit()
else {
  queuedPath = docxArgument(process.argv.slice(1))
  app.on('second-instance', (_event, args) => { if (mainWindow?.isMinimized()) mainWindow.restore(); mainWindow?.focus(); const filename = docxArgument(args); if (filename) void dispatchFile(filename) })
  app.on('open-file', (event, filename) => { event.preventDefault(); void dispatchFile(filename) })
  app.whenReady().then(async () => {
    await loadAppearance()
    nativeTheme.on('updated', () => mainWindow?.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#040E12' : '#F4F8F9'))
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))
    session.defaultSession.setPermissionCheckHandler(() => false)
    session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url)
      const localDev = development && ['http:', 'ws:'].includes(url.protocol) && url.hostname === '127.0.0.1' && url.port === '5173'
      callback({ cancel: !localDev && !['file:', 'data:', 'blob:', 'about:', 'devtools:'].includes(url.protocol) })
    })
    handle('appearance:get', () => appearance)
    handle('appearance:set', async value => {
      if (!validAppearance(value)) throw new Error('Choose Light, Dark or System appearance.')
      await mkdir(app.getPath('userData'), { recursive: true })
      await writeFile(settingsPath(), JSON.stringify({ appearance: value }, null, 2))
      appearance = value
      nativeTheme.themeSource = value
    })
    handle('document:open', async () => { const result = await dialog.showOpenDialog(mainWindow, { title: 'Open Word document', filters: [{ name: 'Word documents', extensions: ['docx'] }], properties: ['openFile'] }); return result.canceled ? null : openDocument(result.filePaths[0]) })
    handle('document:recent', async () => (await history()).map(({ id, name, openedAt }) => ({ id, name, openedAt })))
    handle('document:open-recent', async id => { const item = (await history()).find(entry => entry.id === id); if (!item) throw new Error('Document is no longer in recent files.'); return openDocument(item.path) })
    handle('document:save', async (name, bytes) => {
      if (typeof name !== 'string' || !/\.(md|zip)$/i.test(name) || !(bytes instanceof Uint8Array) || bytes.length > 180 * 1024 * 1024) throw new Error('Invalid export request.')
      const extension = path.extname(name).slice(1)
      const result = await dialog.showSaveDialog(mainWindow, { title: 'Export Markdown', defaultPath: path.basename(name), filters: [{ name: extension === 'zip' ? 'Markdown and images' : 'Markdown', extensions: [extension] }] })
      if (result.canceled || !result.filePath) return false
      await writeFile(result.filePath, bytes); return true
    })
    handle('document:save-docx', async (name, bytes) => {
      if (typeof name !== 'string' || !/\.docx$/i.test(name) || !(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error('Invalid DOCX save request.')
      const result = await dialog.showSaveDialog(mainWindow, { title: 'Save DOCX copy', defaultPath: path.basename(name), filters: [{ name: 'Word document', extensions: ['docx'] }] })
      if (result.canceled || !result.filePath) return null
      if (!/\.docx$/i.test(result.filePath)) throw new Error('Choose a filename ending in .docx.')
      const temporary = path.join(path.dirname(result.filePath), `.nebula-${randomUUID()}.tmp`)
      try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, result.filePath) }
      finally { await rm(temporary, { force: true }) }
      return openDocument(result.filePath)
    })
    handle('document:confirm-discard', async () => {
      const { response } = await dialog.showMessageBox(mainWindow, { type: 'question', title: 'Unsaved changes', message: 'Discard unsaved changes and open another document?', buttons: ['Keep editing', 'Discard changes'], defaultId: 0, cancelId: 0, noLink: true })
      return response === 1
    })
    ipcMain.on('document:dirty', (event, dirty) => { if (trusted(event) && typeof dirty === 'boolean') documentDirty = dirty })
    handle('document:print', printDocument)
    handle('document:copy', text => {
      if (typeof text !== 'string' || Buffer.byteLength(text) > 180 * 1024 * 1024) throw new Error('Invalid clipboard request.')
      clipboard.writeText(text)
    })
    ipcMain.on('app:ready', event => { if (!trusted(event)) return; rendererReady = true; mainWindow.show(); if (queuedPath) { const filename = queuedPath; queuedPath = null; void dispatchFile(filename) } })
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'File', submenu: [{ label: 'Open DOCX…', accelerator: 'CmdOrCtrl+O', click: () => command('open') }, { label: 'Save DOCX copy…', accelerator: 'CmdOrCtrl+S', click: () => command('saveDocx') }, { label: 'Export Markdown…', accelerator: 'CmdOrCtrl+Shift+M', click: () => command('exportMarkdown') }, { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => command('print') }, { type: 'separator' }, { role: 'quit' }] },
      { label: 'Edit', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: 'View', submenu: [{ role: 'togglefullscreen' }, ...(development ? [{ role: 'toggleDevTools' }] : [])] },
      { label: 'Help', submenu: [{ label: 'About Nebula DOCX', click: () => dialog.showMessageBox(mainWindow, { type: 'info', title: 'Nebula DOCX', message: `Nebula DOCX ${app.getVersion()}`, detail: 'Open, preview, print and convert Word documents.\nAll processing stays on your device.\n\nPreview layouts can differ from Microsoft Word.\nMIT License · github.com/Porkstone/nebula-docx' }) }] },
    ]))
    createWindow()
    app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
  })
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}
