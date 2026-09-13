/**
 * Probe whether this document can create a WebGL2 context.
 * Safe to call before any R3F Canvas mounts; never throws.
 */
export function isWebGL2Available(): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  } catch {
    return false;
  }
}
