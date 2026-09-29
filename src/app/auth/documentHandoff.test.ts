import { expect, it, vi } from 'vitest';
import { AuthSession } from './session';
import { documentHandoff } from './documentHandoff';
const identity = {
  id: '11111111-1111-4111-8111-111111111111',
  displayName: 'Alice',
  workspace: { id: '22222222-2222-4222-8222-222222222222', name: 'Workspace', revision: 1 },
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
it('retains a document draft across same-identity verification and clears it for account replacement', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(identity));
  const session = new AuthSession(fetcher);
  const memory = documentHandoff(session);
  await session.verify();
  const draft = { id: identity.id, title: 'local draft', content: [], attachments: [] };
  memory().draft = draft;
  memory().returns[draft.id] = '/journals';
  fetcher.mockResolvedValue(response(identity));
  await session.verify();
  expect(memory().draft).toBe(draft);
  fetcher.mockResolvedValue(response({ ...identity, id: '33333333-3333-4333-8333-333333333333' }));
  await session.verify();
  expect(memory().draft).toBeUndefined();
  expect(memory().returns).toEqual({});
});
it('drops document memory when the session ends', async () => {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response(identity));
  const session = new AuthSession(fetcher);
  const memory = documentHandoff(session);
  await session.verify();
  memory().draft = { id: identity.id, title: 'private', content: [], attachments: [] };
  fetcher.mockResolvedValue(response({}, 401));
  await session.verify();
  expect(memory().draft).toBeUndefined();
});
