'use client';

import { useParams } from 'next/navigation';
import { AgentPage } from '@/components/studio/Agent';

/** /studio/agents/[id] — one agent (src/components/studio/Agent.tsx). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <AgentPage key={id} id={id} />;
}