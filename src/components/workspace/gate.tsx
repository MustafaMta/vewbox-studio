'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { JobPayload, JobType } from '@/domain/jobs';
import { useLive } from '@/studio/org';
import { JobButton } from '@/components/ui/jobs';
import { cls } from '@/components/ui/kit';

/** WHETHER THE STUDIO CAN MAKE SOMETHING RIGHT NOW — the two real states the generation controls must show while
 *  generation is paused (docs/design/PAGE-ENGINEERING-BRIEF.md §3): job intake paused (GET /api/health `intake`), and an
 *  engine offline (GET /api/status, per engine). A control whose job cannot be taken renders disabled with the reason
 *  in words beside it; nothing here starts a job by itself. */

const PAUSED = 'Intake is paused: new work waits until the studio resumes.';

export type Engine ='video' | 'images' | 'voice' | 'story' | 'music';
interface Health { intake?: { paused: boolean; since?: string | null; reason?: string | null } | null }
type Engines = Partial<Record<Engine, { ok?: boolean; detail?: string } | undefined>>;

export interface StudioGate {
  /** null while the server has not answered */
  paused: boolean | null;
  pausedSince: string | null;
  offline: (engine: Engine) => boolean;
  /** why a job on this engine cannot be taken now, in words; null when it can (or the state is not known yet) */
  blocked: (engine: Engine) => string | null;
}

export function useStudioGate(): StudioGate {
  const { data: health } = useLive<Health>('/api/health');
  const { data: engines } = useLive<Engines>('/api/status');
  const paused = health ? Boolean(health.intake?.paused) : null;
  const offline = (e: Engine) => Boolean(engines && engines[e] && engines[e]?.ok === false);
  const NAME: Record<Engine, string> = { video: 'The video engine', images: 'The picture engine', voice: 'The voice engine', story: 'The story engine', music: 'The music engine' };
  return {
    paused,
    pausedSince: health?.intake?.since ?? null,
    offline,
    blocked: (e) => (paused ? PAUSED :offline(e) ? `${NAME[e]} is offline.` : null),
  };
}

/** The studio's state as one line above the workspace, only when it is not ready: paused (new takes wait), or an engine
 *  offline. Its one action opens the Studio Company, where the producer resumes it. */
export function StudioLine({ gate, engines = ['video', 'images', 'voice'] }: { gate: StudioGate; engines?: Engine[] }) {
  const down = engines.filter((e) => gate.offline(e));
  if (!gate.paused && down.length === 0) return null;
  const NAMES: Record<Engine, string> = { video: 'video', images: 'pictures', voice: 'voices', story: 'story', music: 'music' };
  return (
    <div className="ws-studioline" role="status">
      <span className="state-dot" data-tone={gate.paused ? 'idle' : 'failed'} aria-hidden />
      {gate.paused ? (
        <span className="ws-studioline-words"><span className="ws-long">The studio is paused. You can edit and choose; new takes wait until you resume it.</span><span className="ws-short">Paused · new takes wait</span></span>
      ) : (
        <span className="ws-studioline-words">The engines for {down.map((e) => NAMES[e]).join(' and ')} are offline. You can edit and choose; nothing new can be made until they are back.</span>
      )}
      <Link className="ws-studioline-link" href={gate.paused ? '/studio' : '/settings#engines'}>{gate.paused ? 'Resume in the Studio Company' : 'Engines'}</Link>
    </div>
  );
}

/** A generation control in its real state: the kit's JobButton (it shows a running job's phase with Cancel, and a
 *  failure with its one recovery), disabled with the reason beside it while intake is paused or its engine is offline. */
export function GenButton<K extends JobType>({ gate, engine, type, payload, target, children, icon, variant = 'secondary', size = 'sm', disabled, reason, confirm, className }: {
  gate: StudioGate; /** the engine the job needs; none for work the studio's own machine does (assembling, exporting) */ engine?: Engine; type: K; payload: JobPayload<K>; target: { productionId?: string; shotId?: string }; children: ReactNode; icon?: ReactNode;
  variant?: 'primary' | 'secondary' | 'quiet'; size?: 'sm' | 'xs'; /** a reason of the page's own (a gate, missing frames) */ disabled?: boolean; reason?: string | null; confirm?: string; className?: string;
}) {
  const why = (engine ? gate.blocked(engine) : gate.paused ? PAUSED : null) ?? (disabled ? reason ?? null : null);
  return (
    <span className={cls('ws-gen', className)}>
      <JobButton type={type} payload={payload} target={target} variant={variant} size={size} icon={icon} disabled={Boolean(why) || disabled} title={why ?? undefined} confirm={confirm}>{children}</JobButton>
      {why && <span className="ws-gen-why">{why}</span>}
    </span>
  );
}
