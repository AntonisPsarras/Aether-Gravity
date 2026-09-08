import './utils/productionConsole';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installTestBridge } from './utils/testBridge';
import { isE2EMode } from './utils/e2eConfig';

if (import.meta.env.DEV && isE2EMode()) installTestBridge();

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[unhandledrejection]', event.reason);
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
