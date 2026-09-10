// WebView console output is visible in device logs. Silence verbose logging; retain warnings and errors for device diagnosis
// before the rest of the production module graph runs.
if (import.meta.env.PROD && typeof console !== 'undefined') {
  for (const method of ['log', 'debug', 'info'] as const) {
    Object.defineProperty(console, method, {
      value: () => undefined,
      configurable: true,
      writable: true,
    });
  }
}
