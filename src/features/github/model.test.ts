import { describe, expect, it } from 'vitest';
import { ids, githubUrl, parseSettings, parsePreview, terminal, parseJob } from './model';
import { retryAt } from './errors';
import { HttpError } from '../../shared/http/client';

describe('GitHub boundary', () => {
  it('requires positive safe numeric IDs, deduplicates and limits filter groups', () => {
    expect(ids('2, 1,2')).toEqual([1, 2]);
    for (const value of ['octocat', '0', '-1', '1.2', '9007199254740992'])
      expect(() => ids(value)).toThrow();
    expect(() => ids(Array.from({ length: 21 }, (_, i) => i + 1).join(','))).toThrow();
  });
  it('rejects unsafe authorization and repository URL destinations', () => {
    for (const value of [
      'javascript:alert(1)',
      'https://github.com.evil.test',
      'https://user@github.com',
      'http://github.com',
      'https://github.com:1234',
    ])
      expect(githubUrl(value)).toBeUndefined();
    expect(githubUrl('https://github.com/a/b')).toBe('https://github.com/a/b');
  });
  it('keeps null mapping and distinguishes explicit import eligibility from auto criteria', () => {
    expect(
      parseSettings({
        revision: 1,
        generation: 0,
        enabled: false,
        paused: false,
        baselineReady: false,
        criteria: { labelIds: [], assigneeIds: [] },
        mapping: { todoLabelId: 1, doingLabelId: 2, doneLabelId: null },
      }).mapping.doneLabelId,
    ).toBeNull();
    const preview = parsePreview({
      revision: 1,
      baselineReady: true,
      total: 1,
      nextAfterIssueId: 501,
      items: [
        {
          issueId: 501,
          issueNumber: 2,
          taskId: null,
          status: 'todo',
          statusReason: null,
          errorCode: null,
          matches: false,
          excluded: true,
        },
      ],
    });
    expect(preview.items[0]).toMatchObject({ matches: false, excluded: true, errorCode: null });
    expect(preview.nextAfterIssueId).toBe(501);
  });
  it('treats partial as terminal without interpreting stage/page', () => {
    const job = parseJob({
      id: '00000000-0000-0000-0000-000000000001',
      linkId: '00000000-0000-0000-0000-000000000002',
      kind: 'detach',
      state: 'partial',
      completedCount: 50,
      failedCount: 1,
      errorCode: null,
      items: [],
      stage: 'not-a-control',
      page: 900,
    });
    expect(terminal(job)).toBe(true);
  });
  it('uses Retry-After seconds and dates without guessing missing values', () => {
    expect(retryAt(new HttpError(429, 'GITHUB_RATE_LIMITED', '', {}, undefined, '60'), 1000)).toBe(
      61000,
    );
    expect(retryAt(new HttpError(429, 'GITHUB_RATE_LIMITED', ''))).toBeUndefined();
    expect(
      retryAt(
        new HttpError(
          429,
          'GITHUB_RATE_LIMITED',
          '',
          {},
          undefined,
          'Wed, 21 Oct 2026 07:28:00 GMT',
        ),
        0,
      ),
    ).toBe(Date.parse('2026-10-21T07:28:00Z'));
  });
});
