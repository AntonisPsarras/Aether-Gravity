import { reportStorageIssue, StorageOperationError } from './browserStorage';

export interface WorldLease { writable: boolean; release: () => void }
const owned = new Set<string>();
const locks = (): LockManager | undefined => typeof navigator === 'undefined' ? undefined : navigator.locks;
export const ownsWorld = (id: string): boolean => owned.has(id);

/** Hold the Web Lock until the editor closes, including synchronous pagehide saves. */
export function acquireWorld(id: string): Promise<WorldLease> {
  const manager = locks();
  if (!manager) return Promise.resolve({ writable: false, release() {} });
  return new Promise(resolve => {
    void manager.request(`aether:editor:${id}`, { ifAvailable: true }, async lock => {
      if (!lock) { resolve({ writable: false, release() {} }); return; }
      owned.add(id);
      await new Promise<void>(release => resolve({
        writable: true,
        release: () => { owned.delete(id); release(); },
      }));
    }).catch(() => resolve({ writable: false, release() {} }));
  });
}

/** All archive read-modify-write operations share this exclusive origin lock. */
export async function mutateArchive<T>(operation: () => T): Promise<T> {
  const manager = locks();
  if (!manager) {
    const issue = { kind: 'unavailable' as const, message: 'Safe editing requires browser storage locks.' };
    reportStorageIssue(issue);
    throw new StorageOperationError(issue);
  }
  return manager.request('aether:archive', operation);
}

/** Deletion must not race an editor, even though metadata has its own lock. */
export async function mutateClosedWorld<T>(id: string, operation: () => T): Promise<T> {
  const lease = await acquireWorld(id);
  if (!lease.writable) {
    const issue = { kind: 'conflict' as const, message: 'Close this universe in other tabs before deleting it.' };
    reportStorageIssue(issue);
    throw new StorageOperationError(issue);
  }
  try { return await mutateArchive(operation); }
  finally { lease.release(); }
}
