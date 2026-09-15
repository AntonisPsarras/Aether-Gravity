import './utils/productionConsole';
import { reportDiagnostic } from './utils/diagnostics';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installTestBridge } from './utils/testBridge';
import { isE2EMode } from './utils/e2eConfig';

if (import.meta.env.DEV && isE2EMode()) installTestBridge();

if (typeof window !== 'undefined') {
  window.addEventListener('error', event => {
    reportDiagnostic('render-failed', event.error);
    if (import.meta.env.PROD) event.preventDefault();
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportDiagnostic('promise-rejected', event.reason);
    // Prevent WebView's default rejection logger from printing the raw payload.
    if (import.meta.env.PROD) event.preventDefault();
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
