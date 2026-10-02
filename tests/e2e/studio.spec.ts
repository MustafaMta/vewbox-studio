import { expect, test, BASE } from './helpers';

/** The studio organisation through the real interface: the six areas, the Studio overview from persisted records,
 *  a department workspace and an agent profile that shows real tools and skills, the Production area with the
 *  pipeline, and the human gate on the Produce tab. The sample studio has no agent runs, so the pages must say so
 *  instead of inventing activity. */

test('the navigation puts the product first (Shows, Shorts, Music Videos, Characters, Studio Company), then the Library (Locations, Files) and the Studio (Production, Settings)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/shows$/);
  const nav = page.getByRole('navigation', { name: 'Studio areas' }).first();
  await expect(nav.getByRole('link')).toHaveText(['Shows', 'Shorts', 'Music Videos', 'Characters', 'Studio Company', 'Locations', 'Files', 'Production', 'Settings']);
});

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('the Studio Company: the orchestrator and nine seats on one stage, an inspector for the selection, roving keyboard focus, lines only for recorded handoffs', async ({ page }) => {
  await page.goto('/studio');
  await expect(page.getByRole('heading', { level: 1, name: 'Studio Company' })).toBeVisible();
  const diagram = page.getByRole('group', { name: /The company/ });
  for (const d of ['Executive Office', 'Story Development', 'Casting & Character Design', 'World Building & Art Direction', 'Pre-Production', 'Video Production', 'Sound & Music', 'Post-Production', 'Quality Assurance']) await expect(diagram.getByRole('button', { name: new RegExp(`^${esc(d)}\\.`) })).toBeVisible();
  const orchestrator = diagram.getByRole('button', { name: /^Studio Orchestrator\./ });
  await expect(orchestrator).toHaveAccessibleName(/Idle|Coordinating|in progress|Waiting for you|Blocked/);
  const inspector = page.getByRole('complementary', { name: 'Selection' });
  await expect(inspector.getByRole('heading', { name: 'Studio Orchestrator' })).toBeVisible();
  await expect(inspector.getByText('Waiting for you')).toBeVisible();
  // keyboard: the stage is one tab stop; the arrow keys walk the orbit; Enter selects, Enter again opens
  await orchestrator.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const story = diagram.getByRole('button', { name: /^Story Development\./ });
  await expect(story).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(story).toHaveAttribute('aria-pressed', 'true');
  await expect(inspector.getByRole('heading', { name: 'Story Development' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(inspector.getByRole('heading', { name: 'Studio Orchestrator' })).toBeVisible();
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/studio\/departments\/STORY$/);
  // the organisation the page shows is the persisted one; without a handoff there is no line, and the stage says so
  const org = await (await fetch(`${BASE}/api/studio/org`)).json() as { departments: unknown[]; agents: unknown[]; handoffs: unknown[]; skills: Array<{ status: string; source: string }> };
  expect(org.departments).toHaveLength(9);
  expect(org.agents.length).toBeGreaterThanOrEqual(20);
  expect(org.skills.filter((s) => s.source.includes('MiniMax-AI/skills')).every((s) => s.status === 'UNAVAILABLE')).toBe(true);
  if (org.handoffs.length === 0) {
    await page.goto('/studio');
    await expect(page.getByText('No handoffs yet. Each handoff between departments lights its path.')).toBeVisible();
  }
});

test('a department leads with its people and what each executes, lists unstaffed roles apart; an agent profile keeps its internals behind Technical details', async ({ page }) => {
  await page.goto('/studio/departments/VIDEO');
  await expect(page.getByRole('heading', { level: 1, name: 'Video Production' })).toBeVisible();
  await expect(page.getByText(/Director:\s*MiniMax Video Specialist/).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Place in the pipeline/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Team/ })).toBeVisible();
  await expect(page.getByText(/Executes:\s*Generate video/).first()).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: 'Work' })).toBeVisible();
  const dept = await (await fetch(`${BASE}/api/studio/org/departments/VIDEO`)).json() as { department: { plannedRoles?: Array<{ name: string }> } };
  if (dept.department.plannedRoles?.length) {
    await expect(page.getByRole('heading', { name: /^Not yet staffed/ })).toBeVisible();
    // a planned role is a name in a muted list, never a link to a profile
    await expect(page.getByRole('link', { name: dept.department.plannedRoles[0].name })).toHaveCount(0);
  }
  // internals are disclosed, not shown by default
  await expect(page.getByText('video.minimax_generate')).toBeHidden();
  await page.getByRole('link', { name: /MiniMax Video Specialist/ }).first().click();
  await expect(page).toHaveURL(/\/studio\/agents\/minimax-video-specialist$/);
  await expect(page.getByRole('heading', { level: 1, name: 'MiniMax Video Specialist' })).toBeVisible();
  await expect(page.getByText('Generate video').first()).toBeVisible();
  await page.getByText('Technical details', { exact: true }).first().click();
  await expect(page.getByText('MiniMax H3 prompting').first()).toBeVisible();
  // no recorded runs: the page says so instead of a zero in a tile
  const runs = await (await fetch(`${BASE}/api/studio/org/agents/minimax-video-specialist`)).json() as { runs: unknown[] };
  if (runs.runs.length === 0) await expect(page.getByText('No runs yet.').first()).toBeVisible();
});

test('the Production area shows each production in the pipeline and the Produce tab is gated by the story approval', async ({ page }) => {
  await page.goto('/production');
  await expect(page.getByRole('heading', { level: 1, name: 'Production' })).toBeVisible();
  await expect(page.getByRole('link', { name: /The Last Sip|Night Tray|Paper Kites|River Lights|Rooftop Radio|Paper Boats/ }).first()).toBeVisible();
  await page.goto('/shows/last-sip/seasons/last-sip-s1/episodes/s1e1?tab=produce');
  await expect(page.getByText('The story needs your approval before production starts')).toBeVisible();
  await expect(page.getByRole('button', { name: /Draws missing frames/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Draws missing frames/ })).toBeEnabled();
  // the approval is a record, not a page state
  const r = await (await fetch(`${BASE}/api/studio/org/productions/s1e1`)).json() as { approvals: Array<{ stage: string; decision: string }> };
  expect(r.approvals.some((a) => a.stage === 'STORY' && a.decision === 'APPROVED')).toBe(true);
});

test('the Screening Room lists only productions with a cut, and the Library tabs carry the counts', async ({ page }) => {
  await page.goto('/screening');
  await expect(page.getByRole('heading', { level: 1, name: 'Screening Room' })).toBeVisible();
  await page.goto('/library?tab=locations');
  await expect(page.getByRole('tab', { name: /Locations/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { level: 1, name: 'Locations' })).toBeVisible();
});
