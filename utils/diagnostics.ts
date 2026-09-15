/** Only fixed codes cross the production console boundary. Never pass user data. */
export type DiagnosticCode = 'render-failed' | 'promise-rejected' | 'native-init-failed' | 'native-listener-failed' | 'native-exit-failed';
export function reportDiagnostic(code: DiagnosticCode, detail?: unknown): void {
  if (import.meta.env.DEV) console.error(`[${code}]`, detail);
  else console.error(`Aether: ${code}`);
}

/** A native listener can resolve after React has already unmounted its owner. */
export function manageNativeListener(pending: Promise<{ remove: () => Promise<void> }>): () => void {
  let disposed = false;
  let handle: { remove: () => Promise<void> } | undefined;
  const remove = (value: { remove: () => Promise<void> }) => {
    void value.remove().catch(error => reportDiagnostic('native-listener-failed', error));
  };
  void pending.then(value => {
    if (disposed) remove(value);
    else handle = value;
  }).catch(error => reportDiagnostic('native-listener-failed', error));
  return () => { disposed = true; if (handle) { remove(handle); handle = undefined; } };
}
