import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { App } from './App.tsx';
import { SessionProvider } from './lib/session.tsx';
import { DataProvider } from './lib/data.tsx';
import { initTheme } from './lib/theme.ts';

initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <DataProvider>
          <App />
        </DataProvider>
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
