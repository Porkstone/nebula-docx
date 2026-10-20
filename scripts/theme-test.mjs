import { _electron as electron } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nebula-theme-test-'))
const profile = path.join(directory, 'profile')
const env = { ...process.env, NEBULA_USER_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE
const executablePath = process.env.NEBULA_TEST_EXECUTABLE
let application
const launch = () => electron.launch({ ...(executablePath ? { executablePath, args: [] } : { args: ['.'] }), env, timeout: 60000 })
const luminance = rgb => rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map(n => n / 255).map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4).reduce((sum, n, i) => sum + n * [.2126, .7152, .0722][i], 0)
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05) }
async function appearance(page, value) {
  await page.getByLabel('Appearance', { exact: true }).selectOption(value)
  await page.waitForFunction(value => document.querySelector('[aria-label="Appearance"]').value === value && !document.querySelector('[aria-label="Appearance"]').disabled, value)
}
try {
  await fs.mkdir('test-results', { recursive: true })
  // A corrupt setting must recover to System without preventing document use.
  await fs.mkdir(profile, { recursive: true })
  await fs.writeFile(path.join(profile, 'settings.json'), '{invalid')
  application = await launch()
  let page = await application.firstWindow()
  await page.getByText('Good documents deserve').waitFor()
  assert.equal(await page.getByLabel('Appearance', { exact: true }).inputValue(), 'system')
  await application.evaluate(({ dialog }, fixture) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] }) }, path.resolve('tests/fixtures/reading-notes.docx'))
  await page.getByRole('button', { name: 'Open file', exact: true }).click()
  await page.getByRole('heading', { name: 'reading-notes.docx' }).waitFor()
  for (const theme of ['dark', 'light']) {
    await appearance(page, theme)
    assert.equal(await application.evaluate(({ nativeTheme }) => nativeTheme.themeSource), theme)
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme)
    await page.screenshot({ path: `test-results/viewer-${theme}.png`, animations: 'disabled' })
    for (const selector of ['.sidebar', '.topbar', '.document-bar', '.statusbar', '.button.primary']) {
      const pair = await page.locator(selector).first().evaluate(el => { const s = getComputedStyle(el); return [s.color, s.backgroundColor] })
      assert.ok(contrast(...pair) >= 4.5, `${theme}: text contrast on ${selector}`)
    }
    const preview = page.frameLocator('iframe[title="Document preview"]')
    assert.equal(await preview.locator('section.docx').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 255, 255)', 'Theme must not recolour the Word document or print output')
    await page.getByRole('button', { name: 'Export Markdown', exact: true }).click()
    assert.ok(await page.getByRole('button', { name: 'Markdown file' }).isVisible())
    await page.getByRole('button', { name: 'Close export menu', exact: true }).click({ position: { x: 2, y: 2 } })
    await page.getByRole('button', { name: 'Edit document', exact: true }).click()
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'The compact app shell must fit without an outer scrollbar')
    await page.getByRole('textbox', { name: 'Document editor', exact: true }).waitFor()
    const colors = await page.locator('.editor-toolbar').evaluate(el => { const s = getComputedStyle(el); return [s.backgroundColor, getComputedStyle(document.querySelector('.topbar')).backgroundColor] })
    assert.equal(colors[0], colors[1], 'Editor controls must share the shell theme')
    await fs.mkdir('test-results', { recursive: true })
    await page.screenshot({ path: `test-results/editor-${theme}.png`, animations: 'disabled' })
    await page.getByRole('button', { name: 'Markdown', exact: true }).click()
    assert.ok(await page.locator('pre code').isVisible())
    await page.getByRole('button', { name: 'Document', exact: true }).click()
  }
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 650))
  const longName = 'A very long document title to check truncation and responsive action placement.docx'
  await page.evaluate(name => { document.querySelector('.document-title h1').textContent = name }, longName)
  for (const theme of ['dark', 'light']) {
    await appearance(page, theme)
    await page.getByRole('button', { name: 'Edit document', exact: true }).click()
    assert.ok(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), 'The compact app shell must fit without an outer scrollbar')
    for (const name of ['Open file', 'Save DOCX', 'Print', 'Export Markdown']) {
      const bounds = await page.getByRole('button', { name, exact: true }).boundingBox()
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width && bounds.y + bounds.height <= viewport.height, `${theme}: ${name} must fit at 900x650`)
    }
    await page.screenshot({ path: `test-results/compact-${theme}.png`, animations: 'disabled' })
    await page.getByRole('button', { name: 'Document', exact: true }).click()
  }
  await appearance(page, 'dark')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1.5))
  await page.waitForFunction(() => innerWidth < 650)
  for (const theme of ['dark', 'light']) {
    await appearance(page, theme)
    await page.getByRole('button', { name: 'Edit document', exact: true }).click()
    for (const name of ['Open file', 'Save DOCX', 'Print', 'Export Markdown']) {
      const bounds = await page.getByRole('button', { name, exact: true }).boundingBox()
      const width = await page.evaluate(() => innerWidth)
      assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width, `${name} must fit at 150% interface scaling`)
    }
    const screenshot = await application.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'))
    await fs.writeFile(`test-results/scaled-${theme}.png`, Buffer.from(screenshot, 'base64'))
    await page.getByRole('button', { name: 'Document', exact: true }).click()
  }
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1))
  await appearance(page, 'dark')
  await application.close()
  application = await launch(); page = await application.firstWindow()
  await page.getByText('Good documents deserve').waitFor()
  assert.equal(await page.getByLabel('Appearance', { exact: true }).inputValue(), 'dark')
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].reload())
  await page.getByText('Good documents deserve').waitFor()
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark')
  // System follows live media changes; an explicit choice remains fixed.
  await appearance(page, 'system')
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme })
    await page.waitForFunction(value => document.documentElement.dataset.theme === value, colorScheme)
  }
  await appearance(page, 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light')
  await page.getByLabel('Appearance', { exact: true }).focus()
  assert.equal(await page.getByLabel('Appearance', { exact: true }).evaluate(el => getComputedStyle(el).outlineWidth), '2px')
  await fs.mkdir('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/welcome-light.png', animations: 'disabled' })
  await appearance(page, 'dark')
  await page.screenshot({ path: 'test-results/welcome-dark.png', animations: 'disabled' })
  const invalid = await page.evaluate(async () => { try { await window.nebula.setAppearance('invalid'); return false } catch { return true } })
  assert.ok(invalid, 'Main process must reject invalid appearance values')
  console.log('PASS: light/dark contrast, viewer/editor/menu coverage, 900x650 long titles, 150% interface scaling, persistence after restart/reload, live System appearance, explicit override, focus, invalid/corrupt settings recovery.')
} finally {
  if (application) await application.close().catch(() => {})
  await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
