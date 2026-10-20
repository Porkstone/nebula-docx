import { _electron as electron } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { spawn } from 'node:child_process'
import electronBinary from 'electron'

// Exercise the real Electron app, preload, file dialogs, export IPC and print pipeline.
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nebula-test-'))
const env = { ...process.env, NEBULA_USER_DATA: path.join(directory, 'profile') }
delete env.ELECTRON_RUN_AS_NODE
const executablePath = process.env.NEBULA_TEST_EXECUTABLE
const application = await electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }), env, timeout: 60000 })
const failures = []
const savedClipboard = await application.evaluate(({ clipboard }) => clipboard.readText())
try {
  const page = await application.firstWindow()
  page.on('pageerror', error => failures.push(error.message))
  await page.getByText('Good documents deserve').waitFor()
  assert.equal(await page.evaluate(() => typeof window.nebula.open), 'function')
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined')
  await application.evaluate(({ dialog }, fixture) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] }) }, path.resolve('tests/fixtures/reading-notes.docx'))
  await page.getByRole('button', { name: 'Open file', exact: true }).click()
  await page.getByRole('heading', { name: 'reading-notes.docx' }).waitFor()
  await page.getByText('Page 1 of 2', { exact: true }).waitFor()
  const preview = page.frameLocator('iframe[title="Document preview"]')
  await preview.getByText('A little room to think', { exact: true }).waitFor()
  assert.equal(await preview.locator('section.docx').count(), 2)
  assert.equal(await preview.locator('table').count(), 1)
  assert.equal(await preview.locator('img').count(), 1)
  assert.equal(await preview.locator('section.docx').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)')
  assert.ok((await preview.locator('body').evaluate(el => el.querySelectorAll('style').length)) > 1, 'Generated Word styles must survive sanitisation')
  const previewDocument = await preview.locator('body').innerText()
  assert.ok(previewDocument.includes('日本語'))
  await page.getByRole('button', { name: 'Next page', exact: true }).click()
  await page.getByText('Page 2 of 2', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByText('110%', { exact: true }).waitFor()
  await page.getByPlaceholder('Find in document').fill('document')
  await page.waitForFunction(() => document.querySelector('.search-box > span')?.textContent?.includes('/'))
  await page.getByRole('button', { name: 'Markdown', exact: true }).click()
  const markdown = await page.locator('pre code').innerText()
  await fs.mkdir('test-results', { recursive: true })
  await fs.writeFile('test-results/converted.md', markdown)
  assert.ok(markdown.includes('# Start with a little space'))
  assert.ok(markdown.includes('**clear, considered and useful**'))
  assert.ok(markdown.includes('| Moment | Practice | Time |'))
  assert.ok(markdown.includes('data:image/png;base64,'))
  assert.ok(markdown.includes('日本語'))
  await page.getByRole('button', { name: 'Copy', exact: true }).click()
  assert.equal(await application.evaluate(({ clipboard }) => clipboard.readText()), markdown)

  const markdownPath = path.join(directory, 'export.md')
  await application.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }) }, markdownPath)
  await page.getByRole('button', { name: 'Export Markdown', exact: true }).click()
  await page.getByRole('button', { name: 'Markdown file', exact: false }).click()
  await page.getByText('Markdown exported successfully.', { exact: true }).waitFor()
  assert.equal(await fs.readFile(markdownPath, 'utf8'), markdown)

  const zipPath = path.join(directory, 'export.zip')
  await application.evaluate(({ dialog }, target) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: target }) }, zipPath)
  await page.getByRole('button', { name: 'Export Markdown', exact: true }).click()
  await page.getByRole('button', { name: 'Markdown + images', exact: false }).click()
  await page.waitForTimeout(400)
  const zip = await JSZip.loadAsync(await fs.readFile(zipPath))
  assert.ok(zip.file('images/image-001.png'))
  assert.ok((await zip.file('reading-notes.md').async('string')).includes('images/image-001.png'))

  // Replace only the final OS print dialog with printToPDF; keep the actual print handler and isolated print window.
  const pdfPath = path.join(directory, 'printed.pdf')
  await application.evaluate(({ app, BrowserWindow }, target) => {
    app.on('web-contents-created', (_event, contents) => {
      contents.print = async (_options, callback) => {
        try {
          const bytes = await contents.printToPDF({ printBackground: true, preferCSSPageSize: true })
          process.getBuiltinModule('fs').writeFileSync(target, bytes)
          callback(true)
        } catch (error) { globalThis.nebulaPrintError = error.message; callback(false, error.message) }
      }
    })
    globalThis.nebulaWindowCount = BrowserWindow.getAllWindows().length
  }, pdfPath)
  await page.getByRole('button', { name: 'Print', exact: true }).click()
  for (let i = 0; i < 40; i++) { try { if ((await fs.stat(pdfPath)).size > 100) break } catch {} await page.waitForTimeout(250) }
  assert.equal(await application.evaluate(() => globalThis.nebulaPrintError), undefined)
  assert.equal(await page.getByRole('alert').count(), 0, await page.getByRole('alert').allTextContents())
  const pdf = await fs.readFile(pdfPath)
  assert.equal(pdf.subarray(0, 4).toString(), '%PDF')
  assert.equal((await PDFDocument.load(pdf)).getPageCount(), 2, 'Printing must preserve the two rendered pages')
  const preferences = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences())
  assert.equal(preferences.sandbox, true)
  assert.equal(preferences.contextIsolation, true)
  assert.equal(preferences.nodeIntegration, false)

  // Reject oversized ZIP metadata before the conversion libraries inflate it.
  const oversized = Buffer.from(await fs.readFile('tests/fixtures/reading-notes.docx'))
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02])
  let central = oversized.indexOf(signature)
  while (central >= 0 && oversized.readUInt32LE(central + 24) === 0) central = oversized.indexOf(signature, central + 4)
  assert.ok(central >= 0)
  oversized.writeUInt32LE(121 * 1024 * 1024, central + 24)
  const oversizedPath = path.join(directory, 'overexpanded.docx')
  await fs.writeFile(oversizedPath, oversized)
  await application.evaluate(({ dialog }, fixture) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] }) }, oversizedPath)
  await page.getByRole('button', { name: 'Open file', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '120 MB safety limit' }).waitFor()
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click()

  await application.evaluate(({ dialog }, fixture) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] }) }, path.resolve('tests/fixtures/damaged.docx'))
  await page.getByRole('button', { name: 'Open file', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'damaged' }).waitFor()
  assert.equal(await page.locator('pre code').innerText(), markdown, 'Failed opens must preserve the current document')
  const recent = await page.evaluate(() => window.nebula.recent())
  assert.ok(recent.some(item => item.name === 'reading-notes.docx'))
  assert.ok(recent.every(item => !('path' in item)), 'Recent file paths must stay in the main process')
  assert.deepEqual(failures, [])
  await fs.mkdir('test-results', { recursive: true })
  await fs.copyFile(pdfPath, 'test-results/printed.pdf')
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click()
  await page.getByRole('button', { name: 'Document', exact: true }).click()
  await page.getByRole('button', { name: 'Fit to width', exact: true }).click()
  await page.getByRole('button', { name: 'Previous page', exact: true }).click()
  await page.getByPlaceholder('Find in document').fill('')
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'test-results/viewer.png' })
  const commandLineFixture = path.join(directory, 'command-line.docx')
  await fs.copyFile('tests/fixtures/reading-notes.docx', commandLineFixture)
  const second = spawn(executablePath ?? electronBinary, [...(executablePath ? [] : ['.']), commandLineFixture], { env, stdio: 'ignore', windowsHide: true })
  await page.getByRole('heading', { name: 'command-line.docx' }).waitFor()
  if (second.exitCode === null) await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { second.kill(); reject(new Error('Second instance did not exit')) }, 10000)
    second.once('exit', () => { clearTimeout(timeout); resolve() })
  })
  console.log('PASS: native open, 2-page preview, table/image/Unicode, pagination, zoom, search, Markdown, clipboard, file + ZIP export, PDF print, sandbox, corrupt/oversized-file recovery and single-instance file opening.')
} finally {
  await application.evaluate(({ clipboard }, text) => clipboard.writeText(text), savedClipboard).catch(() => {})
  await application.close()
  await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
