/** WHAT THE SHELL SAYS ABOUT SAVING — from the store's own queue, never assumed: "saved" only when no command is
 *  waiting or in flight; "saving" while some are; "not saved — retrying" once a send failed and commands are still
 *  held for the next attempt (audit D1: the shell said "Saved on the studio server" whenever the first snapshot had
 *  loaded, also while edits were queued or failing). A refused command is not unsaved: the server's copy is re-read
 *  and the refusal is shown as an error. */
export type SaveState = 'saved' | 'saving' | 'unsaved';

export function saveStateOf(q: { pending: number; inflight: number; failures: number }): SaveState {
  const waiting = q.pending + q.inflight;
  if (waiting === 0) return 'saved';
  return q.failures > 0 ? 'unsaved' : 'saving';
}
