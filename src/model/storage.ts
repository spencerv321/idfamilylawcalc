/**
 * Local-first storage. Cases live in this browser's IndexedDB and nowhere else;
 * JSON export/import is how they move between machines.
 */
import { openDB, type IDBPDatabase } from 'idb';
import { normalizeCase, type CaseFile } from './case';

const DB_NAME = 'idaho-child-support';
const STORE = 'cases';

let dbPromise: Promise<IDBPDatabase> | null = null;
const db = () =>
  (dbPromise ??= openDB(DB_NAME, 1, {
    upgrade(d) {
      d.createObjectStore(STORE, { keyPath: 'id' });
    },
  }));

export async function listCases(): Promise<CaseFile[]> {
  const all = (await (await db()).getAll(STORE)) as unknown[];
  const cases: CaseFile[] = [];
  for (const raw of all) {
    try {
      cases.push(normalizeCase(raw));
    } catch {
      // Skip records written by a future, incompatible version.
    }
  }
  return cases.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function saveCase(c: CaseFile): Promise<void> {
  await (await db()).put(STORE, c);
}

export async function deleteCase(id: string): Promise<void> {
  await (await db()).delete(STORE, id);
}

export function exportCaseJson(c: CaseFile): Blob {
  return new Blob([JSON.stringify(c, null, 2)], { type: 'application/json' });
}

export interface Backup {
  schema: 'idaho-child-support-backup';
  version: 1;
  exportedAt: string;
  cases: CaseFile[];
}

export function exportBackupJson(cases: CaseFile[]): Blob {
  const backup: Backup = { schema: 'idaho-child-support-backup', version: 1, exportedAt: new Date().toISOString(), cases };
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
}

/** Reads either a single exported case or a full backup. */
export async function importJson(file: File): Promise<CaseFile[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} is not valid JSON.`);
  }
  const p = parsed as Partial<Backup>;
  if (p && p.schema === 'idaho-child-support-backup') {
    if (p.version !== 1 || !Array.isArray(p.cases)) throw new Error('Unsupported backup file version.');
    return p.cases.map((c) => normalizeCase(c));
  }
  return [normalizeCase(parsed)];
}

/**
 * Merge imported cases into the saved list. An identical case (same id and
 * same last edit) is skipped; a same-id case with different content is kept
 * as a copy, so restoring a backup never overwrites newer work.
 */
export async function mergeImported(incoming: CaseFile[], existing: CaseFile[], newId: () => string) {
  const byId = new Map(existing.map((c) => [c.id, c]));
  let added = 0;
  let skipped = 0;
  const saved: CaseFile[] = [];
  for (const c of incoming) {
    const have = byId.get(c.id);
    if (have && have.updatedAt === c.updatedAt) {
      skipped++;
      continue;
    }
    const copy = have ? { ...c, id: newId(), title: `${c.title} (imported)` } : c;
    await saveCase(copy);
    saved.push(copy);
    added++;
  }
  return { added, skipped, saved };
}

// The last backup time is a per-browser convenience, so localStorage is fine.
const BACKUP_KEY = 'lastBackupAt';
const SNOOZE_KEY = 'backupReminderSnoozedUntil';

export function markBackedUp() {
  try {
    localStorage.setItem(BACKUP_KEY, new Date().toISOString());
  } catch {
    /* storage unavailable */
  }
}

export function snoozeBackupReminder(days: number) {
  try {
    localStorage.setItem(SNOOZE_KEY, new Date(Date.now() + days * 86_400_000).toISOString());
  } catch {
    /* storage unavailable */
  }
}

/**
 * Cases edited since the last backup, when a reminder is due: never backed
 * up, or the last backup is over a week old. Empty while snoozed.
 */
export function casesNeedingBackup(cases: CaseFile[], now = new Date()): CaseFile[] {
  let last = '';
  let snoozed = '';
  try {
    last = localStorage.getItem(BACKUP_KEY) ?? '';
    snoozed = localStorage.getItem(SNOOZE_KEY) ?? '';
  } catch {
    return [];
  }
  if (snoozed && snoozed > now.toISOString()) return [];
  if (last && now.getTime() - Date.parse(last) < 7 * 86_400_000) return [];
  return cases.filter((c) => c.updatedAt > last);
}

/** Ask the browser not to evict saved cases under storage pressure. Best effort. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFilename = (s: string) => s.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'case';
