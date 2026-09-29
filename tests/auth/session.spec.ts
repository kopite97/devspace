import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
async function openProfile(page: Page) {
  const trigger = page.getByRole('button', { name: '??? ??', exact: true });
  if ((await trigger.getAttribute('aria-expanded')) !== 'true') await trigger.click();
}
const alice = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Alice',
  workspace: { id: '22222222-2222-4222-8222-222222222222', name: 'Alice workspace', revision: 1 },
};
const bob = {
  id: '33333333-3333-4333-8333-333333333333',
  displayName: 'Bob',
  workspace: { id: '44444444-4444-4444-8444-444444444444', name: 'Bob workspace', revision: 1 },
};

test('pagehide retires private DOM before restoration; focus fallback revalidates a changed account', async ({
  context,
  page,
}) => {
  await context.addInitScript(() =>
    Object.defineProperty(window, 'BroadcastChannel', { value: undefined }),
  );
  let identity = alice;
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: identity }));
  await page.goto('/');
  await expect(
    page.getByRole('region', { name: 'Alice · Alice workspace', exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })),
  );
  await expect(
    page.getByRole('region', { name: 'Alice · Alice workspace', exact: true }),
  ).toHaveCount(0);
  identity = bob;
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now + 2000;
    window.dispatchEvent(new Event('focus'));
  });
  await expect(
    page.getByRole('region', { name: 'Bob · Bob workspace', exact: true }),
  ).toBeVisible();
});

test('pending CSRF blocks duplicate logout; bodyless success clears identity', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let posts = 0;
  let authenticated = true;
  await page.route('**/api/v1/me', (route) =>
    route.fulfill(authenticated ? { json: alice } : { status: 401, body: '' }),
  );
  await page.route('**/api/v1/auth/csrf', async (route) => {
    await pending;
    await route.fulfill({ json: { csrfToken: 'memory-token' } });
  });
  await page.route('**/api/v1/auth/logout', (route) => {
    posts++;
    expect(route.request().headers()['x-csrf-token']).toBe('memory-token');
    authenticated = false;
    return route.fulfill({ status: 204 });
  });
  await page.goto('/');
  await openProfile(page);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Logging out…' })).toBeDisabled();
  expect(posts).toBe(0);
  release();
  await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
  expect(posts).toBe(1);
  await expect(
    page.getByRole('region', { name: 'Alice · Alice workspace', exact: true }),
  ).toHaveCount(0);
});

test('CSRF recovery requires explicit retry and repeated rejection stops refresh loops', async ({
  page,
}) => {
  let me = 0,
    csrf = 0,
    posts = 0;
  await page.route('**/api/v1/me', (route) => {
    me++;
    return route.fulfill({ json: alice });
  });
  await page.route('**/api/v1/auth/csrf', (route) => {
    csrf++;
    return route.fulfill({ json: { csrfToken: 'token-' + csrf } });
  });
  await page.route('**/api/v1/auth/logout', (route) => {
    posts++;
    return route.fulfill({ status: 403, json: { code: 'CSRF_INVALID' } });
  });
  await page.goto('/');
  await openProfile(page);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Session security was refreshed');
  expect({ me, csrf, posts }).toEqual({ me: 2, csrf: 2, posts: 1 });
  await page.getByRole('button', { name: 'Retry logout' }).click();
  await expect(page.getByRole('alert')).toContainText('Check the token/Origin configuration');
  await expect(page.getByRole('button', { name: 'Retry logout' })).toBeDisabled();
  expect({ me, csrf, posts }).toEqual({ me: 2, csrf: 2, posts: 2 });
});

for (const mode of ['offline', 'malformed'] as const)
  test(
    mode + ' logout hides identity during reconciliation and offers explicit retry',
    async ({ page }) => {
      let me = 0;
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route('**/api/v1/me', async (route) => {
        me++;
        if (me > 1) await pending;
        await route.fulfill({ json: alice });
      });
      await page.route('**/api/v1/auth/csrf', (route) =>
        route.fulfill({ json: { csrfToken: 'token' } }),
      );
      await page.route('**/api/v1/auth/logout', (route) =>
        mode === 'offline'
          ? route.abort('failed')
          : route.fulfill({ contentType: 'text/html', body: '<html>wrong</html>' }),
      );
      await page.goto('/');
      await openProfile(page);
      await page.getByRole('button', { name: 'Log out', exact: true }).click();
      await expect(page.getByRole('status')).toHaveText('Checking your session…');
      await expect(
        page.getByRole('region', { name: 'Alice · Alice workspace', exact: true }),
      ).toHaveCount(0);
      release();
      await expect(page.getByRole('alert')).toHaveText(
        'Logout was not confirmed. Please retry logout.',
      );
      await expect(page.getByRole('button', { name: 'Retry logout' })).toBeEnabled();
    },
  );

for (const status of [401, 503])
  test('ambiguous logout reconciliation ' + status, async ({ page }) => {
    let me = 0;
    await page.route('**/api/v1/me', (route) => {
      me++;
      return route.fulfill(me === 1 ? { json: alice } : { status, json: {} });
    });
    await page.route('**/api/v1/auth/csrf', (route) =>
      route.fulfill({ json: { csrfToken: 'token' } }),
    );
    await page.route('**/api/v1/auth/logout', (route) => route.abort());
    await page.goto('/');
    await openProfile(page);
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: status === 401 ? 'Sign in to your workspace' : 'Connection problem',
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Alice · Alice workspace', exact: true }),
    ).toHaveCount(0);
  });

test('known account switch cancels pending token and never sends the old logout', async ({
  page,
}) => {
  let identity = alice;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let posts = 0;
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: identity }));
  await page.route('**/api/v1/auth/csrf', async (route) => {
    await pending;
    await route.fulfill({ json: { csrfToken: 'old-token' } }).catch(() => {});
  });
  await page.route('**/api/v1/auth/logout', (route) => {
    posts++;
    return route.fulfill({ status: 204 });
  });
  await page.goto('/');
  const tokenRequested = page.waitForRequest('**/api/v1/auth/csrf');
  await openProfile(page);
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await tokenRequested;
  identity = bob;
  await page.evaluate(() => {
    const channel = new BroadcastChannel('devspace-auth');
    channel.postMessage('changed');
    channel.close();
  });
  await expect(
    page.getByRole('region', { name: 'Bob · Bob workspace', exact: true }),
  ).toBeVisible();
  release();
  await openProfile(page);
  await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeEnabled();
  expect(posts).toBe(0);
});

for (const broadcast of [true, false])
  test('two-tab logout propagation; BroadcastChannel ' + broadcast, async ({ context, page }) => {
    if (!broadcast)
      await context.addInitScript(() =>
        Object.defineProperty(window, 'BroadcastChannel', { value: undefined }),
      );
    let authenticated = true,
      me = 0;
    await context.route('**/api/v1/me', (route) => {
      me++;
      return route.fulfill(authenticated ? { json: alice } : { status: 401, body: '' });
    });
    await context.route('**/api/v1/auth/csrf', (route) =>
      route.fulfill({ json: { csrfToken: 'token' } }),
    );
    await context.route('**/api/v1/auth/logout', (route) => {
      authenticated = false;
      return route.fulfill({ status: 204 });
    });
    await page.goto('/');
    const other = await context.newPage();
    await other.goto('/projects');
    await expect(
      other.getByRole('region', { name: 'Alice · Alice workspace', exact: true }),
    ).toBeVisible();
    await openProfile(page);
    await expect(page.getByRole('button', { name: 'Log out', exact: true })).toBeEnabled();
    await openProfile(page);
    await page.getByRole('button', { name: 'Log out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
    if (!broadcast)
      await other.evaluate(() =>
        window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
      );
    await expect(other.getByRole('heading', { name: 'Sign in to your workspace' })).toBeVisible();
    await expect(other.getByRole('navigation', { name: 'Workspace' })).toHaveCount(0);
    expect(me).toBeLessThan(10);
  });
