import { useState, useSyncExternalStore } from 'react';
import { useQuery } from '../../shared/http/query';
import { Button } from '../../shared/ui/controls';
import type { GitHubStore } from './store';
import { ids, githubUrl, type Preview } from './model';
import { errorText, itemError } from './errors';
import { Feedback } from './Feedback';
import { JobProgress } from './JobProgress';
import { SafeMarkdown } from '../../shared/ui/SafeMarkdown';

export function IssueBrowser({
  store,
  base,
  blocked,
}: {
  store: GitHubStore;
  base: string;
  blocked: boolean;
}) {
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [filters, setFilters] = useState({
    state: 'open',
    labelIds: '',
    assigneeIds: '',
    limit: '20',
  });
  const [applied, setApplied] = useState(new URLSearchParams({ state: 'open', limit: '20' }));
  const [cursor, setCursor] = useState(''),
    [selected, setSelected] = useState<number[]>([]);
  const [preview, setPreview] = useState<Preview>(),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const [previewRequest, setPreviewRequest] = useState<{
    conditions: boolean;
    selection: number[];
  }>({ conditions: false, selection: [] });
  const [labelCursor, setLabelCursor] = useState('');
  const params = new URLSearchParams(applied);
  if (cursor) params.set('cursor', cursor);
  const query = store.issues(base, params),
    state = useQuery(query);
  const labelsQuery = store.labels(base, labelCursor),
    labels = useQuery(labelsQuery);
  const jobId = store.jobs.get(base);
  const apply = () => {
    try {
      const limit = Number(filters.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new Error('페이지 크기는 1–100으로 입력하세요.');
      const next = new URLSearchParams({ limit: String(limit) });
      if (filters.state) next.set('state', filters.state);
      const labelIds = ids(filters.labelIds),
        assigneeIds = ids(filters.assigneeIds);
      if (labelIds.length) next.set('labelIds', labelIds.join(','));
      if (assigneeIds.length) next.set('assigneeIds', assigneeIds.join(','));
      setApplied(next);
      setCursor('');
      setSelected([]);
      setPreview(undefined);
      setNotice('');
    } catch (e) {
      setNotice(errorText(e));
    }
  };
  const inspect = async (selection = selected, afterIssueId?: number, conditions = false) => {
    setBusy(true);
    setNotice('');
    try {
      const result = await store.preview(base, {
        ...(conditions ? {} : { issueIds: selection }),
        limit: 100,
        ...(afterIssueId === undefined ? {} : { afterIssueId }),
      });
      if (afterIssueId === undefined) setSelected(selection);
      setPreviewRequest({ conditions, selection });
      setPreview(result);
    } catch (e) {
      setPreview(undefined);
      setNotice(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const submit = async (retry = false) => {
    if (!retry && (!preview || !selected.length)) return;
    setBusy(true);
    setNotice('');
    try {
      await store.submit(
        base,
        'task-imports',
        preview ? { revision: preview.revision, issueIds: selected } : undefined,
        retry,
      );
      setPreview(undefined);
      setSelected([]);
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const ready = state.status === 'ready' && state.data;
  return (
    <section className="github-panel" aria-label="GitHub Issue 가져오기">
      <h3>Issue 가져오기</h3>
      <p>수집 범위: 모든 open Issue · 최근 90일 갱신 closed Issue. PR은 제외합니다.</p>
      <p>가져오기는 최대 100개씩 선택하며 대기 작업 상한은 10개입니다.</p>
      <div className="github-filters">
        <label>
          Issue 상태
          <select
            value={filters.state}
            onChange={(e) => setFilters({ ...filters, state: e.target.value })}
          >
            <option value="">전체</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label>
          라벨 ID (모두 일치)
          <input
            value={filters.labelIds}
            onChange={(e) => setFilters({ ...filters, labelIds: e.target.value })}
            placeholder="쉼표로 구분, 최대 20개"
          />
        </label>
        <label>
          담당자 numeric ID (하나 이상 일치)
          <input
            value={filters.assigneeIds}
            onChange={(e) => setFilters({ ...filters, assigneeIds: e.target.value })}
            placeholder="이름 검색은 지원하지 않습니다"
          />
        </label>
        <label>
          페이지 크기
          <input
            type="number"
            min="1"
            max="100"
            value={filters.limit}
            onChange={(e) => setFilters({ ...filters, limit: e.target.value })}
          />
        </label>
      </div>
      <div className="github-actions">
        <Button onClick={apply}>필터 적용</Button>
        <Button
          onClick={() => {
            setCursor('');
            setSelected([]);
            setPreview(undefined);
            query.invalidate(true);
          }}
        >
          목록 새로고침
        </Button>
      </div>
      <details>
        <summary>라벨 이름과 ID 확인</summary>
        <Feedback store={store} query={labelsQuery} state={labels} />
        {labels.status === 'ready' &&
          labels.data?.items.map((l) => (
            <p key={l.id}>
              {l.name} · ID {l.id}{' '}
              <Button
                onClick={() =>
                  setFilters({
                    ...filters,
                    labelIds: [filters.labelIds, l.id].filter(Boolean).join(','),
                  })
                }
              >
                필터에 추가
              </Button>
            </p>
          ))}
        <Button disabled={!labelCursor} onClick={() => setLabelCursor('')}>
          라벨 처음
        </Button>
        <Button
          disabled={!labels.data?.nextCursor}
          onClick={() => setLabelCursor(labels.data!.nextCursor!)}
        >
          라벨 다음
        </Button>
      </details>
      <Feedback store={store} query={query} state={state} />
      {ready && (
        <>
          <p>
            현재 수집·필터 범위 {ready.total}개 ·{' '}
            {ready.coverage.state === 'collecting' ? '수집 중' : '초기 범위 수집 완료'}
          </p>
          {!ready.items.length && <p>표시할 Issue가 없습니다.</p>}
          {ready.items.map((issue) => (
            <div key={issue.id} className="github-issue">
              <label className="github-issue-check">
                <input
                  type="checkbox"
                  aria-label={`Issue #${issue.number} 선택`}
                  checked={selected.includes(issue.id)}
                  disabled={
                    blocked || busy || (!selected.includes(issue.id) && selected.length >= 100)
                  }
                  onChange={(e) => {
                    setSelected(
                      e.target.checked
                        ? [...selected, issue.id]
                        : selected.filter((id) => id !== issue.id),
                    );
                    setPreview(undefined);
                  }}
                />
              </label>
              <div>
                <strong>
                  #{issue.number} {issue.title}
                </strong>
                <p>
                  {issue.state} · 라벨 ID {issue.labelIds.join(', ') || '없음'} · 담당자 ID{' '}
                  {issue.assigneeIds.join(', ') || '없음'}
                </p>
                {issue.contentOverflow && <p>내용 길이 초과 · 원문 수정이 필요합니다.</p>}
                {githubUrl(issue.htmlUrl) && (
                  <a href={githubUrl(issue.htmlUrl)} target="_blank" rel="noopener noreferrer">
                    원문 ↗
                  </a>
                )}
                <details>
                  <summary>본문 보기</summary>
                  <SafeMarkdown text={issue.body} />
                </details>
              </div>
            </div>
          ))}
          <div className="github-actions">
            <Button disabled={!cursor} onClick={() => setCursor('')}>
              첫 페이지
            </Button>
            <Button disabled={!ready.nextCursor} onClick={() => setCursor(ready.nextCursor!)}>
              다음 Issue
            </Button>
          </div>
        </>
      )}
      <div className="github-selection">
        <strong>{selected.length}/100개 선택</strong>
        <Button disabled={busy || blocked || !selected.length} onClick={() => void inspect()}>
          선택 미리보기
        </Button>
        <Button disabled={busy || blocked} onClick={() => void inspect([], undefined, true)}>
          자동 조건의 기존 후보 확인
        </Button>
      </div>
      {preview && (
        <div className="github-panel">
          <h4>가져오기 미리보기</h4>
          <p>예약이 아닙니다. 실제 결과는 접근·원문·설정 변경에 따라 달라질 수 있습니다.</p>
          {preview.items.map((i) => (
            <div className="github-row" key={i.issueId}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(i.issueId)}
                  disabled={
                    busy || blocked || (!selected.includes(i.issueId) && selected.length >= 100)
                  }
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, i.issueId]
                        : selected.filter((id) => id !== i.issueId),
                    )
                  }
                />
                #{i.issueNumber} · {i.status} {i.statusReason} {itemError(i.errorCode)}
              </label>
              <small>
                {!i.matches && '자동 조건 불일치 · 선택 가져오기 가능'}{' '}
                {i.excluded && '자동 제외 · 새 Task로 가져옴'}
              </small>
            </div>
          ))}
          <Button
            disabled={busy || !preview.nextAfterIssueId}
            onClick={() =>
              void inspect(
                previewRequest.selection,
                preview.nextAfterIssueId!,
                previewRequest.conditions,
              )
            }
          >
            미리보기 다음
          </Button>
          <Button
            variant="primary"
            disabled={busy || blocked || !selected.length}
            onClick={() => void submit()}
          >
            선택 Issue 가져오기
          </Button>
        </div>
      )}
      {store.intents.has(base) && (
        <div className="notice">
          <p>응답을 확인하지 못했습니다. 서버 작업이 접수됐을 수 있습니다.</p>
          <Button disabled={busy || blocked} onClick={() => void submit(true)}>
            동일 요청으로 결과 확인
          </Button>
        </div>
      )}
      {notice && <p role="alert">{notice}</p>}
      {jobId && (
        <JobProgress
          key={jobId}
          store={store}
          base={base}
          id={jobId}
          onRetry={(selection) => void inspect(selection)}
        />
      )}
    </section>
  );
}
