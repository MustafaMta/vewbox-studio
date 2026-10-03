/** NAVIGATION (a v3 module kept as a re-export): the studio's navigation lives in the shell (src/components/shell); the
 *  breadcrumb trail is the kit's Crumbs (src/components/ui/kit/Tabs.tsx). New code imports both from there. */
export { NAV_GROUPS, NAV_ITEMS, isActive, currentItem, areaLabel } from '@/components/shell/nav-model';
export type { NavItem, NavGroup } from '@/components/shell/nav-model';
export { Crumbs } from './kit/Tabs';
