import { test, expect, setup, project, id } from './fixtures';

test('detail focuses its title once and preserves user focus when loading finishes', async ({
  page,
}) => {
  await setup(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v2/projects/' + id(1), async (route) => {
    await gate;
    await route.fulfill({ json: project(1) });
  });
  await page.goto('/projects/' + id(1));
  const heading = page.locator('.project-detail h1');
  await expect(heading).toBeFocused();
  const back = page.getByRole('button', { name: '프로젝트 목록', exact: true });
  await back.focus();
  release();
  await expect(heading).toHaveText('Project 1');
  await expect(back).toBeFocused();
  await expect(page.locator('.project-detail')).not.toHaveAttribute('tabindex');
});

test('missing project keeps a meaningful title and list return action', async ({ page }) => {
  await setup(page);
  await page.route('**/api/v2/projects/' + id(1), (route) =>
    route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } }),
  );
  await page.goto('/projects/' + id(1));
  await expect(page.locator('.project-detail h1')).toHaveText('프로젝트를 찾을 수 없어요');
  await expect(page.locator('.project-detail h1')).toBeFocused();
  await expect(page.getByRole('button', { name: '프로젝트 목록', exact: true })).toBeEnabled();
});
test('long project names, goals and repository URLs wrap at narrow widths', async ({ page }) => {
  await setup(page);
  const row = {
    ...project(1),
    name: '긴 프로젝트 이름 '.repeat(8),
    currentMilestone: '목표'.repeat(95),
    repositoryUrl: 'https://example.com/' + 'repository'.repeat(70),
  };
  await page.route('**/api/v2/projects/' + id(1), (route) => route.fulfill({ json: row }));
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/projects/' + id(1));
    await expect(page.locator('.project-goal-fact')).toContainText(row.currentMilestone);
    await expect(page.locator('.project-repository-fact a')).toHaveAttribute(
      'href',
      row.repositoryUrl,
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
