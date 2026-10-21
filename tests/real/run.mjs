import { validateWorkspaceLayout } from './workspace-layout.mjs';
import { validateGitHub } from './github.mjs';
import { validateLinks } from './links.mjs';
import { validateDocuments } from './documents.mjs';
import { validateDashboard } from './dashboard.mjs';
import { validateProjects } from './projects.mjs';
import { validateCategories } from './categories.mjs';
import { validateCategoryOnly } from './category-only.mjs';
import { validateTasks } from './tasks.mjs';
import { validateJournals } from './journals.mjs';
import { validateJournalSearch } from './journal-search.mjs';
import { validateMilestones } from './milestones.mjs';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { startProvider } from './oidc-provider.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backendCandidates = [
  process.env.BACKEND_ROOT,
  path.resolve(root, '../backend'),
  path.resolve(root, '../dev-back/devspace'),
].filter(Boolean);
const backend = backendCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'gradlew.bat')),
);
if (!backend) throw new Error('No sibling backend checkout with gradlew.bat was found.');
const phase = process.argv.find((arg) => arg.startsWith('--projects='))?.split('=')[1];
const categoryPhase = process.argv.includes('--categories');
const categoryOnlyPhase = process.argv.includes('--category-only');
const documentUiPhase = process.argv.includes('--document-ui');
const documentPhase = process.argv.includes('--documents') || documentUiPhase;
const layoutPhase = process.argv.includes('--workspace-layout');
const githubPhase = process.argv.includes('--github');
const journalSearchPhase = process.argv.includes('--journal-search');
const taskPhase = process.argv.find((arg) => arg.startsWith('--tasks='))?.split('=')[1];
const journalPhase = process.argv.find((arg) => arg.startsWith('--journals='))?.split('=')[1];
const milestonePhase = process.argv.find((arg) => arg.startsWith('--milestones='))?.split('=')[1];
const linkPhase = process.argv.find((arg) => arg.startsWith('--links='))?.split('=')[1];
const dashboardPhase = process.argv.find((arg) => arg.startsWith('--dashboard='))?.split('=')[1];
if (phase || categoryPhase || taskPhase || journalPhase || milestonePhase || linkPhase)
  throw new Error(
    'Historical feature phases target the retired v1 contract. Use --category-only or --dashboard for the coordinated acceptance suites.',
  );
const nginx = process.argv.includes('--nginx');
const frontendPort = Number(process.env.REAL_FRONTEND_PORT ?? 4175);
assert(Number.isInteger(frontendPort) && frontendPort > 1023 && frontendPort < 65536);
const origin = nginx ? 'http://127.0.0.1:4177' : `http://127.0.0.1:${frontendPort}`;
const output = path.join(root, '.auth-validation', nginx ? 'nginx' : 'vite');
fs.mkdirSync(output, { recursive: true });
const children = [];
const logs = [];
let browser;
let provider;
let container;
let network;
const runId = 'plan0009-' + Date.now();
function launch(command, args, options, name) {
  const child = spawn(command, args, {
    windowsHide: true,
    ...options,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const log = fs.createWriteStream(path.join(output, name + '.log'));
  logs.push(log);
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  children.push(child);
  return child;
}
async function ready(url, child) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    if (child?.exitCode !== null && child?.exitCode !== undefined)
      throw new Error('Server exited before readiness; inspect sanitized local server log.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.status < 500) return;
    } catch {
      /* bounded startup polling */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Server readiness deadline exceeded: ' + url);
}
function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8', windowsHide: true }).trim();
}

try {
  // Refuse an unrelated server rather than reusing an unknown security configuration.
  for (const port of [18080, Number(new URL(origin).port)]) {
    try {
      await fetch('http://127.0.0.1:' + port, { signal: AbortSignal.timeout(500) });
      throw new Error('Port already occupied: ' + port);
    } catch (error) {
      if (error.message.startsWith('Port already')) throw error;
    }
  }
  const before = new Set(docker(['ps', '-q']).split('\n'));
  provider = await startProvider(origin);
  const env = {
    ...process.env,
    JAVA_HOME: process.env.JAVA_HOME || 'C:\\Users\\nellu\\.jdks\\corretto-21.0.12.1',
    SPRING_PROFILES_ACTIVE: 'test',
    SERVER_PORT: '18080',
    SPRING_CONFIG_IMPORT: 'optional:file:./plan0009-no-env.properties',
    // bootTestRun owns a new empty Testcontainer, never the local workspace DB.
    // Do not inherit a production cutover manifest imported by application.yml.
    SPRING_APPLICATION_JSON: JSON.stringify({
      'spring.flyway.init-sqls': [
        "select set_config('devspace.category_cutover_manifest','',false)",
      ],
    }),
    APP_ORIGIN: origin,
    APP_SECURITY_ORIGIN: origin,
    SESSION_COOKIE_SECURE: 'false',
    OIDC_GOOGLE_CLIENT_ID: 'test-google-client',
    OIDC_GOOGLE_CLIENT_SECRET: 'test-google-secret',
    OIDC_GOOGLE_ISSUER_URI: 'http://127.0.0.1:18999',
    OIDC_GOOGLE_REDIRECT_URI: origin + '/api/v1/auth/callback/google',
    SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_REDIRECT_URI:
      origin + '/api/v1/auth/callback/google',
    PROJECT_CURSOR_SIGNING_KEY: 'test-only-project-cursor-signing-key-at-least-32-bytes',
    DB_URL: 'jdbc:postgresql://127.0.0.1:1/unused',
    DB_USERNAME: 'unused',
    DB_PASSWORD: 'unused',
  };
  const backendProcess = launch(
    'cmd.exe',
    ['/d', '/s', '/c', 'gradlew.bat bootTestRun --no-daemon'],
    { cwd: backend, env },
    'backend',
  );
  await ready('http://127.0.0.1:18080/api/v1/me', backendProcess);
  console.log('Unchanged backend test launcher ready with disposable PostgreSQL.');
  // Other workspaces can start Testcontainers concurrently. Bind to this owned
  // backend process's startup evidence instead of claiming all new containers.
  const databaseIds = [
    ...fs
      .readFileSync(path.join(output, 'backend.log'), 'utf8')
      .matchAll(/Container postgres:16\.4 is starting: ([a-f0-9]{64})/g),
  ].map((match) => match[1]);
  assert.equal(databaseIds.length, 1, 'Owned backend must identify exactly one test database');
  const database = databaseIds[0];
  assert(!before.has(database.slice(0, 12)), 'Owned database must be new for this run');
  assert.equal(docker(['inspect', '--format', '{{.Config.Image}}', database]), 'postgres:16.4');
  const sql = (query) =>
    docker([
      'exec',
      database,
      'psql',
      '-U',
      'test',
      '-d',
      'test',
      '-tA',
      '-v',
      'ON_ERROR_STOP=1',
      '-c',
      query,
    ]);
  assert.equal(sql('select count(*) from users'), '0');
  if (nginx) {
    // The runtime template uses Docker's embedded DNS (127.0.0.11),
    // which is provided on user-defined networks, as in Compose deployment.
    network = runId + '-network';
    docker(['network', 'create', network]);
    docker(['build', '-t', 'devspace-plan0009', '.']);
    container = runId;
    docker([
      'run',
      '-d',
      '--rm',
      '--name',
      container,
      '--network',
      network,
      '-p',
      '127.0.0.1:4177:10000',
      '-e',
      'BACKEND_UPSTREAM=http://host.docker.internal:18080',
      'devspace-plan0009',
    ]);
    fs.writeFileSync(
      path.join(output, 'nginx-config.txt'),
      docker(['exec', container, 'nginx', '-T']),
    );
    await ready(origin + '/api/v1/me');
    assert(
      !docker(['exec', container, 'find', '/usr/share/nginx/html', '-type', 'f']).includes(
        'tests/',
      ),
    );
  } else {
    const frontend = launch(
      process.execPath,
      [
        'node_modules/vite/bin/vite.js',
        '--configLoader',
        'runner',
        '--host',
        '127.0.0.1',
        '--port',
        String(frontendPort),
        '--strictPort',
      ],
      { cwd: root, env: { ...process.env, BACKEND_UPSTREAM: 'http://127.0.0.1:18080' } },
      'frontend',
    );
    await ready(origin, frontend);
  }
  browser = await chromium.launch();
  const context = await browser.newContext();
  const sentinels = Object.fromEntries(
    ['projects', 'tasks', 'journals', 'milestones', 'links', 'layout', 'unrelated'].map(
      (name, index) => [
        'devspace.' + name + '.v1',
        index % 2 ? '{malformed-preserved' : '[{"id":"personal-edit","name":"Keep my work"}]',
      ],
    ),
  );
  await context.addInitScript(
    ({ origin, sentinels }) => {
      if (location.origin === origin && !Object.hasOwn(localStorage, 'devspace.unrelated.v1'))
        for (const [key, value] of Object.entries(sentinels)) localStorage.setItem(key, value);
    },
    { origin, sentinels },
  );
  const page = await context.newPage();
  const excluded = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (
      url.pathname.startsWith('/api/') &&
      !/^\/api\/(?:v1\/(?:me$|auth\/|project-categories(?:\/|$)|widget-types$|widgets(?:\/|$))|v2\/(?:integrations\/github(?:\/|$)|projects(?:\/|$)|tasks(?:\/|$)|journals(?:\/|$)|documents(?:\/|$)|attachments(?:\/|$)|milestones(?:\/|$)|links(?:\/|$)|overview$)|v3\/dashboards\/home(?:\/|$))/.test(
        url.pathname,
      )
    )
      excluded.push(url.pathname);
  });
  assert.equal((await context.request.get(origin + '/api/v1/me')).status(), 401);
  for (const prefix of ['/api', '/oauth2', '/api/unknown', '/oauth2/unknown']) {
    const response = await context.request.get(origin + prefix, { maxRedirects: 0 });
    assert(response.status() >= 400 || response.status() === 302);
    assert(!(response.headers()['content-type'] ?? '').includes('text/html'));
  }
  const loginDestination = githubPhase
    ? '/github/connection-result?github=connected'
    : journalSearchPhase
      ? '/journals'
      : categoryOnlyPhase
        ? '/projects?category=uncategorized&q=hello'
        : dashboardPhase
          ? '/projects?category=all&q=hello'
          : '/projects/example?scope=all&q=hello';
  await page.goto(origin + loginDestination);
  assert.equal(await page.title(), 'devspace. · 나만의 개발 작업실');
  await page.getByRole('button', { name: 'Google로 계속하기' }).click();
  await page.getByRole('link', { name: 'alice', exact: true }).click();
  try {
    await page.waitForURL(origin + loginDestination);
  } catch (error) {
    console.error(
      'Authentication return navigation did not settle:',
      page.url(),
      await page.title(),
    );
    throw error;
  }
  if (categoryOnlyPhase)
    await expect(page.getByLabel('개발 분야 필터', { exact: true })).toHaveValue('uncategorized');
  const me = await context.request.get(origin + '/api/v1/me');
  assert.equal(me.status(), 200);
  const alice = await me.json();
  assert.equal(alice.displayName, 'Alice Example');
  assert.equal(alice.workspace.revision, 1);
  await expect(page.locator('.sidebar .profile strong')).toHaveText('Alice Example');
  await page.screenshot({ path: path.join(output, 'authenticated-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(output, 'authenticated-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  const contractResponse = await context.request.get('http://127.0.0.1:18080/v3/api-docs');
  assert.equal(contractResponse.status(), 200);
  const contract = await contractResponse.json();
  assert.deepEqual(contract.components.schemas.MeResponse.required.slice().sort(), [
    'displayName',
    'id',
    'workspace',
  ]);
  assert.deepEqual(contract.components.schemas.WorkspaceResponse.required.slice().sort(), [
    'id',
    'name',
    'revision',
  ]);
  assert.deepEqual(contract.components.schemas.CsrfTokenResponse.required, ['csrfToken']);
  assert(contract.paths['/api/v1/me'].get.responses['401']);
  assert(contract.paths['/api/v1/auth/logout'].post.responses['204']);
  assert(contract.paths['/api/v1/auth/login'].get.responses['302']);
  assert(
    !Object.keys(contract.paths).some(
      (key) => key.includes('browser-test') || key.includes('fixture'),
    ),
  );
  fs.writeFileSync(
    path.join(output, 'auth-contract.json'),
    JSON.stringify(
      {
        paths: Object.fromEntries(
          Object.entries(contract.paths).filter(
            ([key]) => key === '/api/v1/me' || key.startsWith('/api/v1/auth/'),
          ),
        ),
        schemas: Object.fromEntries(
          ['MeResponse', 'WorkspaceResponse', 'CsrfTokenResponse', 'ApiError'].map((key) => [
            key,
            contract.components.schemas[key],
          ]),
        ),
      },
      null,
      2,
    ),
  );
  assert.deepEqual(
    await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))),
    sentinels,
  );
  await page.reload();
  assert.equal((await context.request.get(origin + '/api/v1/me')).status(), 200);
  assert.equal(sql('select count(*) from users'), '1');
  assert.equal(sql('select count(*) from workspaces'), '1');
  const counts = sql(
    'select (select count(*) from projects)+(select count(*) from tasks)+(select count(*) from journals)+(select count(*) from milestones)+(select count(*) from links)',
  );
  assert.equal(counts, '0');
  await page.waitForLoadState('networkidle');
  const retainedShell = await page.locator('.app-shell').elementHandle();
  assert(retainedShell);
  const focusReads = [];
  const observeFocus = (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) focusReads.push(url.pathname);
  };
  page.on('request', observeFocus);
  const verifiedFocus = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/api/v1/me',
  );
  await page.evaluate(() => {
    const now = Date.now();
    Date.now = () => now + 31_000;
    window.dispatchEvent(new Event('focus'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  assert.equal((await verifiedFocus).status(), 200);
  await page.waitForLoadState('networkidle');
  assert(await retainedShell.evaluate((node) => node.isConnected));
  assert.deepEqual(
    focusReads.sort(),
    githubPhase ? ['/api/v1/me', '/api/v2/integrations/github/account'] : ['/api/v1/me'],
  );
  page.off('request', observeFocus);
  console.log(
    'Real focus verification preserves the application DOM and feature stores without business refetch.',
  );
  if (phase) await validateProjects({ page, context, origin, sql, alice, output, phase });
  if (categoryPhase) await validateCategories({ page, context, origin, sql, alice, output });
  if (categoryOnlyPhase) await validateCategoryOnly({ page, context, origin, sql, alice, output });
  if (taskPhase)
    await validateTasks({ page, context, origin, sql, alice, output, phase: taskPhase });
  if (journalPhase)
    await validateJournals({ page, context, origin, sql, alice, output, phase: journalPhase });
  if (linkPhase)
    await validateLinks({ page, context, origin, sql, alice, output, phase: linkPhase });
  if (milestonePhase)
    await validateMilestones({ page, context, origin, sql, alice, output, phase: milestonePhase });
  if (dashboardPhase) await validateDashboard({ page, context, origin, sql, alice, output });
  if (journalSearchPhase) await validateJournalSearch({ page, context, origin, output });
  if (documentPhase) {
    for (const route of ['/', '/projects', '/tasks', '/journals', '/library']) {
      await page.goto(origin + route);
      await expect(page.locator('.page-footer')).toHaveCount(0);
      await expect(page.locator('main .session-controls')).toHaveCount(0);
      await page.getByRole('button', { name: '프로필 메뉴', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Log out', exact: true })).toHaveCount(1);
      await page.keyboard.press('Escape');
    }
    await validateDocuments({
      page,
      context,
      origin,
      sql,
      alice,
      output,
      apiBoundaries: !documentUiPhase,
    });
  }
  if (layoutPhase) await validateWorkspaceLayout({ page, context, origin, output });
  if (githubPhase) await validateGitHub({ page, context, origin, output, contract });
  const businessRowsBeforeAuth = sql(
    'select (select count(*) from projects)+(select count(*) from tasks)+(select count(*) from journals)+(select count(*) from milestones)+(select count(*) from links)',
  );
  const csrf = await context.request.get(origin + '/api/v1/auth/csrf');
  assert.equal(csrf.status(), 200);
  const token = (await csrf.json()).csrfToken;
  assert.equal(
    (
      await context.request.post(origin + '/api/v1/auth/logout', { headers: { Origin: origin } })
    ).status(),
    403,
  );
  assert.equal(
    (
      await context.request.post(origin + '/api/v1/auth/logout', {
        headers: { Origin: 'https://forbidden.example', 'X-CSRF-Token': token },
      })
    ).status(),
    403,
  );
  const logout = await context.request.post(origin + '/api/v1/auth/logout', {
    headers: { Origin: origin, 'X-CSRF-Token': token },
  });
  assert.equal(logout.status(), 204);
  assert.equal(await logout.text(), '');
  assert.equal((await context.request.get(origin + '/api/v1/me')).status(), 401);
  assert.equal((await context.request.post(origin + '/api/v1/auth/logout')).status(), 204);
  assert.equal(excluded.length, 0);
  await page.goto(origin);
  await page.getByRole('button', { name: 'Google로 계속하기' }).click();
  await page.getByRole('link', { name: 'bob', exact: true }).click();
  await expect(page.locator('.authenticated-workspace')).toHaveAttribute(
    'aria-label',
    /^Bob Example · /,
  );
  const bob = await (await context.request.get(origin + '/api/v1/me')).json();
  assert.notEqual(bob.id, alice.id);
  assert.notEqual(bob.workspace.id, alice.workspace.id);
  assert.equal(sql('select count(*) from users'), '2');
  assert.equal(sql('select count(*) from workspaces'), '2');
  assert.deepEqual(
    await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))),
    sentinels,
  );
  // Isolated SQL exercises the existing disabled callback behavior without backend fixtures.
  assert.equal(
    sql("update users set disabled_at=now() where id='" + alice.id + "' returning id").split(
      '\n',
    )[0],
    alice.id,
  );
  await page.route('**/api/v1/auth/logout', (route) => route.abort('failed'), { times: 1 });
  await page.getByRole('button', { name: '프로필 메뉴', exact: true }).click();
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Retry logout', exact: true })).toBeVisible();
  const [uiLogoutResponse] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url() === origin + '/api/v1/auth/logout' && response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Retry logout', exact: true }).click(),
  ]);
  assert.equal(uiLogoutResponse.status(), 204);
  await expect(page.getByRole('heading', { name: '로그인하여 계속하세요' })).toBeVisible();
  await page.goto(origin);
  await page.getByRole('button', { name: 'Google로 계속하기' }).click();
  const disabledResponse = page.waitForResponse((response) =>
    response.url().startsWith(origin + '/api/v1/auth/callback/google'),
  );
  await page.getByRole('link', { name: 'alice', exact: true }).click();
  const disabled = await disabledResponse;
  assert.equal(disabled.status(), 403);
  assert.equal((await disabled.json()).code, 'ACCOUNT_DISABLED');
  assert.equal((await context.request.get(origin + '/api/v1/me')).status(), 401);
  await page.goto(origin);
  await page.getByRole('button', { name: 'Google로 계속하기' }).click();
  await page.getByRole('link', { name: 'cancel', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Google 로그인에 실패했습니다. 다시 시도해 주세요.',
  );
  assert(!page.url().includes('authError'));
  assert.deepEqual(
    await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))),
    sentinels,
  );
  assert.equal(
    sql(
      'select (select count(*) from projects)+(select count(*) from tasks)+(select count(*) from journals)+(select count(*) from milestones)+(select count(*) from links)',
    ),
    businessRowsBeforeAuth,
  );
  assert.equal(provider.stats.pkce, documentPhase ? 4 : 3);
  assert.equal(excluded.length, 0);
  await page.screenshot({ path: path.join(output, 'entry.png'), fullPage: true });
  execFileSync('taskkill', ['/PID', String(backendProcess.pid), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore',
  });
  const unavailable = await context.request.get(origin + '/api/v1/me');
  assert(unavailable.status() >= 500, 'Unavailable backend must not become successful SPA HTML');
  assert.equal((await context.request.get(origin + '/projects/deep-link')).status(), 200);
  fs.writeFileSync(
    path.join(output, 'result.json'),
    JSON.stringify(
      {
        boundary: nginx ? 'nginx' : 'vite',
        passed: true,
        protocol: provider.stats,
        businessRows: Number(businessRowsBeforeAuth),
        excludedRequests: 0,
      },
      null,
      2,
    ),
  );
  console.log(
    'Real session/proxy smoke passed: callback, PKCE, reload, CSRF, Origin, logout, no authentication-created business rows.',
  );
} finally {
  await browser?.close();
  if (container) {
    try {
      docker(['stop', container]);
    } catch {
      /* already exited */
    }
  }
  if (network) {
    try {
      docker(['network', 'rm', network]);
    } catch {
      /* already removed */
    }
  }
  for (const child of children.reverse()) {
    if (child.exitCode === null) {
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
      } catch {
        /* already exited */
      }
    }
  }
  await provider?.close();
  for (const log of logs) log.end();
}
