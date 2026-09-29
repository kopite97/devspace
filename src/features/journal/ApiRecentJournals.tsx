import type { CategoryFilter } from '../projects/categoryFilter';
import { ChevronRight } from 'lucide-react';
import { type ReactNode } from 'react';
import { Button, EmptyState } from '../../shared/ui/controls';
import { useQuery } from '../../shared/http/query';
import { presentation } from './apiModel';
import type { JournalStore } from './apiStore';

export function ApiRecentJournals({
  store,
  category = 'all',
  projectId,
  limit = 3,
  emptyAction,
  onOpenJournal,
}: {
  store: JournalStore;
  category?: CategoryFilter;
  projectId?: string;
  limit?: number;
  emptyAction?: ReactNode;
  onOpenJournal: (id: string) => void;
}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 20)
    throw new Error('Journal widget limit must be 1–20');
  const filter = {
    category,
    projectId,
    projectStatus: 'all' as const,
    query: '',
    sort: 'newest' as const,
    limit,
  };
  const query = store.list(filter);
  const state = useQuery(query);
  if (state.status === 'loading' && !state.data) return <p role="status">불러오는 중…</p>;
  if (state.status === 'error' && !state.data)
    return (
      <p className="notice" role="alert">
        최근 개발일지를 불러오지 못했습니다.{' '}
        <Button onClick={() => void query.load()}>다시 시도</Button>
      </p>
    );
  if (state.status === 'error' && state.data && !state.data.items.length)
    return (
      <>
        <p className="notice" role="alert">
          Recent Journals could not be refreshed.{' '}
          <Button type="button" onClick={() => void query.load()}>
            Retry
          </Button>
        </p>
        <EmptyState title={projectId ? 'No Journals for this Project' : 'No recent Journals'}>
          {emptyAction}
        </EmptyState>
      </>
    );
  if (!state.data?.items.length)
    return (
      <EmptyState title={projectId ? '이 프로젝트의 개발일지가 없어요' : '개발일지가 없어요'}>
        {emptyAction}
      </EmptyState>
    );
  return (
    <>
      {state.stale && <small role="status">최신 정보를 확인하고 있습니다…</small>}
      {state.status === 'error' && state.data && (
        <p className="notice" role="alert">
          Recent Journals could not be refreshed.{' '}
          <Button type="button" onClick={() => void query.load()}>
            Retry
          </Button>
        </p>
      )}
      <div className="journal-list">
        {state.data.items.map((raw) => {
          const journal = presentation(raw);
          return (
            <button
              key={journal.id}
              className="journal-row"
              onClick={() => onOpenJournal(journal.id)}
            >
              <span className="journal-date">{journal.entryDate}</span>
              <span>
                <strong>{journal.title}</strong>
                <small>{journal.project}</small>
              </span>
              <ChevronRight size={15} />
            </button>
          );
        })}
      </div>
    </>
  );
}
