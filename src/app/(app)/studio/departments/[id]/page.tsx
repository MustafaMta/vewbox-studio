'use client';

import { useParams } from 'next/navigation';
import { DepartmentPage } from '@/components/studio/Department';

/** /studio/departments/[id] — one department (src/components/studio/Department.tsx). */
export default function Page() {
  const { id } = useParams<{ id: string }>();
  return <DepartmentPage key={id} id={id} />;
}