/** TEMPORARY name only: src/app/layout.tsx (owned by DS-1) still wraps the app in `LocaleProvider`. There is no locale
 *  (the website is English-only); the wrapper applies Reduce motion. Delete this file once layout.tsx imports
 *  `MotionPreference` from '@/components/ui/motion' (requested from DS-1). */
export { MotionPreference as LocaleProvider } from './motion';
