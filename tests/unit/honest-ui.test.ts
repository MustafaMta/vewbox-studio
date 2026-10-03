import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { STUDIO_ERROR_CODES } from '@/domain/errors';
import { KEYS, t } from '@/lib/i18n';
import { saveStateOf } from '@/studio/save-state';
import { briefOriginKey } from '@/studio/selectors';
import { ERROR_COPY, RecoveryAction, type ErrorCopy } from '@/components/ui/progress';
import { recordingNeedingConsent } from '@/components/character/ConsentChoice';
import type { Character, VoiceSample } from '@/domain/types';

/** Audit D1, D3, D4, D6: what the interface says is what is true. */

describe('D1 — the shell says "saved" only when nothing is waiting', () => {
  it('saved / saving / not saved, from the queue', () => {
    expect(saveStateOf({ pending: 0, inflight: 0, failures: 0 })).toBe('saved');
    expect(saveStateOf({ pending: 2, inflight: 0, failures: 0 })).toBe('saving');
    expect(saveStateOf({ pending: 0, inflight: 1, failures: 0 })).toBe('saving');
    expect(saveStateOf({ pending: 3, inflight: 0, failures: 1 })).toBe('unsaved');
    // a failure that left nothing behind (the queue drained on the next attempt) is saved
    expect(saveStateOf({ pending: 0, inflight: 0, failures: 2 })).toBe('saved');
  });
  it('the three phrases exist in both languages', () => {
    for (const k of ['app.saved', 'app.saving', 'app.unsaved'] as const) { expect(t('en', k)).toBeTruthy(); expect(t('ar', k)).toBeTruthy(); }
  });
});

describe('D3 — a proposal the story engine wrote is never labelled a sample', () => {
  it('chooses the phrase by the brief’s own flag', () => {
    expect(briefOriginKey({ mode: 'AUTO_IDEA' })).toBe('story.autoIdea');
    expect(briefOriginKey({ mode: 'AUTO_IDEA', fromSampleProposal: true })).toBe('story.autoIdea.example');
    expect(briefOriginKey({ mode: 'MANUAL' })).toBe('story.manual');
    expect(t('en', 'story.autoIdea')).not.toMatch(/sample|example/i);
    expect(t('en', 'story.autoIdea.example')).toMatch(/example/i);
  });
});

describe('D4 — the written example does not claim the studio is unconnected', () => {
  it('no "once it is connected"', () => {
    expect(t('en', 'auto.sampleBody')).not.toMatch(/connected/i);
    expect(t('ar', 'auto.sampleBody')).not.toContain('عند الاتصال');
  });
});

describe('D6 — every error code has its own recovery; consent is a consent choice, never a retry', () => {
  it('ERROR_COPY covers every StudioError code with keys that exist', () => {
    for (const code of STUDIO_ERROR_CODES) {
      const e = ERROR_COPY[code];
      expect(e, code).toBeTruthy();
      for (const k of [e.title, e.hint, e.fix]) expect(KEYS, `${code}: ${k}`).toContain(k);
    }
    expect(ERROR_COPY.CONSENT_REQUIRED.kind).toBe('consent');
    expect(ERROR_COPY.ASSET_PROTECTED.kind).toBe('usage');
  });

  const copy = (kind: ErrorCopy['fix']['kind']): ErrorCopy => ({ code: 'CONSENT_REQUIRED', title: 't', hint: 'h', fix: { label: 'Choose consent', kind } });
  const html = (props: Parameters<typeof RecoveryAction>[0]) => renderToStaticMarkup(createElement(RecoveryAction, props));
  it('RecoveryAction offers no Retry for consent: the caller’s consent choice, else only the job', () => {
    const retry = () => undefined;
    expect(html({ copy: copy('consent'), onRetry: retry })).toBe('');
    expect(html({ copy: copy('consent'), onRetry: retry, jobId: 'job-1' })).toContain('/production?job=job-1');
    expect(html({ copy: copy('consent'), onRetry: retry, jobId: 'job-1' })).not.toContain('Choose consent');
    expect(html({ copy: copy('consent'), onRetry: retry, custom: { consent: createElement('span', null, 'CONSENT-CHOICE') } })).toBe('<span>CONSENT-CHOICE</span>');
    // the generic kinds still retry
    expect(html({ copy: copy('retry'), onRetry: retry })).toContain('Choose consent');
  });

  const sample = (id: string, over: Partial<VoiceSample> = {}): VoiceSample => ({ id, label: id, source: 'UPLOADED', assetId: `a-${id}`, ...over }) as VoiceSample;
  const char = (samples: VoiceSample[]) => ({ voice: { samples } }) as unknown as Pick<Character, 'voice'>;
  const consent = { statement: 'MY_VOICE' as const, by: 'PRODUCER' as const, at: 'x' };
  it('the consent choice is about the recording the failure names, else the first upload without a statement', () => {
    const c = char([sample('ok', { consent }), sample('first'), sample('second'), sample('gen', { source: 'GENERATED' })]);
    expect(recordingNeedingConsent(c, 'second')?.id).toBe('second');
    expect(recordingNeedingConsent(c, undefined)?.id).toBe('first');
    expect(recordingNeedingConsent(c, 'ok')?.id).toBe('first'); // already consented: the next one that is not
    expect(recordingNeedingConsent(char([sample('ok', { consent })]), 'ok')).toBeUndefined();
  });
});
