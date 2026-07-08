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
  createCodeBlockCommand,
} from '@milkdown/kit/preset/commonmark';
import {
  gfm,
  toggleStrikethroughCommand,
  addRowBeforeCommand,
  addRowAfterCommand,
  addColBeforeCommand,
  addColAfterCommand,
  selectRowCommand,
  selectColCommand,
  selectTableCommand,
  deleteSelectedCellsCommand,
  setAlignCommand,
} from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { clipboard } from '@milkdown/kit/plugin/clipboard';
import { Slice } from '@milkdown/kit/prose/model';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';
import { Decoration, DecorationSet } from '@milkdown/kit/prose/view';
import { TextSelection } from '@milkdown/kit/prose/state';
import { callCommand, $prose } from '@milkdown/kit/utils';
import '@milkdown/kit/prose/tables/style/tables.css';
import { get as getEmojiChar } from 'node-emoji';
import { nord } from '@milkdown/theme-nord';
import '@milkdown/theme-nord/style.css';
import { prism } from '@milkdown/plugin-prism';
import 'prismjs/themes/prism.css';
import { EditorView, keymap, lineNumbers, highlightActiveLine, Decoration as CmDecoration, type DecorationSet as CmDecorationSet } from '@codemirror/view';
import { EditorState, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history as cmHistory, historyKeymap } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';

export type EditorMode = 'wysiwyg' | 'markdown';

// Exposed so App.tsx can drive find in whichever editor is active.
// Both the Milkdown (WYSIWYG) and CodeMirror (raw markdown) editors
// have their own find state; the same find bar drives both.
export interface FindHandles {
  milkdown: Editor | null;
  codemirror: EditorView | null;
}
export const findApi = {
  setQuery: (handles: FindHandles, q: string): void => {
    if (handles.milkdown) {
      handles.milkdown.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.setMeta(findPluginKey, { setQuery: q }));
      });
    }
    if (handles.codemirror) {
      handles.codemirror.dispatch({ effects: cmSetFindQuery.of(q) });
    }
  },
  advance: (handles: FindHandles, step: 1 | -1): void => {
    if (handles.milkdown) {
      handles.milkdown.action((ctx) => {
        const view = ctx.get(editorViewCtx);
        view.dispatch(view.state.tr.setMeta(findPluginKey, { advance: step }));
      });
    }
    if (handles.codemirror) {
      handles.codemirror.dispatch({ effects: cmAdvanceFind.of(step) });
    }
  },
};

interface Props {
  initialValue: string;
  mode: EditorMode;
  dark: boolean;
  /** Reserved for future raw-HTML pass-through toggle. */
  sanitize: boolean;
  onChange: (markdown: string) => void;
  /** Fired with handles to BOTH underlying editors as they become
      ready. Lets App.tsx drive find / format commands from outside. */
  onEditorReady?: (handles: FindHandles) => void;
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
export function MarkdownEditor({ initialValue, mode, dark, sanitize: _sanitize, onChange, onEditorReady }: Props): JSX.Element {
  const onEditorReadyRef = useRef(onEditorReady);
  onEditorReadyRef.current = onEditorReady;
  const wysiwygHostRef = useRef<HTMLDivElement>(null);
  const rawHostRef = useRef<HTMLDivElement>(null);
  const milkdownRef = useRef<Editor | null>(null);
  const cmRef = useRef<EditorView | null>(null);
  const valueRef = useRef(initialValue);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [editorReady, setEditorReady] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [tableHover, setTableHover] = useState<{ rows: number; cols: number }>({ rows: 0, cols: 0 });
  const [hasSelection, setHasSelection] = useState(false);
  const [inTable, setInTable] = useState(false);
  const [showTableTools, setShowTableTools] = useState(false);
  const [tableContext, setTableContext] = useState<{ x: number; y: number } | null>(null);
  // Mutable handle to the cell DOM element the user right-clicked in.
  // Stored on a ref (not state) so it doesn't trigger re-renders and is
  // always read at the moment the menu item fires.
  const tableContextCellRef = useRef<HTMLElement | null>(null);
  const tableContextRef = useRef<HTMLDivElement>(null);
  // Whether the first row of every table is styled distinctly (bold +
  // tinted background) like Word/GitHub do. The row is ALWAYS the
  // header in GFM markdown; this toggle only affects appearance.
  const [headerRowStyled, setHeaderRowStyled] = useState(false);
  const tablePickerRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const tableToolsRef = useRef<HTMLDivElement>(null);

  // Keep popovers inside the viewport. When the popover would overflow
  // the right edge of the window, shift it left so it stays visible.
  useEffect(() => {
    const clamp = (el: HTMLElement | null): void => {
      if (!el) return;
      el.style.left = '0px';
      const rect = el.getBoundingClientRect();
      const overflow = rect.right - window.innerWidth + 12;
      if (overflow > 0) el.style.left = `-${overflow}px`;
    };
    if (showTablePicker) clamp(tablePickerRef.current);
    if (showEmoji) clamp(emojiPickerRef.current);
    if (showTableTools) clamp(tableToolsRef.current);
  }, [showTablePicker, showEmoji, showTableTools]);

  // Click-outside-to-close for all toolbar popovers.
  useEffect(() => {
    if (!showTablePicker && !showEmoji && !showTableTools) return;
    const handler = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const insidePopover =
        target.closest('.md-table-picker') ||
        target.closest('.md-emoji-picker') ||
        target.closest('.md-table-tools') ||
        target.closest('.md-toolbar');
      if (insidePopover) return;
      setShowTablePicker(false);
      setShowEmoji(false);
      setShowTableTools(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showTablePicker, showEmoji, showTableTools]);
  const [imageModal, setImageModal] = useState<{ src: string; alt: string } | null>(null);
  const [linkModal, setLinkModal] = useState<{ href: string; text: string } | null>(null);
  const [commentModal, setCommentModal] = useState<{ text: string } | null>(null);
  const [footnoteModal, setFootnoteModal] = useState<{ text: string } | null>(null);

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
            valueRef.current = cleanMarkdownSource(md);
            onChangeRef.current(valueRef.current);
          });
        })
        .config(nord)
        .use(commonmark)
        .use(gfm)
        .use(history)
        .use(listener)
        .use(clipboard)
        .use(inlineMarkdownDecorations)
        .use(findInDocPlugin)
        .use(
          $prose(
            () =>
              new Plugin({
                view() {
                  return {
                    update(v, prev) {
                      const cur = v.state.selection;
                      const old = prev.selection;
                      const curHas = cur.from !== cur.to;
                      const oldHas = old.from !== old.to;
                      if (curHas !== oldHas) setHasSelection(curHas);
                      // Detect if the cursor sits inside a table cell.
                      const $pos = v.state.doc.resolve(cur.from);
                      let nowInTable = false;
                      for (let i = $pos.depth; i > 0; i--) {
                        const t = $pos.node(i).type.name;
                        if (t === 'table_cell' || t === 'table_header' || t === 'table_row' || t === 'table') {
                          nowInTable = true;
                          break;
                        }
                      }
                      setInTable((wasInTable) => (wasInTable !== nowInTable ? nowInTable : wasInTable));
                    },
                  };
                },
              }),
          ),
        )
        .use(prism)
        .create();

      if (destroyed) {
        await editor.destroy();
        return;
      }
      milkdownRef.current = editor;
      setEditorReady(true);
      onEditorReadyRef.current?.({
        milkdown: editor,
        codemirror: cmRef.current,
      });

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
          cmFindField,
          cmFindScrollPlugin,
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
    // If Milkdown is already ready, refresh the handles with the new
    // CodeMirror reference so App.tsx can drive both.
    if (milkdownRef.current) {
      onEditorReadyRef.current?.({
        milkdown: milkdownRef.current,
        codemirror: view,
      });
    }
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

  // ---------------- Click-to-jump footnote references ----------------
  // Click a `[^N]` ref in WYSIWYG -> scroll the matching `[^N]:`
  // definition into view. Document-level capture phase so ProseMirror
  // can't swallow the event before we see it (same trick we use for
  // external link clicks above).
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      const ref = target?.closest?.('.md-footnote-ref');
      if (!ref) return;
      const wy = wysiwygHostRef.current;
      if (!wy || !wy.contains(ref)) return;
      const fn = ref.getAttribute('data-fn');
      if (!fn) return;
      e.preventDefault();
      e.stopPropagation();
      const def = wy.querySelector(
        `.md-footnote-def-marker[data-fn="${CSS.escape(fn)}"]`,
      );
      if (def) {
        def.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, []);

  // ---------------- Click-to-open external links ----------------
  // ProseMirror absorbs click/mousedown on anchors inside contenteditable.
  // We listen at the document level in capture phase, scoped to anchors
  // inside our editor hosts, so nothing the editor does can stop us.
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.('a');
      if (!anchor) return;
      const wy = wysiwygHostRef.current;
      const raw = rawHostRef.current;
      const insideOurs =
        (wy && wy.contains(anchor)) || (raw && raw.contains(anchor));
      if (!insideOurs) return;
      const href = anchor.getAttribute('href');
      if (!href) return;
      if (!/^(https?|mailto):/i.test(href)) return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      if (import.meta.env.DEV) {
        console.log('[link click]', href);
      }
      void window.api.openExternal(href);
    };
    document.addEventListener('click', handler, true);
    document.addEventListener('mousedown', handler, true);
    return () => {
      document.removeEventListener('click', handler, true);
      document.removeEventListener('mousedown', handler, true);
    };
  }, []);

  // ---------------- Right-click context menu inside table cells ----------------
  // When the user right-clicks inside a table cell, suppress the
  // default menu, place the cursor at the click position so the
  // following table command targets the correct column, then show
  // our custom menu.
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      const cell = target?.closest?.('td, th');
      if (!cell) {
        setTableContext(null);
        return;
      }
      const wy = wysiwygHostRef.current;
      if (!wy || !wy.contains(cell)) return;
      e.preventDefault();
      e.stopPropagation();
      tableContextCellRef.current = cell as HTMLElement;
      // Place the ProseMirror cursor inside the right-clicked cell so
      // that table commands (add row, delete col, etc.) target THIS
      // cell rather than wherever the cursor happened to be before the
      // right-click. Without this, only `alignColumnAt` works
      // correctly from the context menu — every other action runs
      // against a stale selection.
      const editor = milkdownRef.current;
      if (editor) {
        editor.action((mctx) => {
          const view = mctx.get(editorViewCtx);
          let pos: number | null = null;
          try {
            pos = view.posAtDOM(cell as HTMLElement, 0);
          } catch {
            pos = null;
          }
          if (pos != null && pos >= 0) {
            try {
              view.dispatch(
                view.state.tr.setSelection(
                  TextSelection.near(view.state.doc.resolve(pos)),
                ),
              );
            } catch {
              // ignore selection failures
            }
          }
        });
      }
      setTableContext({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);

  // Keep the context menu inside the viewport. After it mounts we
  // measure its rect and shift it left/up if it overflows.
  useEffect(() => {
    if (!tableContext) return;
    const el = tableContextRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let { x, y } = tableContext;
    const overflowX = rect.right - window.innerWidth + 8;
    const overflowY = rect.bottom - window.innerHeight + 8;
    if (overflowX > 0) x -= overflowX;
    if (overflowY > 0) y -= overflowY;
    if (x !== tableContext.x || y !== tableContext.y) {
      el.style.left = `${Math.max(8, x)}px`;
      el.style.top = `${Math.max(8, y)}px`;
    }
  }, [tableContext]);

  // Close the table context menu on any click outside it or on Escape.
  useEffect(() => {
    if (!tableContext) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('.md-table-context-menu')) return;
      setTableContext(null);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setTableContext(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [tableContext]);

  // ---------------- Force focus into table cells on mousedown ----------------
  // ProseMirror sometimes leaves the click handling incomplete inside
  // table cells (the contenteditable doesn't fully take focus), so
  // we explicitly call .focus() after each mousedown that lands in a
  // cell. Belt-and-suspenders for the "I clicked but nothing happened"
  // class of bugs.
  useEffect(() => {
    const wy = wysiwygHostRef.current;
    if (!wy) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement | null;
      const cell = target?.closest?.('td, th');
      if (!cell) return;
      // Defer one tick so ProseMirror finishes its own mousedown handling
      // before we force focus / drop the caret into the click point.
      setTimeout(() => {
        const editor = milkdownRef.current;
        if (!editor) return;
        editor.action((ctx) => {
          const view = ctx.get(editorViewCtx);
          if (view.hasFocus()) return;
          view.focus();
        });
      }, 0);
    };
    wy.addEventListener('mousedown', onDown);
    return () => wy.removeEventListener('mousedown', onDown);
  }, []);

  // ---------------- Spell-check on code regions ----------------
  // REMOVED: this used to run a MutationObserver that called
  // setAttribute('spellcheck','false') on <pre>/<code> elements inside the
  // Milkdown (ProseMirror) DOM. Mutating ProseMirror-managed DOM from
  // outside is unsafe: ProseMirror's own DOMObserver detects the external
  // mutation, runs readDOMChange, and re-reads the DOM selection — which
  // collapsed any in-progress mouse text-selection (confirmed via the
  // dispatch stack: readDOMChange <- DOMObserver.flush). That made text
  // impossible to select or copy across headings / block boundaries in
  // WYSIWYG. Browser spell-check on code regions can be reinstated later in
  // a ProseMirror-native way (a node/inline decoration that sets the
  // spellcheck attribute, so ProseMirror owns it and no external mutation
  // fights the DOMObserver).

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

  // ---------------------------------------------------------------------
  // Milkdown 7.21.1 workaround: direct column-alignment mutation.
  // ---------------------------------------------------------------------
  // `setAlignCommand` (Milkdown) -> `setCellAttr('alignment', ...)`
  // (prosemirror-tables) only updates the cell at the current
  // TextSelection. Milkdown's table serializer reads alignment ONLY
  // from the header row, so updating a body-row cell never affects the
  // markdown source. Selecting the whole column first via
  // `selectColCommand` + `setAlignCommand` was unreliable due to
  // selection routing across separate `editor.action()` calls.
  //
  // We bypass the command system entirely: walk the doc from the
  // right-clicked table, find every cell at the target column index,
  // and dispatch one transaction with `tr.setNodeMarkup` per cell.
  //
  // CHECK ON LIBRARY UPGRADE: if upstream fixes setAlignCommand to
  // apply to the whole column (including the header row), this can
  // collapse to a single `run(setAlignCommand, align)` call. Verify
  // by: cursor in body row, run setAlignCommand, save, check whether
  // the markdown's `:---:` colons appear in the separator row.
  const alignColumnAt = (
    _ctx: { x: number; y: number } | null,
    align: 'left' | 'center' | 'right',
  ): void => {
    let cellEl = tableContextCellRef.current;
    // Guard against stale ref: if the cell got detached between
    // right-click and menu-item click (re-render, autosave, another
    // command firing), try to re-resolve it at the original screen
    // coords.
    if (cellEl && !document.contains(cellEl)) {
      const ctx = tableContext;
      cellEl = ctx
        ? ((document.elementFromPoint(ctx.x, ctx.y) as HTMLElement | null)?.closest?.(
            'td, th',
          ) as HTMLElement | null) ?? null
        : null;
      tableContextCellRef.current = cellEl;
    }
    if (!cellEl) return;
    const rowEl = cellEl.parentElement;
    if (!rowEl) return;
    const colIndex = Array.from(rowEl.children).indexOf(cellEl);
    if (colIndex < 0) return;
    const tableEl = cellEl.closest('table');
    if (!tableEl) return;

    const editor = milkdownRef.current;
    if (!editor) return;

    editor.action((mctx) => {
      const view = mctx.get(editorViewCtx);
      // Resolve the DOM table back to a ProseMirror table node so we
      // know where to walk from.
      let tablePos: number | null = null;
      try {
        tablePos = view.posAtDOM(tableEl, 0);
      } catch {
        tablePos = null;
      }
      if (tablePos == null || tablePos < 0) return;
      const $pos = view.state.doc.resolve(tablePos);
      let tableNode: { node: import('@milkdown/kit/prose/model').Node; start: number } | null = null;
      for (let depth = $pos.depth; depth >= 0; depth--) {
        const candidate = $pos.node(depth);
        if (candidate.type.name === 'table') {
          tableNode = { node: candidate, start: $pos.before(depth) };
          break;
        }
      }
      if (!tableNode) return;

      const { node: table, start } = tableNode;
      let tr = view.state.tr;
      // Each table contains rows. Each row contains cells.
      // We want the cell at index colIndex within every row.
      table.descendants((node, pos) => {
        if (node.type.name === 'table_cell' || node.type.name === 'table_header') {
          // Find the row this cell belongs to and its index within the row.
          const $cellPos = view.state.doc.resolve(start + pos + 1);
          for (let d = $cellPos.depth; d >= 0; d--) {
            const row = $cellPos.node(d);
            if (row.type.name === 'table_row' || row.type.name === 'table_header_row') {
              const indexInRow = $cellPos.index(d);
              if (indexInRow === colIndex) {
                tr = tr.setNodeMarkup(start + pos + 1, null, {
                  ...node.attrs,
                  alignment: align,
                });
              }
              break;
            }
          }
        }
        // Don't descend into cells.
        return node.type.name !== 'table_cell' && node.type.name !== 'table_header';
      });
      view.dispatch(tr);
    });
  };

  // Same as alignColumnAt but uses the current selection (used by the
  // ribbon dropdown — cursor is already where the user wants it).
  const alignCurrentColumn = (
    align: 'left' | 'center' | 'right',
  ): void => {
    run(selectColCommand);
    run(setAlignCommand, align);
  };

  // Wrap the current selection with a marker. For sub/sup, the
  // marker is a pair of HTML tag strings (open, close); for
  // highlight (`==`), the marker is the same string on both sides.
  // Before wrapping, any existing matching wrapping (any of our
  // known styles) is stripped from around AND within the selection,
  // so toggling between sub and sup, or applying twice, swaps
  // cleanly instead of nesting. Inspired by MarkText's
  // "clear-format-then-apply" pattern in `formatCtrl.js`.
  //
  // Toolbar buttons that use this are wired with `needsSelection`, so
  // the function is only invoked with a real selection.
  type Wrapper = { open: string; close: string };
  const KNOWN_WRAPPERS: Wrapper[] = [
    { open: '<sub>', close: '</sub>' },
    { open: '<sup>', close: '</sup>' },
    { open: '==', close: '==' },
    { open: '~', close: '~' }, // legacy
    { open: '^', close: '^' }, // legacy
  ];

  const wrapSelection = (open: string, close: string = open): void => {
    const e = milkdownRef.current;
    if (!e) return;
    e.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      let { from, to } = view.state.selection;
      if (from === to) return;

      const doc = view.state.doc;
      const docSize = doc.content.size;

      // Step 1: expand the selection outward if it's already wrapped
      // by any known marker pair, then we'll strip them below.
      for (const w of KNOWN_WRAPPERS) {
        const before = doc.textBetween(Math.max(0, from - w.open.length), from, ' ');
        const after = doc.textBetween(to, Math.min(docSize, to + w.close.length), ' ');
        if (before === w.open && after === w.close) {
          from -= w.open.length;
          to += w.close.length;
          break;
        }
      }

      let selected = doc.textBetween(from, to, ' ');

      // Step 2: iteratively strip ALL known wrapper pairs anywhere
      // inside the selected text. Handles cases where the user
      // selects across multiple existing wrappers, or where a single
      // wrap got applied twice.
      let prev = '';
      while (prev !== selected) {
        prev = selected;
        for (const w of KNOWN_WRAPPERS) {
          const openRe = new RegExp(escapeRegex(w.open), 'g');
          const closeRe = new RegExp(escapeRegex(w.close), 'g');
          if (w.open === w.close) {
            // Single-char marker (=, ~, ^): strip leading and trailing
            // occurrences but leave any inside if they're isolated.
            selected = selected
              .replace(new RegExp('^' + escapeRegex(w.open)), '')
              .replace(new RegExp(escapeRegex(w.close) + '$'), '');
          } else {
            // Asymmetric tag pair: strip every open and every close
            // tag anywhere in the selection.
            selected = selected.replace(openRe, '').replace(closeRe, '');
          }
        }
      }

      const text = open + selected + close;
      view.dispatch(view.state.tr.insertText(text, from, to));
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
    needsSelection,
  }: {
    title: string;
    onClick: () => void;
    children: React.ReactNode;
    needsSelection?: boolean;
  }): JSX.Element => {
    const disabled = !editorReady || (needsSelection === true && !hasSelection);
    const fullTitle = needsSelection && !hasSelection ? `${title} (select text first)` : title;
    return (
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        title={fullTitle}
        aria-label={fullTitle}
      >
        {children}
      </button>
    );
  };

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
    <div className={`md-editor md-editor--${mode} ${dark ? 'md-editor--dark' : ''} ${headerRowStyled ? 'md-editor--header-row-styled' : ''}`}>
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
          <ToolbarButton title="Highlight" needsSelection onClick={() => wrapSelection('==')}>
            <span
              style={{
                background: '#fff59d',
                color: '#1a1a1a',
                padding: '2px 6px',
                borderRadius: '3px',
                fontWeight: 700,
                fontSize: '14px',
              }}
            >
              A
            </span>
          </ToolbarButton>
          <ToolbarButton title="Subscript" needsSelection onClick={() => wrapSelection('<sub>', '</sub>')}>
            {Ic('<path d="m4 5 8 8"/><path d="m12 5-8 8"/><path d="M20 19h-4c0-1.5.44-2 1.5-2.5S20 15.33 20 14c0-.47-.17-.93-.48-1.29a2.11 2.11 0 0 0-2.62-.44c-.42.24-.74.62-.9 1.07"/>')}
          </ToolbarButton>
          <ToolbarButton title="Superscript" needsSelection onClick={() => wrapSelection('<sup>', '</sup>')}>
            {Ic('<path d="m4 19 8-8"/><path d="m12 19-8-8"/><path d="M20 12h-4c0-1.5.442-2 1.5-2.5S20 8.334 20 7.002c0-.472-.17-.93-.484-1.29a2.105 2.105 0 0 0-2.617-.436c-.42.239-.738.614-.899 1.06"/>')}
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
          <div style={{ position: 'relative', display: 'inline-flex', gap: 2 }}>
            <ToolbarButton
              title="Insert table"
              onClick={() => {
                setShowTablePicker((v) => !v);
                setTableHover({ rows: 0, cols: 0 });
              }}
            >
              {Ic('<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/>')}
            </ToolbarButton>
            <button
              type="button"
              className="md-toolbar__chevron"
              disabled={!editorReady || !inTable}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setShowTableTools((v) => !v)}
              title={inTable ? 'Table operations' : 'Table operations (cursor must be in a table)'}
              aria-label="Table operations"
            >
              ▾
            </button>
            {showTableTools && inTable && (
              <div ref={tableToolsRef} className="md-table-tools" role="menu">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { run(addRowBeforeCommand); setShowTableTools(false); }}
                >
                  ↑ Insert row above
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { run(addRowAfterCommand); setShowTableTools(false); }}
                >
                  ↓ Insert row below
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { run(addColBeforeCommand); setShowTableTools(false); }}
                >
                  ← Insert column left
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { run(addColAfterCommand); setShowTableTools(false); }}
                >
                  → Insert column right
                </button>
                <hr />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    const e = milkdownRef.current;
                    if (!e) return;
                    run(selectRowCommand);
                    run(deleteSelectedCellsCommand);
                    setShowTableTools(false);
                  }}
                >
                  Delete row
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    run(selectColCommand);
                    run(deleteSelectedCellsCommand);
                    setShowTableTools(false);
                  }}
                >
                  Delete column
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    run(selectTableCommand);
                    run(deleteSelectedCellsCommand);
                    setShowTableTools(false);
                  }}
                >
                  Delete table
                </button>
                <hr />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { alignCurrentColumn('left'); setShowTableTools(false); }}
                >
                  Align column left
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { alignCurrentColumn('center'); setShowTableTools(false); }}
                >
                  Align column center
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { alignCurrentColumn('right'); setShowTableTools(false); }}
                >
                  Align column right
                </button>
                <hr />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setHeaderRowStyled((v) => !v);
                    setShowTableTools(false);
                  }}
                >
                  {headerRowStyled ? '✓ ' : ''}Style first row as header
                </button>
              </div>
            )}
            {showTablePicker && (
              <div ref={tablePickerRef} className="md-table-picker" role="dialog" aria-label="Table size picker">
                <div className="md-table-picker__grid">
                  {Array.from({ length: 8 }, (_, r) =>
                    Array.from({ length: 10 }, (_, c) => {
                      const rows = r + 1;
                      const cols = c + 1;
                      const lit = rows <= tableHover.rows && cols <= tableHover.cols;
                      return (
                        <div
                          key={`${r}-${c}`}
                          className={`md-table-picker__cell ${lit ? 'md-table-picker__cell--lit' : ''}`}
                          onMouseEnter={() => setTableHover({ rows, cols })}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            setShowTablePicker(false);
                            // Each cell holds a literal non-breaking
                            // space (U+00A0) so cells render visually
                            // empty but contain real text content,
                            // which is required to make them clickable
                            // and prevents Milkdown from replacing
                            // empty cells with <br/> placeholders.
                            const cells = (n: number): string =>
                              ' ' + Array.from({ length: n }, () => ' ').join(' | ') + ' ';
                            const sep = (n: number): string =>
                              ' ' + Array.from({ length: n }, () => '---').join(' | ') + ' ';
                            const headerRow = `|${cells(cols)}|`;
                            const sepRow = `|${sep(cols)}|`;
                            const bodyRows = Array.from(
                              { length: Math.max(rows - 1, 1) },
                              () => `|${cells(cols)}|`,
                            ).join('\n');
                            const md = `${headerRow}\n${sepRow}\n${bodyRows}`;
                            const editor = milkdownRef.current;
                            if (!editor) return;
                            editor.action((ctx) => {
                              const view = ctx.get(editorViewCtx);
                              const parse = ctx.get(parserCtx);
                              const parsed = parse(md);
                              if (!parsed) return;
                              view.dispatch(
                                view.state.tr.replaceSelection(
                                  new Slice(parsed.content, 0, 0),
                                ),
                              );
                            });
                          }}
                        />
                      );
                    }),
                  )}
                </div>
                <div className="md-table-picker__label">
                  {tableHover.rows > 0 && tableHover.cols > 0
                    ? `${tableHover.cols} × ${tableHover.rows} table`
                    : 'Hover a cell to choose size'}
                </div>
              </div>
            )}
          </div>
          <ToolbarButton
            title="Image"
            onClick={() => setImageModal({ src: '', alt: '' })}
          >
            {Ic('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>')}
          </ToolbarButton>
          <ToolbarButton
            title="Link"
            onClick={() => {
              const e = milkdownRef.current;
              const selectedText = e
                ? e.action((ctx) => {
                    const view = ctx.get(editorViewCtx);
                    const { from, to } = view.state.selection;
                    return view.state.doc.textBetween(from, to, ' ');
                  })
                : '';
              setLinkModal({ href: '', text: (selectedText as string) ?? '' });
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
              <div ref={emojiPickerRef} className="md-emoji-picker" role="dialog" aria-label="Emoji picker">
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
          <ToolbarButton
            title="Footnote"
            onClick={() => setFootnoteModal({ text: '' })}
          >
            {Ic('<line x1="3" y1="4" x2="18" y2="4"/><line x1="3" y1="7" x2="18" y2="7"/><line x1="3" y1="10" x2="18" y2="10"/><line x1="13" y1="12" x2="13" y2="17"/><polyline points="10 15 13 18 16 15"/><rect x="3" y="20" width="18" height="3" fill="currentColor" stroke="none"/>')}
          </ToolbarButton>
          <ToolbarButton
            title="HTML comment"
            onClick={() => setCommentModal({ text: '' })}
          >
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
      {imageModal && (
        <InsertModal
          title="Insert image"
          fields={[
            { key: 'src', label: 'Image URL or path', value: imageModal.src, autoFocus: true, required: true },
            { key: 'alt', label: 'Description (shown on hover and if the image fails to load)', value: imageModal.alt },
          ]}
          onCancel={() => setImageModal(null)}
          onSubmit={(values) => {
            setImageModal(null);
            const src = values.src.trim();
            if (!src) return;
            const alt = values.alt;
            const e = milkdownRef.current;
            if (!e) return;
            e.action((ctx) => {
              const view = ctx.get(editorViewCtx);
              const imageType = view.state.schema.nodes.image;
              if (!imageType) {
                // Fall back to the command if the schema's image node is
                // unexpectedly missing.
                run(insertImageCommand, { src, alt });
                return;
              }
              const node = imageType.create({ src, alt, title: alt || null });
              view.dispatch(view.state.tr.replaceSelectionWith(node, false));
            });
          }}
        />
      )}
      {linkModal && (
        <InsertModal
          title="Insert link"
          fields={[
            { key: 'href', label: 'Link URL', value: linkModal.href, autoFocus: true, required: true },
            { key: 'text', label: 'Link text', value: linkModal.text },
          ]}
          onCancel={() => setLinkModal(null)}
          onSubmit={(values) => {
            setLinkModal(null);
            let href = values.href.trim();
            if (!href) return;
            // Auto-prepend https:// for bare domain entries (e.g. "cnn.com").
            // Leaves explicit schemes (http, https, mailto, file, etc.) alone.
            if (!/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(href) && !href.startsWith('//')) {
              href = `https://${href}`;
            }
            const text = values.text || href;
            const e = milkdownRef.current;
            if (!e) return;
            e.action((ctx) => {
              const view = ctx.get(editorViewCtx);
              const linkMark = view.state.schema.marks.link;
              if (!linkMark) return;
              const { from, to } = view.state.selection;
              const tr = view.state.tr.insertText(text, from, to);
              const insertFrom = from;
              const insertTo = from + text.length;
              tr.addMark(insertFrom, insertTo, linkMark.create({ href, title: null }));
              view.dispatch(tr);
            });
          }}
        />
      )}
      {tableContext && (
        <div
          ref={tableContextRef}
          className="md-table-context-menu"
          role="menu"
          style={{ left: tableContext.x, top: tableContext.y }}
        >
          <button
            type="button"
            onClick={() => { run(addRowBeforeCommand); setTableContext(null); }}
          >Insert row above</button>
          <button
            type="button"
            onClick={() => { run(addRowAfterCommand); setTableContext(null); }}
          >Insert row below</button>
          <button
            type="button"
            onClick={() => { run(addColBeforeCommand); setTableContext(null); }}
          >Insert column left</button>
          <button
            type="button"
            onClick={() => { run(addColAfterCommand); setTableContext(null); }}
          >Insert column right</button>
          <hr />
          <button
            type="button"
            onClick={() => {
              run(selectRowCommand);
              run(deleteSelectedCellsCommand);
              setTableContext(null);
            }}
          >Delete row</button>
          <button
            type="button"
            onClick={() => {
              run(selectColCommand);
              run(deleteSelectedCellsCommand);
              setTableContext(null);
            }}
          >Delete column</button>
          <button
            type="button"
            onClick={() => {
              run(selectTableCommand);
              run(deleteSelectedCellsCommand);
              setTableContext(null);
            }}
          >Delete table</button>
          <hr />
          <button
            type="button"
            onClick={() => { alignColumnAt(tableContext, 'left'); setTableContext(null); }}
          >Align column left</button>
          <button
            type="button"
            onClick={() => { alignColumnAt(tableContext, 'center'); setTableContext(null); }}
          >Align column center</button>
          <button
            type="button"
            onClick={() => { alignColumnAt(tableContext, 'right'); setTableContext(null); }}
          >Align column right</button>
          <hr />
          <button
            type="button"
            onClick={() => {
              setHeaderRowStyled((v) => !v);
              setTableContext(null);
            }}
          >{headerRowStyled ? '✓ ' : ''}Style first row as header</button>
        </div>
      )}
      {footnoteModal && (
        <InsertModal
          title="Insert footnote"
          fields={[
            {
              key: 'text',
              label: 'Footnote text (appears at the end of the document)',
              value: footnoteModal.text,
              autoFocus: true,
              required: true,
            },
          ]}
          onCancel={() => setFootnoteModal(null)}
          onSubmit={(values) => {
            setFootnoteModal(null);
            const footnoteText = values.text.trim();
            if (!footnoteText) return;
            const editor = milkdownRef.current;
            if (!editor) return;
            editor.action((mctx) => {
              const view = mctx.get(editorViewCtx);
              const serialize = mctx.get(serializerCtx);
              // Find the next available footnote number by scanning
              // the current source for [^N] references.
              const source = serialize(view.state.doc);
              const usedNumbers = new Set<number>();
              const re = /\[\^(\d+)\]/g;
              let m: RegExpExecArray | null;
              while ((m = re.exec(source)) !== null) {
                usedNumbers.add(parseInt(m[1], 10));
              }
              let n = 1;
              while (usedNumbers.has(n)) n++;

              const ref = `[^${n}]`;
              const def = `\n\n[^${n}]: ${footnoteText}\n`;
              const { from, to } = view.state.selection;
              let tr = view.state.tr.insertText(ref, from, to);
              const docEnd = tr.doc.content.size;
              tr = tr.insertText(def, docEnd, docEnd);
              view.dispatch(tr);
            });
          }}
        />
      )}
      {commentModal && (
        <InsertModal
          title="Insert HTML comment"
          fields={[
            {
              key: 'text',
              label: 'Comment text (will be wrapped in <!-- ... -->)',
              value: commentModal.text,
              autoFocus: true,
            },
          ]}
          onCancel={() => setCommentModal(null)}
          onSubmit={(values) => {
            setCommentModal(null);
            const inner = values.text.trim();
            const value = `<!-- ${inner || 'comment'} -->`;
            const e = milkdownRef.current;
            if (!e) return;
            e.action((ctx) => {
              const view = ctx.get(editorViewCtx);
              const htmlType = view.state.schema.nodes.html;
              if (!htmlType) return;
              const node = htmlType.create({ value });
              view.dispatch(view.state.tr.replaceSelectionWith(node, false));
            });
          }}
        />
      )}
    </div>
  );
}

// In-app modal for "give me a URL + text" prompts. Styled to look like
// part of the app (matches AboutDialog / UpdateModal aesthetics).
interface ModalField {
  key: string;
  label: string;
  value: string;
  autoFocus?: boolean;
  required?: boolean;
}

function InsertModal({
  title,
  fields,
  onCancel,
  onSubmit,
}: {
  title: string;
  fields: ModalField[];
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => void;
}): JSX.Element {
  const [values, setValues] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((f) => [f.key, f.value])),
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const canSubmit = fields.every((f) => !f.required || (values[f.key] ?? '').trim().length > 0);

  return (
    <div className="md-modal-overlay" role="presentation" onClick={onCancel}>
      <div
        className="md-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="md-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="md-modal-title" className="md-modal__title">{title}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) onSubmit(values);
          }}
        >
          {fields.map((f) => (
            <label key={f.key} className="md-modal__field">
              <span>{f.label}</span>
              <input
                type="text"
                value={values[f.key] ?? ''}
                autoFocus={f.autoFocus}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
              />
            </label>
          ))}
          <div className="md-modal__actions">
            <button type="button" className="md-modal__btn md-modal__btn--ghost" onClick={onCancel}>
              Cancel
            </button>
            <button
              type="submit"
              className="md-modal__btn md-modal__btn--primary"
              disabled={!canSubmit}
            >
              Insert
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// CodeMirror find state (mirrors the Milkdown plugin below so the same
// find bar in App.tsx can drive either editor).
// ---------------------------------------------------------------------------
interface CmFindState {
  query: string;
  matches: FindMatch[];
  current: number;
}

const cmSetFindQuery = StateEffect.define<string>();
const cmAdvanceFind = StateEffect.define<number>();

function cmComputeMatches(text: string, query: string): FindMatch[] {
  if (!query) return [];
  const matches: FindMatch[] = [];
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let idx = 0;
  while (idx <= lowerText.length) {
    const found = lowerText.indexOf(lowerQuery, idx);
    if (found === -1) break;
    matches.push({ from: found, to: found + lowerQuery.length });
    idx = found + lowerQuery.length;
  }
  return matches;
}

const cmFindField = StateField.define<CmFindState>({
  create: () => ({ query: '', matches: [], current: -1 }),
  update(state, tr) {
    let next = state;
    for (const eff of tr.effects) {
      if (eff.is(cmSetFindQuery)) {
        const matches = cmComputeMatches(tr.state.doc.toString(), eff.value);
        next = {
          query: eff.value,
          matches,
          current: matches.length > 0 ? 0 : -1,
        };
      } else if (eff.is(cmAdvanceFind) && next.matches.length > 0) {
        const len = next.matches.length;
        const c = ((next.current + eff.value) % len + len) % len;
        next = { ...next, current: c };
      }
    }
    if (tr.docChanged && next.query && !tr.effects.some((e) => e.is(cmSetFindQuery))) {
      const matches = cmComputeMatches(tr.state.doc.toString(), next.query);
      next = {
        ...next,
        matches,
        current:
          matches.length === 0
            ? -1
            : Math.min(Math.max(next.current, 0), matches.length - 1),
      };
    }
    return next;
  },
  provide: (f) =>
    EditorView.decorations.from(f, (value): CmDecorationSet => {
      const builder = new RangeSetBuilder<CmDecoration>();
      value.matches.forEach((m, i) => {
        builder.add(
          m.from,
          m.to,
          CmDecoration.mark({
            class:
              i === value.current ? 'md-find-match md-find-match--current' : 'md-find-match',
          }),
        );
      });
      return builder.finish();
    }),
});

const cmFindScrollPlugin = EditorView.updateListener.of((u) => {
  const f = u.state.field(cmFindField, false);
  if (!f || f.current < 0) return;
  const prevF = u.startState.field(cmFindField, false);
  if (prevF && prevF.current === f.current && !u.docChanged) return;
  const match = f.matches[f.current];
  if (!match) return;
  u.view.dispatch({
    effects: EditorView.scrollIntoView(match.from, { y: 'center' }),
  });
});

// ---------------------------------------------------------------------------
// Find-in-doc plugin
// ---------------------------------------------------------------------------
// Built directly on top of ProseMirror so we don't have to fight
// Chromium's `findInPage` (which steals DOM focus to the matched word
// on every call, making live "find-as-you-type" impossible).
//
// State holds the query, the list of match ranges in document order,
// and the index of the currently focused match. Matches are
// recomputed whenever the query or the doc changes.
//
// Communication from React:
//   - Set / change query:      view.dispatch(setMeta(findKey, { setQuery: 'foo' }))
//   - Jump to next match:      view.dispatch(setMeta(findKey, { advance: 1 }))
//   - Jump to previous match:  view.dispatch(setMeta(findKey, { advance: -1 }))
//   - Clear:                   view.dispatch(setMeta(findKey, { setQuery: '' }))

interface FindMatch {
  from: number;
  to: number;
}
interface FindState {
  query: string;
  matches: FindMatch[];
  current: number;
}

const findPluginKey = new PluginKey<FindState>('hashmarkup-find');

function computeMatches(doc: { descendants: (fn: (node: { isText?: boolean; text?: string | null }, pos: number) => boolean | void) => void }, query: string): FindMatch[] {
  if (!query) return [];
  const matches: FindMatch[] = [];
  const lower = query.toLowerCase();
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const text = (node.text ?? '').toLowerCase();
    let idx = 0;
    while (idx <= text.length) {
      const found = text.indexOf(lower, idx);
      if (found === -1) break;
      matches.push({ from: pos + found, to: pos + found + lower.length });
      idx = found + lower.length;
    }
    return true;
  });
  return matches;
}

const findInDocPlugin = $prose(
  () =>
    new Plugin<FindState>({
      key: findPluginKey,
      state: {
        init: () => ({ query: '', matches: [], current: -1 }),
        apply(tr, prev) {
          const meta = tr.getMeta(findPluginKey) as
            | { setQuery?: string; advance?: number }
            | undefined;
          let next: FindState = prev;

          if (meta?.setQuery !== undefined) {
            const matches = computeMatches(tr.doc, meta.setQuery);
            next = {
              query: meta.setQuery,
              matches,
              current: matches.length > 0 ? 0 : -1,
            };
          } else if (meta?.advance && prev.matches.length > 0) {
            const len = prev.matches.length;
            const c = ((prev.current + meta.advance) % len + len) % len;
            next = { ...prev, current: c };
          } else if (tr.docChanged && prev.query) {
            const matches = computeMatches(tr.doc, prev.query);
            next = {
              ...prev,
              matches,
              current:
                matches.length === 0
                  ? -1
                  : Math.min(Math.max(prev.current, 0), matches.length - 1),
            };
          }

          return next;
        },
      },
      props: {
        decorations(state) {
          const f = findPluginKey.getState(state);
          if (!f || f.matches.length === 0) return DecorationSet.empty;
          const decos: Decoration[] = f.matches.map((m, i) =>
            Decoration.inline(m.from, m.to, {
              class:
                i === f.current ? 'md-find-match md-find-match--current' : 'md-find-match',
            }),
          );
          return DecorationSet.create(state.doc, decos);
        },
      },
      view() {
        return {
          update(view, prevState) {
            const f = findPluginKey.getState(view.state);
            const fPrev = findPluginKey.getState(prevState);
            if (!f || f.current < 0) return;
            // Only scroll when the current match actually changes (or
            // it just became valid). Avoids scrolling on every keystroke
            // while the user is typing into the doc.
            const prevCurrent = fPrev?.current ?? -1;
            const prevQuery = fPrev?.query ?? '';
            const currentChanged = f.current !== prevCurrent;
            const queryChanged = f.query !== prevQuery;
            if (!currentChanged && !queryChanged) return;
            const m = f.matches[f.current];
            if (!m) return;
            try {
              const { node } = view.domAtPos(m.from);
              const el = node.nodeType === 1
                ? (node as HTMLElement)
                : (node.parentElement as HTMLElement | null);
              el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } catch {
              // ignore scroll failures
            }
          },
        };
      },
    }),
);

// ---------------------------------------------------------------------------
// Milkdown 7.21.1 markdown-source cleanups
// ---------------------------------------------------------------------------
// Milkdown's GFM serializer has two behaviours that bleed into the saved
// markdown file:
//   1. Empty table cells become `<br/>` (which then makes the cell
//      unclickable when the file is reopened, since ProseMirror lays a
//      `<br>` over the cell's only insertion point).
//   2. Cells that started life as a non-breaking space (our table picker
//      seeds new cells with U+00A0 so they're clickable in WYSIWYG)
//      keep that NBSP in front of any text the user types: ` Hi`
//      makes it into both the source and any PDF/HTML export as a stray
//      indent.
// Both are post-processed here on every `markdownUpdated` event. The
// cleaner walks the source line-by-line so it's code-fence aware: it
// won't strip `<br/>` from a ```js example``` that happens to contain
// pipes, and won't touch NBSP characters that the user typed deliberately
// inside prose.
//
// If a future Milkdown release fixes the empty-cell serializer (e.g.,
// emitting a true empty cell or NBSP instead of `<br/>`), the
// `<br/>`-stripping step here becomes a no-op and can be removed.
// To check: insert an empty 2x2 table via the picker, save the source,
// inspect the cells. If they're `|   |   |` (no `<br/>`), the upstream
// fix is in and this can go.
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
const CODE_FENCE_RE = /^\s*(```|~~~)/;

function cleanMarkdownSource(md: string): string {
  const lines = md.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (CODE_FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (!TABLE_ROW_RE.test(line)) continue;

    // Inside a table row: strip <br/> placeholders left by the
    // serializer, and trim lone leading/trailing NBSPs from cells
    // that actually have content (so " Hello" -> "Hello").
    const cleaned = line.replace(/<br\s*\/?>/g, ' ');
    const cells = cleaned.split('|');
    for (let c = 0; c < cells.length; c++) {
      const raw = cells[c];
      // Preserve leading/trailing whitespace that's just for column
      // padding, but remove a lone NBSP next to real text.
      const trimmed = raw.trim();
      if (trimmed.length > 1) {
        const stripped = trimmed.replace(/^ +| +$/g, '');
        if (stripped !== trimmed) {
          cells[c] = ' ' + stripped + ' ';
        }
      }
    }
    lines[i] = cells.join('|');
  }
  return lines.join('\n');
}

// ProseMirror plugin: scan text nodes for `:shortcode:` patterns and
// add inline decorations that visually replace them with the emoji
// glyph. The underlying text is never modified — markdown source stays
// canonical (`:smile:` in the file, 😄 on screen). This matches the
// GitHub model.
const SHORTCODE_RE_GLOBAL = /:([a-zA-Z0-9_+\-]+):/g;
const HIGHLIGHT_RE_GLOBAL = /==([^=\n]+?)==/g;
// Sub/sup use HTML tags as the source format (inspired by MarkText's
// approach). HTML tags avoid the `\~` escape mangling Milkdown's
// serializer applies to single tildes (which collide with GFM
// strikethrough's `~~`) and they render natively in HTML/PDF.
const SUB_TAG_RE_GLOBAL = /<sub>([^<\n]+?)<\/sub>/gi;
const SUP_TAG_RE_GLOBAL = /<sup>([^<\n]+?)<\/sup>/gi;
// Legacy: `~text~` / `^text^` syntax. Kept so older saved files still
// render correctly. New content is written with HTML tags by the
// toolbar buttons. The negative lookbehind for `[` keeps `[^N]`
// footnote references from being mistakenly matched as superscripts.
const SUB_RE_GLOBAL = /(?<!\[)~([^~\s][^~\n]*?)~/g;
const SUP_RE_GLOBAL = /(?<!\[)\^([^\^\s][^\^\n]*?)\^/g;
// Footnote reference: `[^1]`, `[^label]`. Definitions live at column 0
// as `[^1]: text` and are handled at the line-start check below.
const FOOTNOTE_REF_RE_GLOBAL = /\[\^([^\]\n]+)\]/g;

const inlineMarkdownDecorations = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          const decos: Decoration[] = [];
          state.doc.descendants((node, pos) => {
            if (!node.isText) return true;
            const text = node.text ?? '';

            // Emoji shortcodes
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

            // Highlight (==text==) — markers hidden, content gets yellow bg.
            HIGHLIGHT_RE_GLOBAL.lastIndex = 0;
            while ((m = HIGHLIGHT_RE_GLOBAL.exec(text)) !== null) {
              const matchStart = pos + m.index;
              const matchEnd = matchStart + m[0].length;
              decos.push(
                Decoration.inline(matchStart, matchStart + 2, { class: 'md-syntax-marker' }),
              );
              decos.push(
                Decoration.inline(matchStart + 2, matchEnd - 2, { class: 'md-highlight' }),
              );
              decos.push(
                Decoration.inline(matchEnd - 2, matchEnd, { class: 'md-syntax-marker' }),
              );
            }

            // Subscript: <sub>text</sub> — open + close tags hidden,
            // inner content styled as a subscript.
            SUB_TAG_RE_GLOBAL.lastIndex = 0;
            while ((m = SUB_TAG_RE_GLOBAL.exec(text)) !== null) {
              const matchStart = pos + m.index;
              const matchEnd = matchStart + m[0].length;
              const openLen = '<sub>'.length;
              const closeLen = '</sub>'.length;
              decos.push(
                Decoration.inline(matchStart, matchStart + openLen, { class: 'md-syntax-marker' }),
              );
              decos.push(
                Decoration.inline(matchStart + openLen, matchEnd - closeLen, { class: 'md-subscript' }),
              );
              decos.push(
                Decoration.inline(matchEnd - closeLen, matchEnd, { class: 'md-syntax-marker' }),
              );
            }

            // Superscript: <sup>text</sup> — open + close tags hidden.
            SUP_TAG_RE_GLOBAL.lastIndex = 0;
            while ((m = SUP_TAG_RE_GLOBAL.exec(text)) !== null) {
              const matchStart = pos + m.index;
              const matchEnd = matchStart + m[0].length;
              const openLen = '<sup>'.length;
              const closeLen = '</sup>'.length;
              decos.push(
                Decoration.inline(matchStart, matchStart + openLen, { class: 'md-syntax-marker' }),
              );
              decos.push(
                Decoration.inline(matchStart + openLen, matchEnd - closeLen, { class: 'md-superscript' }),
              );
              decos.push(
                Decoration.inline(matchEnd - closeLen, matchEnd, { class: 'md-syntax-marker' }),
              );
            }

            // Footnote references: hide the literal `[^N]` text and
            // insert a real <a> widget at that position. Real anchor
            // = native pointer cursor + native click handling. Skip
            // definition lines (`[^N]: ...`) — those keep an inline
            // class for their own styling.
            FOOTNOTE_REF_RE_GLOBAL.lastIndex = 0;
            while ((m = FOOTNOTE_REF_RE_GLOBAL.exec(text)) !== null) {
              const matchStart = pos + m.index;
              const matchEnd = matchStart + m[0].length;
              const after = text.slice(m.index + m[0].length, m.index + m[0].length + 2);
              const isDefinition = after.startsWith(':');
              if (isDefinition) {
                decos.push(
                  Decoration.inline(matchStart, matchEnd, {
                    class: 'md-footnote-def-marker',
                    'data-fn': m[1],
                  }),
                );
              } else {
                const fn = m[1];
                // Hide the raw `[^N]` text in place.
                decos.push(
                  Decoration.inline(matchStart, matchEnd, {
                    class: 'md-footnote-ref-hidden',
                  }),
                );
                // Insert an actual anchor at the start of the range.
                // ProseMirror passes a fresh DOM node per render via a
                // factory; using a function lets us re-create per call.
                decos.push(
                  Decoration.widget(
                    matchStart,
                    () => {
                      const a = document.createElement('a');
                      a.href = `#fn-${fn}`;
                      a.textContent = `[${fn}]`;
                      a.className = 'md-footnote-ref';
                      a.setAttribute('data-fn', fn);
                      return a;
                    },
                    { side: -1 },
                  ),
                );
              }
            }

            return true;
          });

          // Pass 2: find `<sub>`/`<sup>` html-inline node PAIRS and
          // decorate the text between them. Milkdown's GFM preset parses
          // each tag as its own atom html node (rendered as literal
          // text), so the regex-on-text approach above can't see the
          // pattern as a single string. We walk the doc, collect every
          // html node in order, then pair openers with their closers and
          // emit decorations across the gap.
          interface TagSpan { open: string; close: string; cls: string; markerCls: string }
          const TAG_SPANS: TagSpan[] = [
            { open: '<sub>', close: '</sub>', cls: 'md-subscript', markerCls: 'md-syntax-marker' },
            { open: '<sup>', close: '</sup>', cls: 'md-superscript', markerCls: 'md-syntax-marker' },
          ];
          const htmlTags: Array<{ value: string; from: number; to: number }> = [];
          state.doc.descendants((node, pos) => {
            if (node.type.name === 'html') {
              const v = String((node.attrs as { value?: string }).value ?? '').toLowerCase();
              htmlTags.push({ value: v, from: pos, to: pos + node.nodeSize });
            }
            return true;
          });
          for (const span of TAG_SPANS) {
            for (let i = 0; i < htmlTags.length; i++) {
              if (htmlTags[i].value !== span.open) continue;
              // Find the nearest matching close at the same depth
              // (no nesting support, but enough for normal use).
              for (let j = i + 1; j < htmlTags.length; j++) {
                if (htmlTags[j].value === span.close) {
                  decos.push(
                    Decoration.inline(htmlTags[i].from, htmlTags[i].to, {
                      class: span.markerCls,
                    }),
                  );
                  if (htmlTags[j].from > htmlTags[i].to) {
                    decos.push(
                      Decoration.inline(htmlTags[i].to, htmlTags[j].from, {
                        class: span.cls,
                      }),
                    );
                  }
                  decos.push(
                    Decoration.inline(htmlTags[j].from, htmlTags[j].to, {
                      class: span.markerCls,
                    }),
                  );
                  i = j;
                  break;
                }
                if (htmlTags[j].value === span.open) break;
              }
            }
          }

          // Pass 3: re-walk for the legacy / other text-only patterns.
          state.doc.descendants((node, pos) => {
            if (!node.isText) return true;
            const text = node.text ?? '';
            let m: RegExpExecArray | null;

            // Backwards-compat: legacy `~text~` and `^text^` syntax from
            // earlier versions of the app. New content uses HTML tags.
            SUB_RE_GLOBAL.lastIndex = 0;
            while ((m = SUB_RE_GLOBAL.exec(text)) !== null) {
              const matchStart = pos + m.index;
              const matchEnd = matchStart + m[0].length;
              decos.push(
                Decoration.inline(matchStart, matchStart + 1, { class: 'md-syntax-marker' }),
              );
              decos.push(
                Decoration.inline(matchStart + 1, matchEnd - 1, { class: 'md-subscript' }),
              );
              decos.push(
                Decoration.inline(matchEnd - 1, matchEnd, { class: 'md-syntax-marker' }),
              );
            }
            SUP_RE_GLOBAL.lastIndex = 0;
            while ((m = SUP_RE_GLOBAL.exec(text)) !== null) {
              const matchStart = pos + m.index;
              const matchEnd = matchStart + m[0].length;
              decos.push(
                Decoration.inline(matchStart, matchStart + 1, { class: 'md-syntax-marker' }),
              );
              decos.push(
                Decoration.inline(matchStart + 1, matchEnd - 1, { class: 'md-superscript' }),
              );
              decos.push(
                Decoration.inline(matchEnd - 1, matchEnd, { class: 'md-syntax-marker' }),
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
