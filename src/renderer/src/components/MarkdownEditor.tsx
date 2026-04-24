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

  return <div ref={hostRef} className="tui-host" />;
}
