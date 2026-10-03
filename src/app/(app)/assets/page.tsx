'use client';

import { Suspense } from 'react';
import { FilesPage, FilesSkeleton } from '@/components/files/Files';

/** /assets — Files (src/components/files/Files.tsx). `?asset=` opens one file. */
export default function AssetsPage() {
  return <Suspense fallback={<FilesSkeleton />}><FilesPage /></Suspense>;
}