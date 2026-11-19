import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { applyTheme, loadSettings } from './storage.js';
import './styles.css';

// Apply the saved theme before the first paint to avoid a flash of the wrong colours.
applyTheme(loadSettings().theme);

const root = document.getElementById('root');
if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
