import { test, expect } from '@playwright/test';

for (const route of [
  '/journals/00000000-0000-0000-0000-000000000001',
  '/documents/00000000-0000-0000-0000-000000000001/edit',
]) {
  test(`document integration preserves authenticated return intent ${route}`, async ({ page }) => {
    await page.route('**/api/v1/me', (request) =>
      request.fulfill({ status: 401, json: { code: 'AUTH_REQUIRED' } }),
    );
    await page.route('**/api/v1/auth/login?**', (request) =>
      request.fulfill({ contentType: 'text/html', body: 'Authentication entry' }),
    );
    await page.goto(route);
    await expect(page.getByRole('heading', { name: '로그인하여 계속하세요' })).toBeVisible();
    await page.getByRole('button', { name: 'Google로 계속하기' }).click();
    await expect(page).toHaveURL(
      (url) => url.pathname === '/api/v1/auth/login' && url.searchParams.get('returnTo') === route,
    );
  });
}
