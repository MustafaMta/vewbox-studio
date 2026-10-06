'use client';

import Link from 'next/link';
import { TERMS, TERMS_VERSION, termsAccepted } from '@/domain/terms';
import { ENGINE_LICENCES } from '@/domain/licences';
import { useStudio } from '@/studio/store';
import { useToast } from '@/components/ui/toast';
import { Button, StateWord } from '@/components/ui/kit';
import { PageHead, Section } from '@/components/studio/parts';
import { TermsSkeleton } from './SettingsSkeleton';
import { fmtDate } from '@/lib/format';

/** /terms — THE STUDIO'S TERMS OF USE (src/domain/terms.ts). The restrictions the engines' licences pass on to the
 *  people who use their outputs, in plain words, accepted once per studio (`settings.terms`, through the studio's own
 *  `updateSettings` command). Until they are accepted the pages start no new work; reading, editing and choosing stay
 *  open. The licences behind them: Settings › Licences and docs/LICENSES.md. */
export function TermsPage() {
  const { state, act, ready } = useStudio();
  const toast = useToast();
  if (!ready) return <TermsSkeleton />;
  const accepted = termsAccepted(state.settings);
  const at = state.settings.terms?.acceptedAt;
  const passing = ENGINE_LICENCES.filter((l) => l.passesRestrictions);
  const accept = () => {
    try { act('updateSettings', { terms: { version: TERMS_VERSION, acceptedAt: new Date().toISOString(), by: 'producer' } }); toast.ok('Terms accepted. The studio can make new work.'); }
    catch (e) { toast.bad((e as Error).message); }
  };
  return (
    <div className="cp settings terms">
      <PageHead title="Terms of use" lead={`What you agree to when you make films with this studio. Version ${TERMS_VERSION}.`}
        end={accepted ? <StateWord tone="done">Accepted{at ? ` ${fmtDate(at)}` : ''}</StateWord> : <StateWord tone="waiting">Not accepted yet</StateWord>} />
      <p className="t-body terms-why">The engines that make your films come with licences that limit how their outputs may be used, and ask that those limits bind the people who use them: {passing.map((l) => l.licence.replace(/ \(.*\)$/, '')).join(', ')}. These terms are those limits.</p>
      {TERMS.map((s, i) => (
        <Section key={s.title} id={`terms-${i + 1}`} title={s.title}>
          <ul className="card st-panel terms-list" role="list">{s.items.map((t) => <li key={t} className="t-body">{t}</li>)}</ul>
        </Section>
      ))}
      <div className="terms-foot">
        {accepted ? <p className="t-meta">Accepted for this studio{at ? ` on ${fmtDate(at)}` : ''}. A new version of the terms will ask again.</p> : (
          <>
            <Button variant="primary" onClick={accept}>I accept these terms</Button>
            <p className="t-meta">Until they are accepted the studio makes nothing new; you can still read, edit and choose.</p>
          </>
        )}
        <Link className="link-quiet" href="/settings#licences">The engines and their licences</Link>
      </div>
    </div>
  );
}
