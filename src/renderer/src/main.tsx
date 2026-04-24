import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

document.documentElement.classList.add(`platform-${window.api.platform}`);

const host = document.getElementById('root');
if (!host) throw new Error('Root element missing');

// StrictMode is intentionally NOT used here: its development-mode double-mount
// of effects breaks Milkdown / ProseMirror because the first editor's DOM is
// torn down under the feet of the second instance.
createRoot(host).render(<App />);
