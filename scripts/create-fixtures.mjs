import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, Header, Footer, PageNumber, ImageRun, ExternalHyperlink, PageBreak } from 'docx'
import fs from 'node:fs/promises'
await fs.mkdir('tests/fixtures', { recursive: true })
const text = value => new Paragraph({ children: [new TextRun(value)], spacing: { after: 180, line: 300 } })
const cell = value => new TableCell({ children: [text(value)] })
const doc = new Document({
  creator: 'Nebula DOCX', title: 'A little room to think', description: 'Viewer verification fixture',
  styles: { default: { document: { run: { font: 'Calibri', size: 23, color: '344B3B' }, paragraph: { spacing: { line: 300 } } } } },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1100, right: 1200, bottom: 1100, left: 1200 } } },
    headers: { default: new Header({ children: [new Paragraph({ children: [new TextRun({ text: 'N E B U L A   /   F I E L D   N O T E S', size: 16, color: '849574' })], spacing: { after: 400 } })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ children: [new TextRun({ text: 'A little space for your words.     /     ', size: 16, color: '849574' }), new TextRun({ children: [PageNumber.CURRENT], size: 16 })] })] }) },
    children: [
      new Paragraph({ text: 'A little room to think', heading: HeadingLevel.TITLE, spacing: { before: 300, after: 200 } }),
      text('An everyday guide to making space for clearer ideas.'),
      new Paragraph({ text: 'Start with a little space', heading: HeadingLevel.HEADING_1 }),
      text('There is something useful about a blank page. Before the deadlines, the details and the next meeting, it gives an idea somewhere to land.'),
      new Paragraph({ children: [new TextRun('Good notes are '), new TextRun({ text: 'clear, considered and useful', bold: true }), new TextRun('. Keep the important details, and let the rest breathe.')], spacing: { after: 200 } }),
      new Paragraph({ text: 'Three things worth keeping', heading: HeadingLevel.HEADING_2 }),
      ...['A question you want to explore.', 'An observation you do not want to lose.', 'A small next step you can take today.'].map(value => new Paragraph({ text: value, bullet: { level: 0 }, spacing: { after: 120 } })),
      new Paragraph({ text: 'A simple reading rhythm', heading: HeadingLevel.HEADING_2 }),
      new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: [cell('Moment'), cell('Practice'), cell('Time')] }), new TableRow({ children: [cell('Before reading'), cell('Write one useful question'), cell('2 minutes')] }), new TableRow({ children: [cell('While reading'), cell('Keep a few thoughtful notes'), cell('15 minutes')] }), new TableRow({ children: [cell('After reading'), cell('Choose your next step'), cell('3 minutes')] })] }),
      new Paragraph({ children: [new PageBreak()] }),
      new Paragraph({ text: 'Take your words further', heading: HeadingLevel.HEADING_1 }),
      text('A document is a starting point. Share the finished version, print a copy for your desk, or turn the ideas into Markdown for your own workspace.'),
      new Paragraph({ children: [new ImageRun({ type: 'png', data: await fs.readFile('build/icon.png'), transformation: { width: 90, height: 90 }, altText: { title: 'Nebula layers', description: 'Three cream layers on a forest green square', name: 'Nebula' } })] }),
      new Paragraph({ text: 'Keep the details', heading: HeadingLevel.HEADING_2 }),
      text('This sample includes headings, bold text, a list, a table, an image, a hyperlink, headers, footers and a manual page break. It also includes Unicode: café, naïve, 日本語 and an em dash — all part of a good document.'),
      new Paragraph({ children: [new ExternalHyperlink({ link: 'https://github.com/Porkstone/nebula-docx', children: [new TextRun({ text: 'Visit the Nebula DOCX project', style: 'Hyperlink' })] })] }),
      new Paragraph({ text: 'One final thought', heading: HeadingLevel.HEADING_2 }),
      text('Leave a little room for what comes next.'),
    ],
  }],
})
await fs.writeFile('tests/fixtures/reading-notes.docx', await Packer.toBuffer(doc))
await fs.writeFile('tests/fixtures/damaged.docx', 'This is not a ZIP archive.')
console.log('Created two-page DOCX fixture and damaged-file fixture.')
