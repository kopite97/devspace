import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { expect } from '@playwright/test';

// The shared runner owns this DB and disabled integration. Live connected-account
// acceptance is recorded separately; this verifies the built SPA/proxy boundary.
export async function validateGitHub({ page, context, origin, output, contract }) {
  const account = await context.request.get(origin + '/api/v2/integrations/github/account');
  assert.equal(account.status(), 200);
  assert.equal((await account.json()).status, 'not_configured');
  assert.match(account.headers()['cache-control'], /no-store/);
  const operations = Object.entries(contract.paths)
    .filter(([url]) => url.includes('/github') && !url.endsWith('/webhooks'))
    .flatMap(([url, methods]) =>
      Object.entries(methods)
        .filter(([method]) => ['get', 'post', 'put', 'patch', 'delete'].includes(method))
        .map(([method, operation]) => ({
          path: url,
          method,
          success: Object.keys(operation.responses).filter((status) => /^[23]/.test(status)),
        })),
    );
  assert.equal(operations.length, 27);
  for (const route of [
    '/github',
    '/github/connection-result?github=connected',
    '/github/connection-result?github=denied',
  ]) {
    await page.goto(origin + route);
    await expect(page.getByText('서버 설정 필요', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'GitHub 계정 연결', exact: true }),
    ).toBeDisabled();
    await page.reload();
    await expect(page.getByText('서버 설정 필요', { exact: true })).toBeVisible();
    assert.equal(new URL(page.url()).origin, origin);
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(output, `github-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  fs.writeFileSync(
    path.join(output, 'github-result.json'),
    JSON.stringify(
      {
        origin,
        passed: true,
        account: 'not_configured',
        operations,
        checks: [
          'authenticated deep link',
          'reload',
          'query does not assert connection',
          'SPA result routing',
          'same-origin API no-store',
          '1440/390/320 layout',
        ],
      },
      null,
      2,
    ),
  );
}
