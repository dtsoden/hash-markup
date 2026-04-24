declare module '@toast-ui/editor' {
  const Editor: typeof import('@toast-ui/editor/types').Editor;
  export default Editor;
  export * from '@toast-ui/editor/types';
}

declare module '@toast-ui/editor/dist/toastui-editor.css';
declare module '@toast-ui/editor/dist/theme/toastui-editor-dark.css';
declare module '@toast-ui/editor-plugin-color-syntax' {
  const plugin: unknown;
  export default plugin;
}
declare module '@toast-ui/editor-plugin-color-syntax/dist/toastui-editor-plugin-color-syntax.css';
declare module 'tui-color-picker/dist/tui-color-picker.css';
declare module '@toast-ui/editor-plugin-code-syntax-highlight/dist/toastui-editor-plugin-code-syntax-highlight-all.js' {
  const plugin: unknown;
  export default plugin;
}
declare module 'prismjs/themes/prism.css';
declare module '@toast-ui/editor-plugin-uml' {
  const plugin: unknown;
  export default plugin;
}
declare module '@toast-ui/editor-plugin-chart' {
  const plugin: unknown;
  export default plugin;
}
declare module '@toast-ui/chart/dist/toastui-chart.min.css';
