'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** SESSION DRAFTS (docs/DESIGN-SYSTEM-V4.md §5.15, §5.18 "Carry-over", WCAG 3.3.7) — what the producer typed is kept
 *  in sessionStorage under a key per kind and context (`new:show`, `new:episode:<season>`, `note:<decision>`), so a
 *  failure, a method switch (Auto ⇄ Manual) or a reload never asks for it twice. Read after mount, so the server's
 *  markup and the first client render agree. Storage that is full or blocked is ignored: the draft is a convenience. */

export function readSession<T>(key: string): T | undefined {
  try { const raw = sessionStorage.getItem(key); return raw === null ? undefined : (JSON.parse(raw) as T); } catch { return undefined; }
}
export function writeSession(key: string, value: unknown) {
  try { if (value === undefined || value === null || value === '') sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* a convenience */ }
}

/** `[draft, setDraft, clear]` kept under `key` (null: not kept). `clear` after the object was made. */
export function useSessionDraft<T>(key: string | null, initial: T): [T, (v: T | ((prev: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (!key) return;
    const stored = readSession<T>(key);
    loaded.current = key;
    if (stored !== undefined) setValue(stored);
  }, [key]);
  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
      if (key) writeSession(key, next);
      return next;
    });
  }, [key]);
  const clear = useCallback(() => { if (key) writeSession(key, null); setValue(initial); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return [value, set, clear];
}
