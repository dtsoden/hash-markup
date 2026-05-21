import { useEffect, useRef, useState } from 'react';
import { Editor, rootCtx, defaultValueCtx, editorViewCtx, parserCtx, serializerCtx } from '@milkdown/kit/core';
import {
  commonmark,
  toggleStrongCommand,
  toggleEmphasisCommand,
  toggleInlineCodeCommand,
  wrapInHeadingCommand,
  wrapInBlockquoteCommand,
  wrapInBulletListCommand,
  wrapInOrderedListCommand,
  insertHrCommand,
  insertImageCommand,
  toggleLinkCommand,
  createCodeBlockCommand,
} from '@milkdown/kit/preset/commonmark';
import {
  gfm,
  toggleStrikethroughCommand,
  insertTableCommand,
} from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { Slice } from '@milkdown/kit/prose/model';
import { Plugin } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import { callCommand, $prose } from '@milkdown/kit/utils';
import { get as getEmojiChar } from 'node-emoji';
import { nord } from '@milkdown/theme-nord';
import '@milkdown/theme-nord/style.css';
import { prism } from '@milkdown/plugin-prism';
import 'prismjs/themes/prism.css';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history as cmHistory, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';

export type EditorMode = 'wysiwyg' | 'markdown';

interface Props {
  initialValue: string;
  mode: EditorMode;
  dark: boolean;
  /** Reserved for future raw-HTML pass-through toggle. */
  sanitize: boolean;
  onChange: (markdown: string) => void;
}

/**
 * Editor with two modes:
 *  - WYSIWYG: Milkdown (live-preview markdown editing on ProseMirror).
 *  - Raw markdown: CodeMirror 6 with markdown language support.
 *
 * Both modes are mounted but only one is visible at a time so switching
 * is instant and the inactive editor preserves cursor / undo history.
 * Content is the single source of truth: the visible editor pushes its
 * value up via onChange, and switching modes seeds the newly visible
 * editor with the latest value.
 */
export function MarkdownEditor({ initialValue, mode, dark, sanitize: _sanitize, onChange }: Props): JSX.Element {
  const wysiwygHostRef = useRef<HTMLDivElement>(null);
  const rawHostRef = useRef<HTMLDivElement>(null);
  const milkdownRef = useRef<Editor | null>(null);
  const cmRef = useRef<EditorView | null>(null);
  const valueRef = useRef(initialValue);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [editorReady, setEditorReady] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);

  // ---------------- Milkdown (WYSIWYG) ----------------
  useEffect(() => {
    if (!wysiwygHostRef.current) return;

    let destroyed = false;

    (async () => {
      const editor = await Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, wysiwygHostRef.current!);
          ctx.set(defaultValueCtx, valueRef.current);
          ctx.get(listenerCtx).markdownUpdated((_ctx, md) => {
            valueRef.current = md;
            onChangeRef.current(md);
          });
        })
        .config(nord)
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(clipboard)
        .use(emojiShortcodeDecoration)
        .use(prism)
        .create();

      if (destroyed) {
        await editor.destroy();
        return;
      }
      milkdownRef.current = editor;
      setEditorReady(true);

      // Dev-only debug handle.
      if (import.meta.env.DEV) {
        (window as unknown as { __editor?: Editor }).__editor = editor;
      }
    })().catch((err) => console.error('[MarkdownEditor] Milkdown init failed:', err));

    return () => {
      destroyed = true;
      const e = milkdownRef.current;
      milkdownRef.current = null;
      if (e) void e.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- CodeMirror (Raw markdown) ----------------
  useEffect(() => {
    if (!rawHostRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          lineNumbers(),
          highlightActiveLine(),
          bracketMatching(),
          indentOnInput(),
          cmHistory(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          dark ? darkTheme : lightTheme,
          EditorView.lineWrapping,
          EditorView.updateListener.of((u) => {
            if (!u.docChanged) return;
            const md = u.state.doc.toString();
            valueRef.current = md;
            onChangeRef.current(md);
          }),
        ],
      }),
      parent: rawHostRef.current,
    });

    cmRef.current = view;
    return () => {
      view.destroy();
      cmRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------- Sync content between modes on toggle ----------------
  useEffect(() => {
    // When switching modes, push the latest value into the newly visible
    // editor (the user may have edited in the other mode).
    if (mode === 'wysiwyg' && milkdownRef.current) {
      const e = milkdownRef.current;
      try {
        e.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          const parser = ctx.get(parserCtx);
          const doc = parser(valueRef.current);
          if (!doc) return;
          const tr = view.state.tr.replace(
            0,
            view.state.doc.content.size,
            new Slice(doc.content, 0, 0),
          );
          view.dispatch(tr);
        });
      } catch (err) {
        console.warn('[MarkdownEditor] WYSIWYG sync failed:', err);
      }
    } else if (mode === 'markdown' && cmRef.current) {
      const view = cmRef.current;
      const current = view.state.doc.toString();
      if (current !== valueRef.current) {
        view.dispatch({
          changes: { from: 0, to: current.length, insert: valueRef.current },
        });
      }
    }
  }, [mode]);

  // ---------------- Spell-check on code regions ----------------
  // Chromium spell-checks any contenteditable surface by default; that
  // covers Milkdown (ProseMirror) and CodeMirror automatically. We add
  // spellcheck="false" to code elements so misspellings inside code
  // blocks and inline code don't get flagged. Stays in sync via a
  // MutationObserver since both editors re-render aggressively.
  useEffect(() => {
    const wy = wysiwygHostRef.current;
    if (!wy) return;
    let scheduled = false;
    const tag = (): void => {
      scheduled = false;
      if (!wy.isConnected) return;
      wy.querySelectorAll('pre, code').forEach((el) => {
        if (el.getAttribute('spellcheck') !== 'false') {
          el.setAttribute('spellcheck', 'false');
        }
      });
    };
    const schedule = (): void => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(tag);
    };
    tag();
    const observer = new MutationObserver(schedule);
    observer.observe(wy, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  // ---------------- Dark theme toggle (CodeMirror) ----------------
  // Milkdown's nord theme has its own CSS; the dark class on the wrapper
  // flips its variables. CodeMirror needs its theme swapped via a
  // StateEffect — for now we just re-mount on dark change by keying the
  // wrapper, which is set up in App.tsx.

  // ---------------- Toolbar action ----------------
  // Milkdown's command objects carry a `.key` (typed `CmdKey<T>`) that
  // callCommand consumes. TS in this project sees the key as `symbol`
  // due to how the preset exports are typed, so we erase the type.
  const run = (command: unknown, payload?: unknown): void => {
    const e = milkdownRef.current;
    if (!e) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const key = (command as { key: any }).key;
      e.action(callCommand(key, payload));
    } catch (err) {
      console.warn('[MarkdownEditor] command failed:', err);
    }
  };

  const insertText = (text: string): void => {
    const e = milkdownRef.current;
    if (!e) return;
    e.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.insertText(text));
    });
  };

  // Insert markdown syntax at the cursor and force a re-parse so plugins
  // (emoji, etc.) that only convert on parse get a chance to run. The
  // source IS the truth — this matches the FrontPage/Typora mental model
  // where the WYSIWYG view is always a live render of the markdown.
  const insertMarkdown = (md: string): void => {
    const e = milkdownRef.current;
    if (!e) return;
    e.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      const serialize = ctx.get(serializerCtx);
      const parse = ctx.get(parserCtx);

      // Step 1: drop the new text in at the cursor as plain text.
      const insertTr = view.state.tr.insertText(md);
      const insertAt = view.state.selection.from;
      view.dispatch(insertTr);

      // Step 2: round-trip through markdown so parser-time plugins fire.
      const after = view.state;
      const source = serialize(after.doc);
      const newDoc = parse(source);
      if (!newDoc) return;
      const replaceTr = view.state.tr.replace(
        0,
        view.state.doc.content.size,
        new Slice(newDoc.content, 0, 0),
      );
      // Best-effort cursor restore: drop near where we inserted.
      const targetPos = Math.min(insertAt + md.length, replaceTr.doc.content.size);
      view.dispatch(replaceTr);
      try {
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.near(view.state.doc.resolve(targetPos)),
          ),
        );
      } catch {
        // ignore selection restore failures
      }
    });
  };

  const ToolbarButton = ({
    title,
    onClick,
    children,
  }: {
    title: string;
    onClick: () => void;
    children: React.ReactNode;
  }): JSX.Element => (
    <button type="button" disabled={!editorReady} onClick={onClick} title={title} aria-label={title}>
      {children}
    </button>
  );

  // Lucide-style stroked icons inlined so we don't pull a dependency.
  const Ic = (path: string): JSX.Element => (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g dangerouslySetInnerHTML={{ __html: path }} />
    </svg>
  );

  // Heading buttons use a stylized label (H1/H2/H3) — clearer than abstract icons.
  const HeadingLabel = ({ level }: { level: 1 | 2 | 3 }): JSX.Element => (
    <span style={{ fontFamily: 'inherit', fontWeight: 700, fontSize: '14px' }}>
      H<sub style={{ fontSize: '10px' }}>{level}</sub>
    </span>
  );

  return (
    <div className={`md-editor md-editor--${mode} ${dark ? 'md-editor--dark' : ''}`}>
      {mode === 'wysiwyg' && (
        <div className="md-toolbar" role="toolbar">
          <ToolbarButton title="Heading 1" onClick={() => run(wrapInHeadingCommand, 1)}>
            <HeadingLabel level={1} />
          </ToolbarButton>
          <ToolbarButton title="Heading 2" onClick={() => run(wrapInHeadingCommand, 2)}>
            <HeadingLabel level={2} />
          </ToolbarButton>
          <ToolbarButton title="Heading 3" onClick={() => run(wrapInHeadingCommand, 3)}>
            <HeadingLabel level={3} />
          </ToolbarButton>
          <span className="md-toolbar__sep" />
          <ToolbarButton title="Bold (Ctrl/Cmd+B)" onClick={() => run(toggleStrongCommand)}>
            {Ic('<path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/>')}
          </ToolbarButton>
          <ToolbarButton title="Italic (Ctrl/Cmd+I)" onClick={() => run(toggleEmphasisCommand)}>
            {Ic('<line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/>')}
          </ToolbarButton>
          <ToolbarButton title="Strikethrough" onClick={() => run(toggleStrikethroughCommand)}>
            {Ic('<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><line x1="4" y1="12" x2="20" y2="12"/>')}
          </ToolbarButton>
          <ToolbarButton title="Inline code" onClick={() => run(toggleInlineCodeCommand)}>
            {Ic('<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>')}
          </ToolbarButton>
          <span className="md-toolbar__sep" />
          <ToolbarButton title="Horizontal rule" onClick={() => run(insertHrCommand)}>
            {Ic('<line x1="5" y1="12" x2="19" y2="12"/>')}
          </ToolbarButton>
          <ToolbarButton title="Quote" onClick={() => run(wrapInBlockquoteCommand)}>
            {Ic('<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>')}
          </ToolbarButton>
          <ToolbarButton title="Bulleted list" onClick={() => run(wrapInBulletListCommand)}>
            {Ic('<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4.5" cy="6" r="1.5" fill="currentColor"/><circle cx="4.5" cy="12" r="1.5" fill="currentColor"/><circle cx="4.5" cy="18" r="1.5" fill="currentColor"/>')}
          </ToolbarButton>
          <ToolbarButton title="Numbered list" onClick={() => run(wrapInOrderedListCommand)}>
            {Ic('<line x1="10" y1="6" x2="20" y2="6"/><line x1="10" y1="12" x2="20" y2="12"/><line x1="10" y1="18" x2="20" y2="18"/><path d="M4 5h1v4"/><line x1="4" y1="9" x2="6" y2="9"/><path d="M4 13h2a1 1 0 0 1 1 1c0 1.5-3 2-3 4h3"/><path d="M4 17h2a1 1 0 0 1 0 2H4v0"/>')}
          </ToolbarButton>
          <span className="md-toolbar__sep" />
          <ToolbarButton title="Table" onClick={() => run(insertTableCommand)}>
            {Ic('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>')}
          </ToolbarButton>
          <ToolbarButton
            title="Image"
            onClick={() => {
              const src = window.prompt('Image URL:');
              if (!src) return;
              const alt = window.prompt('Alt text (optional):') ?? '';
              run(insertImageCommand, { src, alt });
            }}
          >
            {Ic('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>')}
          </ToolbarButton>
          <ToolbarButton
            title="Link"
            onClick={() => {
              const href = window.prompt('Link URL:');
              if (!href) return;
              run(toggleLinkCommand, { href });
            }}
          >
            {Ic('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>')}
          </ToolbarButton>
          <ToolbarButton title="Code block" onClick={() => run(createCodeBlockCommand)}>
            {Ic('<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>')}
          </ToolbarButton>
          <ToolbarButton
            title="Task list (checkbox)"
            onClick={() => insertText('\n- [ ] ')}
          >
            {Ic('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>')}
          </ToolbarButton>
          <span className="md-toolbar__sep" />
          <div style={{ position: 'relative' }}>
            <ToolbarButton title="Emoji" onClick={() => setShowEmoji((v) => !v)}>
              {Ic('<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>')}
            </ToolbarButton>
            {showEmoji && (
              <div className="md-emoji-picker" role="dialog" aria-label="Emoji picker">
                {COMMON_EMOJI.map((e) => (
                  <button
                    key={e.shortcode}
                    type="button"
                    title={e.shortcode}
                    onClick={() => {
                      // Insert the shortcode and re-parse so the emoji
                      // plugin converts it to the rendered glyph.
                      insertMarkdown(e.shortcode);
                      setShowEmoji(false);
                    }}
                  >
                    {e.char}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ToolbarButton title="HTML comment" onClick={() => insertText('<!--  -->')}>
            {Ic('<polyline points="15 4 19 8 15 12"/><polyline points="9 12 5 8 9 4"/><path d="M5 20h14"/>')}
          </ToolbarButton>
        </div>
      )}
      <div
        ref={wysiwygHostRef}
        className="md-editor__wysiwyg"
        style={{ display: mode === 'wysiwyg' ? 'block' : 'none' }}
      />
      <div
        ref={rawHostRef}
        className="md-editor__raw"
        style={{ display: mode === 'markdown' ? 'block' : 'none' }}
      />
    </div>
  );
}

// ProseMirror plugin: scan text nodes for `:shortcode:` patterns and
// add inline decorations that visually replace them with the emoji
// glyph. The underlying text is never modified — markdown source stays
// canonical (`:smile:` in the file, 😄 on screen). This matches the
// GitHub model.
const SHORTCODE_RE_GLOBAL = /:([a-zA-Z0-9_+\-]+):/g;
const emojiShortcodeDecoration = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          const decos: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (!node.isText) return true;
            const text = node.text ?? '';
            SHORTCODE_RE_GLOBAL.lastIndex = 0;
            let m: RegExpExecArray | null;
            while ((m = SHORTCODE_RE_GLOBAL.exec(text)) !== null) {
              const glyph = getEmojiChar(m[1]);
              if (!glyph) continue;
              const from = pos + m.index;
              const to = from + m[0].length;
              decos.push(
                Decoration.inline(from, to, {
                  class: 'md-emoji-shortcode',
                  'data-emoji': glyph,
                }),
              );
            }
            return true;
          });
          return DecorationSet.create(state.doc, decos);
        },
      },
    }),
);

// A compact set of the most-used emojis. The user can always type
// `:shortcode:` directly in the editor for anything not in this picker.
const COMMON_EMOJI: Array<{ char: string; shortcode: string }> = [
  { char: '😀', shortcode: ':grinning:' },
  { char: '😄', shortcode: ':smile:' },
  { char: '😅', shortcode: ':sweat_smile:' },
  { char: '😂', shortcode: ':joy:' },
  { char: '🙂', shortcode: ':slightly_smiling_face:' },
  { char: '😉', shortcode: ':wink:' },
  { char: '😊', shortcode: ':blush:' },
  { char: '🤔', shortcode: ':thinking:' },
  { char: '😎', shortcode: ':sunglasses:' },
  { char: '🤩', shortcode: ':star_struck:' },
  { char: '🥳', shortcode: ':partying_face:' },
  { char: '😢', shortcode: ':cry:' },
  { char: '😡', shortcode: ':rage:' },
  { char: '😴', shortcode: ':sleeping:' },
  { char: '🙄', shortcode: ':roll_eyes:' },
  { char: '👍', shortcode: ':thumbsup:' },
  { char: '👎', shortcode: ':thumbsdown:' },
  { char: '👏', shortcode: ':clap:' },
  { char: '🙏', shortcode: ':pray:' },
  { char: '💪', shortcode: ':muscle:' },
  { char: '🙌', shortcode: ':raised_hands:' },
  { char: '🤝', shortcode: ':handshake:' },
  { char: '🫡', shortcode: ':saluting_face:' },
  { char: '👀', shortcode: ':eyes:' },
  { char: '❤️', shortcode: ':heart:' },
  { char: '💔', shortcode: ':broken_heart:' },
  { char: '🔥', shortcode: ':fire:' },
  { char: '✨', shortcode: ':sparkles:' },
  { char: '⭐', shortcode: ':star:' },
  { char: '🎉', shortcode: ':tada:' },
  { char: '🎊', shortcode: ':confetti_ball:' },
  { char: '🎁', shortcode: ':gift:' },
  { char: '✅', shortcode: ':white_check_mark:' },
  { char: '❌', shortcode: ':x:' },
  { char: '⚠️', shortcode: ':warning:' },
  { char: '🚀', shortcode: ':rocket:' },
  { char: '💡', shortcode: ':bulb:' },
  { char: '📝', shortcode: ':memo:' },
  { char: '📌', shortcode: ':pushpin:' },
  { char: '🔗', shortcode: ':link:' },
  { char: '🐛', shortcode: ':bug:' },
  { char: '☕', shortcode: ':coffee:' },
  { char: '🍕', shortcode: ':pizza:' },
  { char: '🎂', shortcode: ':birthday:' },
  { char: '🌍', shortcode: ':earth_africa:' },
  { char: '☀️', shortcode: ':sunny:' },
  { char: '🌙', shortcode: ':crescent_moon:' },
  { char: '🌈', shortcode: ':rainbow:' },
];

// CodeMirror 6 themes (inline so we don't pull a separate package).
const lightTheme = EditorView.theme(
  {
    '&': { height: '100%', fontSize: '14px' },
    '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '14px' },
    '.cm-gutters': { background: '#fafafa', color: '#999', border: 'none' },
  },
  { dark: false },
);

const darkTheme = EditorView.theme(
  {
    '&': { height: '100%', fontSize: '14px', background: '#0d1117', color: '#e6edf3' },
    '.cm-content': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', padding: '14px', caretColor: '#e6edf3' },
    '.cm-gutters': { background: '#0d1117', color: '#6e7681', border: 'none' },
    '.cm-activeLine': { background: '#161b22' },
    '.cm-activeLineGutter': { background: '#161b22' },
    '.cm-selectionBackground, .cm-content ::selection': { background: '#264f78' },
  },
  { dark: true },
);
