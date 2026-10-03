'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { T } from '@/lib/copy';
import { IconVoice } from '../icons';
import { Button } from './Button';
import { cls } from './cls';

/** THE RECORDER (docs/DESIGN-SYSTEM-V4.md §5.18) — MediaRecorder in the browser. Record is a 48 px button (ivory
 *  while it is the section's primary), with a live input level (always LTR), a timer, and the consent statement the
 *  voice identity contract requires before anything is recorded: "This is my voice" or "I have the speaker's
 *  permission". Nothing is sent anywhere: the recording is handed to `onRecorded` with its consent, and the caller
 *  uploads it. */

export type ConsentStatement = 'MY_VOICE' | 'SPEAKER_PERMISSION';
type Phase = 'idle' | 'asking' | 'recording' | 'done' | 'denied' | 'unsupported';

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function Recorder({ onRecorded, primary, maxSeconds = 120, consent: controlled, onConsent, className = '' }: {
  onRecorded: (r: { blob: Blob; seconds: number; consent: ConsentStatement; mimeType: string }) => void;
  /** Record is this section's ivory primary */ primary?: boolean;
  /** recording stops by itself after this many seconds */ maxSeconds?: number;
  consent?: ConsentStatement | null; onConsent?: (c: ConsentStatement) => void; className?: string;
}) {
  const id = useId();
  const [own, setOwn] = useState<ConsentStatement | null>(null);
  const consent = controlled !== undefined ? controlled : own;
  const setConsent = (c: ConsentStatement) => { setOwn(c); onConsent?.(c); };
  const [phase, setPhase] = useState<Phase>('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const rec = useRef<{ mr: MediaRecorder; stream: MediaStream; ctx?: AudioContext; raf?: number; timer?: ReturnType<typeof setInterval>; started: number } | null>(null);

  const teardown = () => {
    const r = rec.current;
    if (!r) return;
    if (r.raf) cancelAnimationFrame(r.raf);
    if (r.timer) clearInterval(r.timer);
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx?.close().catch(() => undefined);
    rec.current = null;
    setLevel(0);
  };
  useEffect(() => () => teardown(), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const start = async () => {
    if (!consent) return;
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) { setPhase('unsupported'); return; }
    setPhase('asking');
    let stream: MediaStream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { setPhase('denied'); return; }
    const mr = new MediaRecorder(stream);
    const chunks: Blob[] = [];
    const started = performance.now();
    const statement = consent;
    mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      const secs = (performance.now() - started) / 1000;
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      teardown();
      setUrl(URL.createObjectURL(blob));
      setPhase('done');
      onRecorded({ blob, seconds: Math.round(secs * 10) / 10, consent: statement, mimeType: blob.type });
    };
    const r: NonNullable<typeof rec.current> = { mr, stream, started };
    rec.current = r;
    try {
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      const tick = () => { an.getFloatTimeDomainData(buf); let sum = 0; for (const v of buf) sum += v * v; setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 4)); r.raf = requestAnimationFrame(tick); };
      r.ctx = ctx;
      tick();
    } catch { /* the level is a convenience; recording goes on without it */ }
    r.timer = setInterval(() => { const s = (performance.now() - started) / 1000; setSeconds(s); if (s >= maxSeconds && mr.state === 'recording') mr.stop(); }, 200);
    setSeconds(0);
    setUrl(null);
    mr.start();
    setPhase('recording');
  };
  const stop = () => { if (rec.current?.mr.state === 'recording') rec.current.mr.stop(); };

  const recording = phase === 'recording';
  return (
    <div className={cls('recorder', className)}>
      <fieldset className="recorder-consent">
        <legend className="label">{T('kit.rec.consent')}</legend>
        {(['MY_VOICE', 'SPEAKER_PERMISSION'] as const).map((c) => (
          <label key={c} className="flex cursor-pointer items-center gap-2.5 text-sm">
            <input type="radio" name={`${id}-consent`} className="check" checked={consent === c} disabled={recording} onChange={() => setConsent(c)} required />
            {T(c === 'MY_VOICE' ? 'kit.rec.mine' : 'kit.rec.permission')}
          </label>
        ))}
      </fieldset>
      <div className="recorder-row">
        {recording
          ? <Button size="lg" variant="secondary" onClick={stop} icon={<span aria-hidden className="recorder-stop" />}>{T('kit.rec.stop')}</Button>
          : <Button size="lg" variant={primary ? 'primary' : 'secondary'} icon={<IconVoice />} onClick={() => void start()} disabled={!consent || phase === 'asking'} aria-describedby={!consent ? `${id}-why` : undefined}>{phase === 'done' ? T('kit.rec.again') : T('kit.rec.record')}</Button>}
        <span className="recorder-meter" dir="ltr" role="meter" aria-label={T('kit.rec.level')} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)}><span style={{ inlineSize: `${Math.round(level * 100)}%` }} /></span>
        <span className="tc" aria-live="off">{mmss(seconds)}</span>
      </div>
      {!consent && <p id={`${id}-why`} className="help">{T('kit.rec.needConsent')}</p>}
      {phase === 'denied' && <p role="alert" className="help text-bad">{T('kit.rec.denied')}</p>}
      {phase === 'unsupported' && <p role="alert" className="help text-bad">{T('kit.rec.unsupported')}</p>}
      {recording && <p className="sr-only" role="status">{T('kit.rec.recording')}</p>}
      {url && phase === 'done' && <audio src={url} controls className="recorder-preview" aria-label={T.f('kit.rec.recorded', { time: mmss(seconds) })} />}
    </div>
  );
}
