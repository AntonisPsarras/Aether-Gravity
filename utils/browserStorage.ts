import { MAX_STORAGE_CHARS } from './worldValidation';

export type StorageIssueKind =
  | 'quota'
  | 'unavailable'
  | 'corrupt'
  | 'verification'
  | 'migration'
  | 'conflict';

export interface StorageIssue {
  kind: StorageIssueKind;
  key?: string;
  message: string;
}

export class StorageOperationError extends Error {
  readonly kind: StorageIssueKind;
  readonly key?: string;

  constructor(issue: StorageIssue, options?: ErrorOptions) {
    super(issue.message, options);
    this.name = 'StorageOperationError';
    this.kind = issue.kind;
    this.key = issue.key;
  }
}

type StorageIssueListener = (issue: StorageIssue) => void;

const listeners = new Set<StorageIssueListener>();
const pendingIssues: StorageIssue[] = [];
let lastIssueSignature = '';
let lastIssueAt = 0;

export const storageIssueMessage = (issue: StorageIssue): string => {
  switch (issue.kind) {
    case 'quota':
      return 'Device storage is full. Your latest change was not saved.';
    case 'unavailable':
      return 'Local storage is unavailable. Changes will last only for this session.';
    case 'corrupt':
      return 'Saved data could not be read safely. The original record was preserved.';
    case 'verification':
      return 'A storage write could not be verified. Your latest change was not saved.';
    case 'migration':
      return 'This legacy universe could not be upgraded safely. Its original save was preserved.';
    case 'conflict':
      return 'This universe changed in another tab. Saving was stopped to avoid overwriting it.';
  }
};

export const reportStorageIssue = (issue: StorageIssue): void => {
  const signature = `${issue.kind}:${issue.key ?? ''}:${issue.message}`;
  const now = Date.now();
  if (signature === lastIssueSignature && now - lastIssueAt < 1000) return;
  lastIssueSignature = signature;
  lastIssueAt = now;

  if (listeners.size === 0) {
    if (pendingIssues.length >= 16) pendingIssues.shift();
    pendingIssues.push(issue);
    return;
  }
  listeners.forEach((listener) => listener(issue));
};

export const subscribeStorageIssues = (listener: StorageIssueListener): (() => void) => {
  listeners.add(listener);
  if (pendingIssues.length > 0) {
    const queued = pendingIssues.splice(0, pendingIssues.length);
    queued.forEach(listener);
  }
  return () => listeners.delete(listener);
};

export const isQuotaError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const value = error as { name?: unknown; code?: unknown };
  return value.name === 'QuotaExceededError'
    || value.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || value.code === 22
    || value.code === 1014;
};

const fail = (kind: StorageIssueKind, key: string | undefined, message: string, cause?: unknown): never => {
  const issue = { kind, key, message } satisfies StorageIssue;
  reportStorageIssue(issue);
  throw new StorageOperationError(issue, cause === undefined ? undefined : { cause });
};

const storage = (): Storage => {
  try {
    if (typeof localStorage === 'undefined') {
      return fail('unavailable', undefined, 'localStorage is not available in this environment.');
    }
    return localStorage;
  } catch (error) {
    return fail('unavailable', undefined, 'localStorage access was blocked.', error);
  }
};

export const readStorageRaw = (key: string): string | null => {
  try {
    const raw = storage().getItem(key);
    if (raw !== null && raw.length > MAX_STORAGE_CHARS) return fail('corrupt', key, 'Saved record exceeds the supported size.');
    return raw;
  } catch (error) {
    if (error instanceof StorageOperationError) throw error;
    return fail('unavailable', key, `Could not read ${key}.`, error);
  }
};

export const readStorageJson = (key: string): unknown | null => {
  const raw = readStorageRaw(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    return fail('corrupt', key, `Stored JSON for ${key} is malformed.`, error);
  }
};

export const stringifyStorageJson = (key: string, value: unknown): string => {
  try {
    return JSON.stringify(value);
  } catch (error) {
    return fail('verification', key, `Could not serialize ${key}.`, error);
  }
};

export const writeStorageRawVerified = (key: string, value: string): void => {
  if (value.length > MAX_STORAGE_CHARS) fail('quota', key, 'Saved record exceeds the supported size.');
  try {
    storage().setItem(key, value);
  } catch (error) {
    if (error instanceof StorageOperationError) throw error;
    return fail(isQuotaError(error) ? 'quota' : 'unavailable', key, `Could not write ${key}.`, error);
  }

  let persisted: string | null;
  try {
    persisted = storage().getItem(key);
  } catch (error) {
    return fail('verification', key, `Could not verify ${key} after writing it.`, error);
  }
  if (persisted !== value) fail('verification', key, `Storage did not retain the complete value for ${key}.`);
};

export const writeStorageJsonVerified = (key: string, value: unknown): string => {
  const raw = stringifyStorageJson(key, value);
  writeStorageRawVerified(key, raw);
  return raw;
};

export const removeStorageVerified = (key: string): void => {
  try {
    storage().removeItem(key);
    if (storage().getItem(key) !== null) fail('verification', key, `Storage did not remove ${key}.`);
  } catch (error) {
    if (error instanceof StorageOperationError) throw error;
    return fail('unavailable', key, `Could not remove ${key}.`, error);
  }
};

export const storageFailureKind = (error: unknown): StorageIssueKind => {
  if (error instanceof StorageOperationError) return error.kind;
  return isQuotaError(error) ? 'quota' : 'unavailable';
};

export interface StorageUsage {
  bytes: number;
  keyCount: number;
  available: boolean;
}

export const CONSERVATIVE_LOCAL_STORAGE_BYTES = 5 * 1024 * 1024;

/** Conservative UTF-16 estimate for all Aether-owned keys. */
export const getAetherStorageUsage = (): StorageUsage => {
  try {
    const target = storage();
    let chars = 0;
    let keyCount = 0;
    for (let index = 0; index < target.length; index += 1) {
      const key = target.key(index);
      if (!key?.startsWith('aether:')) continue;
      chars += key.length + (target.getItem(key)?.length ?? 0);
      keyCount += 1;
    }
    return { bytes: chars * 2, keyCount, available: true };
  } catch {
    return { bytes: 0, keyCount: 0, available: false };
  }
};
