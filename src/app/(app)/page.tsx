import { redirect } from 'next/navigation';

/** The front door is the Shows catalog; the product is what the studio makes. */
export default function HomePage() { redirect('/shows'); }
