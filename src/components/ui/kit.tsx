/** THE INTERFACE KIT (docs/DESIGN-SYSTEM-V4.md §5, package F2) — every control the studio uses, once. Pages compose
 *  these and add nothing of their own. The parts live in src/components/ui/kit/*; this file is the barrel, so every
 *  `import { … } from '@/components/ui/kit'` keeps working (v3 names included, until Q1 deletes them).
 *
 *    kit/Button        Button, LinkButton, Spinner
 *    kit/Status        StateWord, StatusStrip, IdentityState, StageWord, FilterChip, ProgressBar · v3: Badge, Status, SampleMark
 *    kit/Tabs          TabBar, TabPanel, AnchorNav, Crumbs
 *    kit/CatalogueBar  CatalogueBar, useCatalogueParams, parseFilters / serializeFilters / toggleFilter
 *    kit/Overlay       Dialog, ConfirmDialog, useConfirm, useAsk, Drawer, Popover, MenuButton, MenuItem, MenuLink,
 *                      MenuSeparator, CommandPalette, ShortcutSheet · v3: Menu
 *    kit/Field         Field, Input, Textarea, Select, Checkbox, Toggle, ErrorSummary, SettingsSummary, ChipInput,
 *                      ShapedDropzone, FormFooter, SaveWord · v3: Dropzone
 *    kit/Choice        Segmented, ChoiceTiles · v3: ChoiceCards
 *    kit/Recorder      Recorder
 *    kit/Loading       Skeleton (.Line .Text .Block .Media .Tile), SkeletonRegion, Progress, JobDot
 *    kit/States        PageEmpty, SectionEmpty, LoadingFrame, TextBars, LoadingLine, ErrorNotice, PartialLine,
 *                      SampleBadge, Notice
 *    kit/ApprovalCard  ApprovalCard, InlineNote
 *    kit/PageHeader    PageHeader, Section, FactList, CastStack
 *    kit/CompactHeader CompactHeader
 *    kit/Creation      CreationShell, ReviewActions, Stepper, MadeNotice, useMethodOptions
 *    kit/session       useSessionDraft, readSession, writeSession
 *    kit/layout        useRootVarContribution, useMediaQuery
 *    kit/focus         rovingStep, rovingIndex, focusables, trapTab, useFocusReturn
 *    kit/legacy        v3: Card, Details, KV, ConfirmButton, ConfirmDelete, Modal, Thumb, PickGrid, AddTile */
export { cls } from './kit/cls';
export * from './kit/Button';
export * from './kit/Status';
export * from './kit/Tabs';
export * from './kit/CatalogueBar';
export * from './kit/Overlay';
export * from './kit/Field';
export * from './kit/Choice';
export * from './kit/Recorder';
export * from './kit/States';
export * from './kit/Loading';
export * from './kit/ApprovalCard';
export * from './kit/PageHeader';
export * from './kit/CompactHeader';
export * from './kit/Creation';
export * from './kit/session';
export * from './kit/layout';
export * from './kit/focus';
export * from './kit/legacy';
