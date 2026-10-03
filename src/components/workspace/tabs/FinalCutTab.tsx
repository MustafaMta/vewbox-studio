'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Production } from '@/domain/types';
import { useStudio } from '@/studio/store';
import { assetById, castOf } from '@/studio/selectors';
import { cutVersionsOf } from '@/studio/selectors/cuts';
import { useToast } from '@/components/ui/toast';
import { Button, Field, PanelCard, SectionHead, Select, StateWord } from '@/components/ui/kit';
import { useStartJob } from '@/components/ui/jobs';
import { CanvasPlayer } from '@/components/players/CanvasPlayer';
import { IconDownload, IconFinalCut } from '@/components/ui/icons';
import { StageGate, useStageApproved } from '@/components/studio/Approve';
import { runtime, shortWhen } from '@/components/home/model';
import { fmtBytes } from '@/lib/format';
import { GenButton, type StudioGate } from '../gate';
import { CutLine } from '../ProductionMap';
import { orderedShots, frameRatioOf } from '../model';

/** EDITING AND THE FINAL CUT — the current cut on the canvas, every cut version (assembled from the selected takes, the
 *  newest first), the assembly it is made from (each selected take as wide as its shot), the subtitles written with it,
 *  the cut's approval (the human gate before export) and the exports. Assemble and Export are real jobs; while the
 *  studio is paused they say so instead of starting. */
export function FinalCutTab({ p, gate }: { p: Production; gate: StudioGate }) {
  const { state, act } = useStudio();
  const toast = useToast();
  const cuts = useMemo(() => cutVersionsOf(p, state.assets), [p, state.assets]);
  const [shownId, setShownId] = useState<string | null>(null);
  const current = cuts.find((c) => c.current) ?? cuts[cuts.length - 1];
  const shown = cuts.find((c) => c.assetId === shownId) ?? current;
  const shots = orderedShots(p);
  const seq = shots.map((sh) => ({ sh, take: sh.takes.find((t) => t.id === sh.selectedTakeId) }));
  const missing = seq.filter((x) => !x.take).length;
  const anySample = seq.some((x) => x.take && (x.take.provider === 'SAMPLE' || assetById(state, x.take.assetId)?.sample));
  const total = shots.reduce((a, sh) => a + sh.durationSeconds, 0);
  const lines = shots.reduce((a, sh) => a + sh.dialogue.length, 0);
  const voiced = shots.reduce((a, sh) => a + sh.dialogue.filter((d) => d.audioAssetId).length, 0);
  const cast = castOf(state, p);
  const cutApproved = useStageApproved(p.id, 'EDIT');
  const { start, busy } = useStartJob();
  const [format, setFormat] = useState<'mp4-h264' | 'mp4-h265' | 'mov-prores'>('mp4-h264');
  const [res, setRes] = useState<'720' | '1080' | '2160'>('1080');
  const [subs, setSubs] = useState<'none' | 'ar' | 'en' | 'both'>(p.language === 'AR' ? 'both' : 'en');
  const cutAsset = shown ? assetById(state, shown.assetId) : undefined;
  const exportWhy = gate.paused ? 'Intake is paused: new work waits until the studio resumes.' : missing > 0 ? `${missing} ${missing === 1 ? 'shot has' : 'shots have'} no selected take.` : anySample ? 'A sample clip is in the cut; film a real take first.' : !current ? 'Assemble the cut first.' : cutApproved === false ? 'Approve the cut first.' : null;
  const subtitleFiles = (shown?.subtitleAssetIds ?? []).map((id) => assetById(state, id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  const loud = (assetById(state, p.cutAssetId)?.provenance as { loudness?: { integrated?: number; truePeak?: number } } | undefined)?.loudness;

  return (
    <div className="ws-main ws-final">
      <div className="ws-pane-head">
        <h1 className="t-section">Final cut</h1>
        <span className="ws-pane-state">{current ? <StateWord tone={cutApproved ? 'done' : 'waiting'}>{cutApproved ? `Cut ${current.version} approved` : `Cut ${current.version} waits for your approval`}</StateWord> : <StateWord tone="idle">Not assembled yet</StateWord>}</span>
      </div>

      <div className="ws-split">
        <div className="ws-split-main">
          <section className="ws-sec-tight" aria-label="The cut">
            {cutAsset && !cutAsset.unavailable ? (
              <div className="ws-cut-player" data-ratio={frameRatioOf(p)}>
                <CanvasPlayer key={cutAsset.id} src={cutAsset.src} poster={cutAsset.poster} fps={cutAsset.fps} title={`${p.title}, cut ${shown?.version}`} aspect={frameRatioOf(p).replace('/', ' / ')} />
              </div>
            ) : (
              <div className="ws-cut-empty" data-ratio={frameRatioOf(p)}>
                <IconFinalCut aria-hidden />
                <p className="t-title">{current ? 'The cut’s file cannot be found' : 'No cut yet'}</p>
                <p className="t-body">{missing > 0 ? `${missing} ${missing === 1 ? 'shot needs' : 'shots need'} a selected take before the cut can be assembled.` : anySample ? 'A sample clip is still in the sequence; film a real take for it first.' : 'Every shot has a selected take: assemble the cut.'}</p>
              </div>
            )}
            <div className="ws-gen-row">
              <GenButton gate={gate} type="ASSEMBLE" payload={{ productionId: p.id }} target={{ productionId: p.id }} icon={<IconFinalCut aria-hidden />} variant={current ? 'secondary' : 'primary'}
                disabled={missing > 0 || anySample} reason={missing > 0 ? 'Every shot needs a selected take first.' : 'A sample clip is in the sequence.'}>{current ? 'Assemble a new cut' : 'Assemble the cut'}</GenButton>
              {current && <Link className="btn btn-secondary btn-sm" href={`/screening?p=${encodeURIComponent(p.id)}`}>Screen it</Link>}
            </div>
          </section>

          <section className="ws-sec" aria-labelledby="ws-asm-h">
            <SectionHead id="ws-asm-h" title="The assembly" count={shots.length || null} description={`The selected takes in film order, each as wide as its shot · ${runtime(total) ?? '0:00'} of ${runtime(p.targetSeconds)}`} />
            <CutLine p={p} />
            <ul className="ws-facts-line t-meta" role="list">
              <li>{missing === 0 ? 'Every shot has a selected take' : `${missing} ${missing === 1 ? 'shot' : 'shots'} without a selected take`}</li>
              {lines > 0 && <li>{voiced} of {lines} lines recorded</li>}
              {p.song && <li>Music: <bdi>{p.song.title}</bdi></li>}
              <li>{cast.filter((c) => c.voice.selectedSampleId).length} of {cast.length} voices chosen</li>
            </ul>
          </section>

          <section className="ws-sec" aria-labelledby="ws-ver-h">
            <SectionHead id="ws-ver-h" title="Cut versions" count={cuts.length || null} />
            {cuts.length === 0 ? <p className="t-body ws-empty">No cut has been assembled yet.</p> : (
              <ol className="ws-versions" role="list">
                {[...cuts].reverse().map((c) => (
                  <li key={c.assetId} aria-current={c.assetId === shown?.assetId ? 'true' : undefined}>
                    <span className="ws-versions-n">Cut {c.version}</span>
                    <span className="ws-ro ws-versions-t">{shortWhen(c.createdAt)}</span>
                    <span className="ws-versions-d">{c.current ? 'the current cut' : 'an earlier cut'} · {c.shots} {c.shots === 1 ? 'shot' : 'shots'}{c.durationSeconds ? ` · ${runtime(c.durationSeconds)}` : ''}{c.width ? ` · ${c.width}×${c.height}` : ''}</span>
                    {c.assetId === shown?.assetId ? <StateWord tone="idle">On the canvas</StateWord> : <button type="button" className="ws-textlink" onClick={() => setShownId(c.assetId)}>Show</button>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="ws-split-side" aria-label="Approval, subtitles and exports">
          {current && !anySample && <StageGate productionId={p.id} stage="EDIT" title="Approve the cut before it is exported" hint="Watch the cut; approve it to allow an export, or request changes." />}

          <div className="card ws-side-card" aria-labelledby="ws-subs-h">
            <h2 id="ws-subs-h" className="t-title">Subtitles</h2>
            {subtitleFiles.length === 0 ? <p className="t-body">{shown ? 'No subtitle files were written with this cut.' : 'Written with the cut.'}</p> : (
              <ul className="ws-files" role="list">
                {subtitleFiles.map((a) => <li key={a.id}><span className="ws-ro ws-file-name">{a.label}</span>{!a.unavailable && <a className="btn btn-quiet btn-sm" href={`${a.src}?download=1`} download><IconDownload aria-hidden />Download</a>}</li>)}
              </ul>
            )}
          </div>

          <div className="card ws-side-card" aria-labelledby="ws-exp-h">
            <h2 id="ws-exp-h" className="t-title">Export</h2>
            <Field label="Format"><Select value={format} onChange={(e) => setFormat(e.target.value as typeof format)} options={[{ value: 'mp4-h264', label: 'MP4 · H.264' }, { value: 'mp4-h265', label: 'MP4 · H.265' }, { value: 'mov-prores', label: 'MOV · ProRes' }]} /></Field>
            <Field label="Resolution"><Select value={res} onChange={(e) => setRes(e.target.value as typeof res)} options={[{ value: '720', label: '720p' }, { value: '1080', label: '1080p' }, { value: '2160', label: '4K' }]} /></Field>
            <Field label="Subtitles"><Select value={subs} onChange={(e) => setSubs(e.target.value as typeof subs)} options={[{ value: 'none', label: 'None' }, { value: 'en', label: 'English' }, { value: 'ar', label: 'Arabic' }, { value: 'both', label: 'Arabic and English' }]} /></Field>
            <Button variant="primary" icon={<IconDownload aria-hidden />} loading={busy} disabled={Boolean(exportWhy)} onClick={() => void start('EXPORT', { productionId: p.id, format, resolution: res, subtitles: subs })}>Export</Button>
            {exportWhy && <p className="ws-gen-why">{exportWhy}</p>}
          </div>

          <div className="card ws-side-card" aria-labelledby="ws-exps-h">
            <h2 id="ws-exps-h" className="t-title">Exports <span className="ws-ro ws-count">{p.exports?.length ?? 0}</span></h2>
            {(p.exports?.length ?? 0) === 0 ? <p className="t-body">Nothing exported yet.</p> : (
              <ul className="ws-files" role="list">
                {[...(p.exports ?? [])].reverse().map((ex) => { const a = assetById(state, ex.assetId); return (
                  <li key={ex.id}>
                    <span className="ws-file-words"><span className="ws-file-name">{ex.resolution}p · {ex.format.toUpperCase()}{ex.subtitles !== 'none' ? ` · subtitles ${ex.subtitles}` : ''}</span><span className="t-meta">{shortWhen(ex.createdAt)}{ex.durationSeconds ? ` · ${runtime(ex.durationSeconds)}` : ''}{ex.bytes ? ` · ${fmtBytes(ex.bytes)}` : ''}</span></span>
                    {a && !a.unavailable && <a className="btn btn-secondary btn-sm" href={`${a.src}?download=1`} download><IconDownload aria-hidden />Download</a>}
                  </li>
                ); })}
              </ul>
            )}
          </div>

          {loud?.integrated !== undefined && (
            <PanelCard title="Sound" columns={2} facts={[{ label: 'Loudness', value: `${loud.integrated.toFixed(1)} LUFS` }, { label: 'True peak', value: `${loud.truePeak?.toFixed(1) ?? '—'} dBTP` }]} />
          )}
          {missing === 0 && p.stage !== 'COMPLETE' && <Button onClick={() => { act('markStepDone', p.id, 'FINAL_CUT'); toast.ok('Saved.'); }}>Mark the film finished</Button>}
        </aside>
      </div>
    </div>
  );
}
