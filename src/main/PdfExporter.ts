import { BrowserWindow, dialog } from 'electron';
import { promises as fs } from 'fs';
import { marked, type Tokens } from 'marked';
import markedFootnote from 'marked-footnote';
import path from 'path';

// Inline markdown extensions added to marked so PDF / HTML output matches
// the WYSIWYG view's rendering for our extra inline syntax.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inlineExt(name: string, regex: RegExp, marker: string, tag: string): any {
  return {
    name,
    level: 'inline',
    start(src: string) {
      const i = src.indexOf(marker);
      return i < 0 ? undefined : i;
    },
    tokenizer(src: string) {
      const m = regex.exec(src);
      if (!m) return undefined;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const self = this as any;
      return {
        type: name,
        raw: m[0],
        text: m[1],
        tokens: self.lexer.inlineTokens(m[1]),
      };
    },
    renderer(token: Tokens.Generic) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const self = this as any;
      return `<${tag}>${self.parser.parseInline(token.tokens ?? [])}</${tag}>`;
    },
  };
}

// Slugify heading text -> stable id (lowercase, hyphenated, alphanumeric).
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

marked.use(markedFootnote());

// Definition list extension. Pandoc-style syntax:
//   Term
//   : Definition
//   : Another definition
//
//   Term 2
//   : Definition 2
// Renders to <dl><dt>Term</dt><dd>Definition</dd>...</dl>.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deflistExtension: any = {
  name: 'deflist',
  level: 'block',
  start(src: string) {
    const m = /\n[^\n]+\n:[ \t]/.exec(src);
    return m ? m.index : undefined;
  },
  tokenizer(src: string) {
    const m = /^([^\n][^\n]*)\n((?::[ \t]+[^\n]+(?:\n|$))+)/.exec(src);
    if (!m) return undefined;
    const term = m[1].trim();
    const defLines = m[2]
      .split('\n')
      .map((l) => l.replace(/^:[ \t]+/, '').trim())
      .filter((l) => l.length > 0);
    return {
      type: 'deflist',
      raw: m[0],
      term,
      defs: defLines,
    };
  },
  renderer(token: Tokens.Generic) {
    const defs = ((token as Tokens.Generic & { defs: string[] }).defs ?? [])
      .map((d) => `<dd>${d}</dd>`)
      .join('');
    const term = (token as Tokens.Generic & { term: string }).term;
    return `<dl><dt>${term}</dt>${defs}</dl>\n`;
  },
};

marked.use({
  extensions: [
    inlineExt('mark', /^==([^=\n]+?)==/, '==', 'mark'),
    inlineExt('sub', /^~([^~\s][^~\n]*?)~/, '~', 'sub'),
    inlineExt('sup', /^\^([^\^\s][^\^\n]*?)\^/, '^', 'sup'),
    deflistExtension,
  ],
  renderer: {
    // Auto-generate id="..." on every rendered heading. Duplicate text
    // gets numeric suffixes within a single render via the counter.
    heading(text: string, level: number): string {
      // text is already parsed inline HTML; strip tags for the slug.
      const plain = text.replace(/<[^>]+>/g, '');
      const base = slugify(plain);
      const seen = headingSlugCounter.get(base) ?? 0;
      headingSlugCounter.set(base, seen + 1);
      const id = seen === 0 ? base : `${base}-${seen}`;
      return `<h${level} id="${id}">${text}</h${level}>\n`;
    },
  },
});

const headingSlugCounter = new Map<string, number>();

/**
 * Renders markdown → HTML in a hidden BrowserWindow, then uses
 * Chromium's printToPDF. Gives users professional PDF output that
 * matches the WYSIWYG look rather than the raw source.
 */
export class PdfExporter {
  async export(parent: BrowserWindow, markdown: string, suggestedName: string): Promise<string | null> {
    const save = await dialog.showSaveDialog(parent, {
      defaultPath: suggestedName.replace(/\.(md|markdown|mdown|mkd)$/i, '.pdf') || 'document.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (save.canceled || !save.filePath) return null;

    // Reset heading-id counter so each export starts fresh.
    headingSlugCounter.clear();
    const html = this.wrap(await marked.parse(markdown));
    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true, javascript: false },
    });

    try {
      await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      const buffer = await printWindow.webContents.printToPDF({
        printBackground: true,
        pageSize: 'Letter',
        margins: { top: 0.75, bottom: 0.75, left: 0.75, right: 0.75 },
      });
      const outPath = save.filePath.endsWith('.pdf') ? save.filePath : save.filePath + '.pdf';
      await fs.writeFile(outPath, buffer);
      return outPath;
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy();
    }
  }

  private wrap(body: string): string {
    return `<!doctype html><html><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; color:#222; line-height:1.6; max-width: 7.5in; margin: 0 auto; padding: 0.25in; font-size: 11pt; }
      h1,h2,h3,h4 { page-break-after: avoid; color:#111; }
      h1 { font-size: 22pt; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
      h2 { font-size: 17pt; }
      dl { margin: 12px 0; }
      dt { font-weight: 600; margin-top: 8px; }
      dd { margin-left: 24px; margin-bottom: 4px; }
      pre, code { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 9.5pt; }
      pre { background: #f5f5f7; padding: 10px; border-radius: 4px; overflow:auto; page-break-inside: avoid; }
      code { background: #f5f5f7; padding: 1px 4px; border-radius: 3px; }
      pre code { background: transparent; padding: 0; }
      blockquote { border-left: 3px solid #ccc; margin: 0; padding: 4px 12px; color: #555; }
      table { border-collapse: collapse; }
      th, td { border: 1px solid #ddd; padding: 6px 10px; }
      th { background: #f5f5f7; }
      img { max-width: 100%; }
      a { color: #2563eb; }
    </style></head><body>${body}</body></html>`;
  }

  suggestedName(filePath: string | null): string {
    return filePath ? path.basename(filePath) : 'Untitled.md';
  }
}
