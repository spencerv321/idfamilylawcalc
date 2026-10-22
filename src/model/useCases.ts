import { useCallback, useEffect, useRef, useState } from 'react';
import { newCase, type CaseFile } from './case';
import { deleteCase, listCases, saveCase } from './storage';

/**
 * The open case plus the saved-case list. Edits are applied to a clone, so
 * callers can mutate freely inside `update`. Saving is debounced. A brand-new
 * blank case isn't saved until it is first edited, so opening the app doesn't
 * litter the list with "Untitled case".
 */
/**
 * @param initial A case to open instead of the most recent saved one (e.g. a
 * handoff from the quick estimator). It isn't saved until edited.
 */
export function useCases(initial?: () => CaseFile | null) {
  const [cases, setCases] = useState<CaseFile[]>([]);
  const [current, setCurrent] = useState<CaseFile>(() => newCase());
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const pending = useRef<CaseFile | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setCases(await listCases());
    } catch (e) {
      setStorageError(`Saved cases are unavailable in this browser (${(e as Error).message}). Use Export to keep your work.`);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const all = await listCases();
        setCases(all);
        const handoff = initial?.();
        if (handoff) setCurrent(handoff);
        else if (all[0]) setCurrent(all[0]);
      } catch (e) {
        setStorageError(`Saved cases are unavailable in this browser (${(e as Error).message}). Use Export to keep your work.`);
      }
      setLoaded(true);
    })();
  }, []);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const c = pending.current;
    pending.current = null;
    if (!c) return;
    try {
      await saveCase(c);
      await refresh();
    } catch (e) {
      setStorageError(`Could not save (${(e as Error).message}). Use Export to keep your work.`);
    }
  }, [refresh]);

  useEffect(() => {
    const onHide = () => void flush();
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [flush]);

  const update = useCallback(
    (mutate: (draft: CaseFile) => void) => {
      setCurrent((prev) => {
        const next = structuredClone(prev);
        mutate(next);
        next.updatedAt = new Date().toISOString();
        pending.current = next;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => void flush(), 400);
        return next;
      });
    },
    [flush],
  );

  const open = useCallback(
    async (c: CaseFile, opts: { save?: boolean } = {}) => {
      await flush();
      setCurrent(c);
      if (opts.save) {
        try {
          await saveCase(c);
          await refresh();
        } catch (e) {
          setStorageError(`Could not save (${(e as Error).message}).`);
        }
      }
    },
    [flush, refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      if (pending.current?.id === id) pending.current = null;
      await deleteCase(id);
      const all = await listCases();
      setCases(all);
      if (current.id === id) setCurrent(all[0] ?? newCase());
    },
    [current.id],
  );

  return { cases, current, loaded, storageError, update, open, remove, refresh };
}
