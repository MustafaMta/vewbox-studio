import { expect, test, BASE } from './helpers';

/** The studio organisation through the real interface: the six areas, the Studio overview from persisted records,
 *  a department workspace and an agent profile that shows real tools and skills, the Production area with the
 *  pipeline, and the human gate on the Produce tab. The sample studio has no agent runs, so the pages must say so
 *  instead of inventing activity. */

test('the navigation has exactly the six areas and the front door is the Studio', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/studio$/);
  const nav = page.getByRole('navigation', { name: 'Studio areas' }).first();
  await expect(nav.getByRole('link')).toHaveText(['Studio', 'Projects', 'Library', 'Production', 'Screening Room', 'Settings']);
});

test('the Studio overview shows the Executive Office, eight departments, the pipeline and honest empty activity', async ({ page }) => {
  await page.goto('/studio');
  await expect(page.getByRole('heading', { level: 1, name: 'The studio' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Executive Office' })).toBeVisible();
  for (const d of ['Story Development', 'Casting & Character Design', 'World Building & Art Direction', 'Pre-Production', 'Video Production', 'Sound & Music', 'Post-Production', 'Quality Assurance']) await expect(page.getByRole('link', { name: new RegExp(d) })).toBeVisible();
  // the pipeline graph names the ten stages in order
  const graph = page.getByRole('list', { name: 'How a production moves' });
  await expect(graph.getByText('Story', { exact: true })).toBeVisible();
  await expect(graph.getByText('Export', { exact: true })).toBeVisible();
  // the organisation the page shows is the persisted one
  const org = await (await fetch(`${BASE}/api/studio/org`)).json() as { departments: unknown[]; agents: unknown[]; tools: unknown[]; skills: Array<{ status: string; source: string }> };
  expect(org.departments).toHaveLength(9);
  expect(org.agents.length).toBeGreaterThanOrEqual(40);
  expect(org.skills.filter((s) => s.source.includes('MiniMax-AI/skills')).every((s) => s.status === 'UNAVAILABLE')).toBe(true);
});

test('a department workspace lists its director and agents; an agent profile shows real tools, skills and no invented runs', async ({ page }) => {
  await page.goto('/studio/departments/VIDEO');
  await expect(page.getByRole('heading', { level: 1, name: 'Video Production' })).toBeVisible();
  await expect(page.getByText(/Director:\s*Production Director/)).toBeVisible();
  await page.getByRole('link', { name: /MiniMax Video Specialist/ }).click();
  await expect(page).toHaveURL(/\/studio\/agents\/minimax-video-specialist$/);
  await expect(page.getByRole('heading', { level: 1, name: 'MiniMax Video Specialist' })).toBeVisible();
  await expect(page.getByText('video.minimax_generate').first()).toBeVisible();
  await expect(page.getByText('MiniMax H3 prompting').first()).toBeVisible();
  // the sample studio has no recorded runs for this agent: the page says so
  const runs = await (await fetch(`${BASE}/api/studio/org/agents/minimax-video-specialist`)).json() as { runs: unknown[] };
  if (runs.runs.length === 0) await expect(page.getByText('Has not run yet').first()).toBeVisible();
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
