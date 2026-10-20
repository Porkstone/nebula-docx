import fs from 'node:fs/promises'
import path from 'node:path'
const store = 'node_modules/.pnpm'
const sections = []
for (const entry of await fs.readdir(store)) {
  const modules = path.join(store, entry, 'node_modules')
  let names
  try { names = await fs.readdir(modules) } catch { continue }
  for (const name of names) {
    const candidates = name.startsWith('@') ? (await fs.readdir(path.join(modules, name))).map(child => `${name}/${child}`) : [name]
    for (const candidate of candidates) {
      const directory = path.join(modules, candidate)
      try {
        if ((await fs.lstat(directory)).isSymbolicLink()) continue
        const info = JSON.parse(await fs.readFile(path.join(directory, 'package.json'), 'utf8'))
        const files = (await fs.readdir(directory)).filter(file => /^(licen[cs]e|copying|notice)(\.|$)/i.test(file))
        const licenses = await Promise.all(files.map(file => fs.readFile(path.join(directory, file), 'utf8').catch(() => '')))
        sections.push(`${info.name}@${info.version}\nLicense: ${typeof info.license === 'string' ? info.license : JSON.stringify(info.license)}\n${licenses.join('\n')}`)
      } catch { /* Optional platform packages may be absent. */ }
    }
  }
}
await fs.writeFile('THIRD-PARTY-NOTICES.txt', 'Nebula DOCX includes third-party software.\nElectron and Chromium notices also ship with the application.\nBuild tools are listed for completeness.\n\n' + [...new Set(sections)].sort().join('\n\n' + '='.repeat(72) + '\n\n'))
console.log(`Wrote notices for ${sections.length} packages.`)
