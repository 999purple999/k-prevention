import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import './index.css';
import { App } from './App.tsx';
import { SessionProvider } from './lib/session.tsx';
import { DataProvider } from './lib/data.tsx';
import { initTheme } from './lib/theme.ts';
import { DEMO } from './lib/demo.ts';

initTheme();

// In demo (GitHub Pages) usa HashRouter: nessuna riscrittura server-side necessaria.
const Router = DEMO ? HashRouter : BrowserRouter;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <SessionProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </SessionProvider>
    </Router>
  </React.StrictMode>,
);
