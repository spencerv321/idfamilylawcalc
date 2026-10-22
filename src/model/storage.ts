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

export async function importCaseJson(file: File): Promise<CaseFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error(`${file.name} is not valid JSON.`);
  }
  return normalizeCase(parsed);
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
