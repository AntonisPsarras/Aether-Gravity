// WebView console output is visible in device logs. Keep only fixed diagnostics.
// before the rest of the production module graph runs.
if (import.meta.env.PROD && typeof console !== 'undefined') {
  for (const method of ['log', 'debug', 'info'] as const) {
    Object.defineProperty(console, method, {
      value: () => undefined,
      configurable: true,
      writable: true,
    });
  }
  for (const method of ['warn', 'error'] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      const code = args[0];
      const allowed = typeof code === 'string' && /^Aether: (render-failed|promise-rejected|native-init-failed|native-listener-failed|native-exit-failed|native-haptic-failed)$/.test(code);
      original(allowed ? code : `Aether: runtime-${method}`);
    };
  }
}
