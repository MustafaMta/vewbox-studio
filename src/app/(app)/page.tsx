import { redirect } from 'next/navigation';

/** The studio's front door is the Studio area; the six areas are the whole navigation. */
export default function HomePage() { redirect('/studio'); }
