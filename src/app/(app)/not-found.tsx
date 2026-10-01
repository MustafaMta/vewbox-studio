'use client';

import { useT } from '@/components/ui/locale';
import { LinkButton } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';

export default function NotFound() {
  const T = useT();
  return <Empty title={T('misc.notFound')} hint={T('misc.notFound.hint')} action={<LinkButton href="/" variant="primary">{T('misc.goHome')}</LinkButton>} />;
}
