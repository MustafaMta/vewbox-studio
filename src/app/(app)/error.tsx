'use client';

import { Button, LinkButton } from '@/components/ui/kit';
import { Empty } from '@/components/ui/cinema';

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return <Empty title="Something went wrong on this page" hint={error.message} action={<><Button variant="primary" onClick={reset}>Try again</Button><LinkButton href="/">Go to Home</LinkButton></>} />;
}
