# Testing

## Applicability and explicit user override

Follow this guide by default unless the user explicitly requests verification only in the already-running local frontend, without separate tests, for a simple UI-only change.

- The user decides when to request this exception; do not infer it merely because a change appears small.
- For that task, inspect and interact with the running local frontend directly. Do not create test code, screenshot-generation scripts, fixtures, or test infrastructure, and do not run automated tests or the separate validation commands listed below unless the user requests them.
- This exception also overrides this guide's regression-test requirement for that UI-only task. Preserve functionality, API behavior and data; do not mutate real business data merely for verification.
- If the work turns out to require functional, API, authentication or persistence changes, explain the scope change and ask the user how to proceed instead of silently broadening the work or running tests.
- In the final response, state what was checked directly and that automated tests were not run at the user's request. Do not describe direct inspection as an automated test pass.
- Without this explicit request, all applicable sections below remain in effect.

## General

- Test behavior changed by the current task.
- Keep tests deterministic and independent.
- Prefer existing test infrastructure before adding new configs, runners, fixtures, or scripts.
- Do not weaken tests just to obtain a pass.

## Playwright

- Use the shared `playwright.config.ts` by default.
- Do not create a new Playwright config for each feature, Plan, page, or bug fix.
- Prefer directories, test filters, fixtures, helpers, tags, or Playwright projects.
- Create a separate config only when runtime infrastructure is genuinely different.
- Remove temporary test infrastructure after validation.

## Regression

For bug fixes:

1. Reproduce the issue.
2. Add a regression test to the nearest existing suite.
3. Apply the fix.
4. Run the affected tests again.

## Visual Changes

For UI changes, verify:

- desktop/mobile layout
- responsive behavior
- keyboard/focus behavior
- loading/error/empty/pending states
- unexplained visual regressions

A passing DOM/API test alone does not prove visual correctness.

## Real Integration

Use the existing `tests/real/` harness when changes affect API integration, authentication, persistence, concurrency, proxying, or production routing.

Do not create another feature-specific real-backend harness unless necessary.

Document integration uses `node tests/real/run.mjs --documents` and then `node tests/real/run.mjs --documents --nginx`. The existing harness owns a fresh PostgreSQL test container, Backend temporary file storage and OIDC provider. `APP_SECURITY_ORIGIN` explicitly matches the Vite/Nginx origin even when the Backend test profile has a fixed default. It never mutates the running port-8080 workspace. Results and responsive screenshots are under `.auth-validation/vite` and `.auth-validation/nginx`.

`tests/real/documents.mjs` covers actual draft creation, serialized writes, dropped-response reconciliation, publication, block restoration, multipart/clipboard/drop uploads, authenticated downloads, JSON/file boundaries, navigation protection and deletion. Existing Journal CRUD regressions remain in `npx playwright test --config playwright.journals.config.ts`; their document collection requests are aborted so that this isolated fixture suite never falls through to a live unauthenticated API or introduces a Document success mock.

## Validation

Run the checks relevant to the change:

- `npm run build`
- `npm test`
- `npm run test:e2e`
- `npm run check:boundaries`
- `npm run check:docs`
- `npm run format:check`

Diagnose recoverable failures, fix the root cause, revalidate, and continue.
