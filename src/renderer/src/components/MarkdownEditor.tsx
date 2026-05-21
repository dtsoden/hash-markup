import { useEffect, useRef } from 'react';
import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import '@toast-ui/editor/dist/theme/toastui-editor-dark.css';

import colorSyntax from '@toast-ui/editor-plugin-color-syntax';
import 'tui-color-picker/dist/tui-color-picker.css';
import '@toast-ui/editor-plugin-color-syntax/dist/toastui-editor-plugin-color-syntax.css';

import codeSyntaxHighlight from '@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight-all.js';
import 'prismjs/themes/prism.css';

import uml from '@toast-ui/editor-plugin-uml';
import chart from '@toast-ui/editor-plugin-chart';
import '@toast-ui/chart/dist/toastui-chart.min.css';

type EditorInstance = InstanceType<typeof Editor>;

export type EditorMode = 'wysiwyg' | 'markdown';

interface Props {
  initialValue: string;
  mode: EditorMode;
  dark: boolean;
  /** When true, raw HTML is stripped and HTML-only plugins are disabled. */
  sanitize: boolean;
  onChange: (markdown: string) => void;
}

/**
 * Toast UI Editor with the full plugin set:
 *   - color-syntax              — text color picker toolbar button
 *   - code-syntax-highlight     — Prism-powered fenced-code highlighting
 *   - uml                       — ```uml fences render as PlantUML diagrams
 *   - chart                     — ```chart fences render as Toast UI charts
 */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function looksLikeMarkdown(s: string): boolean {
  return (
    /(^|\n)\s{0,3}#{1,6}\s/.test(s) ||
    /(\*\*|__)[^*_\n]+(\*\*|__)/.test(s) ||
    /```/.test(s) ||
    /(^|\n)\s*[-*+]\s/.test(s) ||
    /(^|\n)\s*\d+\.\s/.test(s) ||
    /(^|\n)>\s/.test(s) ||
    /\[[^\]]+\]\([^)]+\)/.test(s) ||
    /<!--[\s\S]*?-->/.test(s)
  );
}

export function MarkdownEditor({ initialValue, mode, dark, sanitize, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!hostRef.current) return;

    const commentBtn = document.createElement('button');
    commentBtn.type = 'button';
    commentBtn.className = 'tui-comment-btn';
    commentBtn.setAttribute('aria-label', 'HTML comment');
    commentBtn.textContent = '<!>';
    commentBtn.addEventListener('click', () => {
      const ed = editorRef.current;
      if (!ed) return;
      const selected = typeof ed.getSelectedText === 'function' ? ed.getSelectedText() : '';
      ed.replaceSelection(`<!-- ${selected || ''} -->`);
      ed.focus();
    });

    // Syntax highlighting works even with the sanitizer on (Prism uses
     // class names, not inline style). The others emit raw HTML, so they
    // only make sense when the sanitizer is off.
    const plugins: unknown[] = [codeSyntaxHighlight];
    if (!sanitize) {
      plugins.unshift([colorSyntax, { useCustomSyntax: false }]);
      plugins.push(uml, chart);
    }

    // Toast UI's CustomHTMLRenderer type lives in a subpath that isn't
    // re-exported from the top-level package, so we type the params loosely.
    // The runtime contract is what matters here.
    type MdNodeLike = {
      type: string;
      prev: MdNodeLike | null;
      level?: number;
    };
    type ConvCtx = {
      entering: boolean;
      getChildrenText: (n: unknown) => string;
      origin?: () => unknown;
    };
    type Token = { type?: string; attributes?: Record<string, unknown> };

    // Walks preceding sibling chain to count earlier same-slug headings.
    // Stateless: works correctly no matter how many times the editor
    // re-renders (which it does on every keystroke for the preview pane).
    const countPriorMatches = (
      node: MdNodeLike,
      base: string,
      getText: (n: unknown) => string,
    ): number => {
      let n = 0;
      let cur: MdNodeLike | null = node.prev;
      while (cur) {
        if (cur.type === 'heading' && slugify(getText(cur).trim()) === base) n++;
        cur = cur.prev;
      }
      return n;
    };

    const customHTMLRenderer = {
      heading(node: MdNodeLike, ctx: ConvCtx) {
        if (!ctx.entering) return ctx.origin ? ctx.origin() : null;
        const text = ctx.getChildrenText(node).trim();
        if (!text) return ctx.origin ? ctx.origin() : null;
        const base = slugify(text);
        if (!base) return ctx.origin ? ctx.origin() : null;
        const count = countPriorMatches(node, base, ctx.getChildrenText);
        const id = count === 0 ? base : `${base}-${count}`;
        const result = ctx.origin ? ctx.origin() : null;
        const token = (Array.isArray(result) ? result[0] : result) as Token | null;
        if (token && token.type === 'openTag') {
          token.attributes = { ...(token.attributes ?? {}), id };
        }
        return result;
      },
    };

    const editor = new Editor({
      el: hostRef.current,
      height: '100%',
      initialEditType: mode,
      previewStyle: 'tab',
      initialValue,
      usageStatistics: false,
      theme: dark ? 'dark' : 'default',
      hideModeSwitch: true,
      plugins,
      customHTMLRenderer,
      // When sanitize is off we pass HTML through unchanged — required for
      // color-syntax, chart, and UML to render. With it on, Toast UI's
      // default (DOMPurify-based) sanitizer runs and strips inline styles.
      ...(sanitize ? {} : { customHTMLSanitizer: (html: string) => html }),
      toolbarItems: [
        ['heading', 'bold', 'italic', 'strike'],
        ['hr', 'quote'],
        ['ul', 'ol', 'task', 'indent', 'outdent'],
        ['table', 'image', 'link'],
        ['code', 'codeblock'],
        [{ name: 'comment', tooltip: 'HTML comment', el: commentBtn }],
      ],
      events: {
        change: () => {
          if (editorRef.current) onChangeRef.current(editorRef.current.getMarkdown());
        },
      },
    });
    editorRef.current = editor;

    // Dev-only debug handle. Lets you open DevTools (F12) and run
    // `__editor.getHTML()` to inspect the converted HTML output.
    if (import.meta.env.DEV) {
      (window as unknown as { __editor?: unknown }).__editor = editor;
    }

    // Auto-parse markdown pasted into WYSIWYG mode. Without this, raw markdown
    // text (including HTML comments like <!-- ... -->) pastes as literal text
    // instead of being interpreted and rendered.
    const onPaste = (e: ClipboardEvent): void => {
      const ed = editorRef.current;
      if (!ed || ed.isMarkdownMode()) return;
      const text = e.clipboardData?.getData('text/plain');
      if (!text || !looksLikeMarkdown(text)) return;
      e.preventDefault();
      e.stopPropagation();
      const current = ed.getMarkdown();
      ed.setMarkdown(current ? `${current}\n\n${text}` : text, true);
    };
    hostRef.current.addEventListener('paste', onPaste, true);

    return () => {
      hostRef.current?.removeEventListener('paste', onPaste, true);
      editor.destroy();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    editorRef.current?.changeMode(mode, true);
  }, [mode]);

  // Disable browser spell-check on code regions in both modes. The
  // Chromium spellchecker honours spellcheck="false" set on a descendant
  // of an editable element. We tag:
  //   - WYSIWYG: <pre> and <code> elements (block + inline code)
  //   - Raw (CodeMirror): token spans for inline code and fenced blocks
  // Re-runs on DOM mutations (debounced via rAF) so freshly-rendered
  // code regions get tagged as the user types.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let scheduled = false;
    const tag = (root: HTMLElement): void => {
      // WYSIWYG block + inline code
      root.querySelectorAll('pre, code').forEach((el) => {
        if (el.getAttribute('spellcheck') !== 'false') {
          el.setAttribute('spellcheck', 'false');
        }
      });
      // Toast UI 3.x raw-mode tokens. Inline code is .toastui-editor-md-code,
      // fenced blocks are .toastui-editor-md-code-block (and its line-bg
      // variants). [class*="md-code"] catches all three with one selector.
      root.querySelectorAll('[class*="md-code"]').forEach((el) => {
        if (el.getAttribute('spellcheck') !== 'false') {
          el.setAttribute('spellcheck', 'false');
        }
      });
    };

    const schedule = (): void => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (host.isConnected) tag(host);
      });
    };

    tag(host);
    const observer = new MutationObserver(schedule);
    observer.observe(host, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <div ref={hostRef} className="tui-host" />;
}
