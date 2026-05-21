import { Menu, BrowserWindow, clipboard } from 'electron';
import type { ContextMenuParams, WebContents, MenuItemConstructorOptions } from 'electron';

/**
 * Builds and pops the right-click context menu. Electron does not show one
 * automatically; without this, right-clicking does nothing useful (in
 * particular, misspelled words show the red underline but never offer
 * suggestions).
 *
 * Menu contents are dynamic based on what was right-clicked:
 *  - Misspelled word: dictionary suggestions + Add to Dictionary.
 *  - Any editable text: Undo/Redo/Cut/Copy/Paste/Paste & Match Style/Select All.
 *  - Non-editable text: Copy (if selection), Select All.
 *  - Link: Copy Link Address.
 *  - Image: Copy Image URL.
 */
export class ContextMenuBuilder {
  attach(window: BrowserWindow): void {
    window.webContents.on('context-menu', (_event, params) => {
      this.show(window, window.webContents, params);
    });
  }

  private show(
    window: BrowserWindow,
    webContents: WebContents,
    params: ContextMenuParams,
  ): void {
    const template: MenuItemConstructorOptions[] = [];

    // Spelling suggestions come first so they're the easiest to hit.
    if (params.misspelledWord) {
      if (params.dictionarySuggestions.length > 0) {
        for (const suggestion of params.dictionarySuggestions) {
          template.push({
            label: suggestion,
            click: () => webContents.replaceMisspelling(suggestion),
          });
        }
      } else {
        template.push({ label: 'No suggestions', enabled: false });
      }
      template.push({ type: 'separator' });
      template.push({
        label: 'Add to Dictionary',
        click: () =>
          webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord),
      });
      template.push({ type: 'separator' });
    }

    if (params.isEditable) {
      template.push(
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { type: 'separator' },
        { role: 'selectAll' },
      );
    } else {
      if (params.selectionText) {
        template.push({ role: 'copy' });
      }
      if (params.linkURL) {
        template.push({
          label: 'Copy Link Address',
          click: () => clipboard.writeText(params.linkURL),
        });
      }
      if (params.mediaType === 'image' && params.srcURL) {
        template.push({
          label: 'Copy Image URL',
          click: () => clipboard.writeText(params.srcURL),
        });
      }
      if (template.length > 0) template.push({ type: 'separator' });
      template.push({ role: 'selectAll' });
    }

    if (template.length === 0) return;

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window });
  }
}
