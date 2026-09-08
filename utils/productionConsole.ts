// WebView console output is visible in device logs. Silence application and
// vendor diagnostics before the rest of the production module graph runs.
if (import.meta.env.PROD && typeof console !== 'undefined') {
  for (const method of ['log', 'debug', 'info', 'warn', 'error'] as const) {
    Object.defineProperty(console, method, {
      value: () => undefined,
      configurable: true,
      writable: true,
    });
  }
}
