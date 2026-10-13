import { useEffect, useRef } from 'react';
import {
  readCategoryFilter,
  readProjectFilter,
  type CategoryOption,
} from '../features/projects/categoryFilter';
import type { JournalStore } from '../features/journal/apiStore';
import type { JournalMemory } from '../features/journal/draftMemory';
import type { JournalProjectOptions } from '../features/journal/projectOptions';
import { ApiJournalWorkspace } from '../features/journal/ApiJournalWorkspace';
import type { JournalDocuments } from '../features/journal/documentCollection';

export function ServerJournalsPage({
  store,
  categories,
  options,
  memory,
  url,
  onFilterNavigate,
  documents,
  onOpenJournal,
  onDocumentCreated,
}: {
  store: JournalStore;
  options: JournalProjectOptions;
  memory: JournalMemory;
  categories: readonly CategoryOption[];
  url: URL;
  onFilterNavigate: (path: string) => boolean;
  documents: JournalDocuments;
  onOpenJournal: (id: string) => void;
  onDocumentCreated: (id: string, journalId: string) => void;
}) {
  const category = readCategoryFilter(url.searchParams);
  const query = url.searchParams.get('q') ?? '';
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const searchFocusTarget = useRef<string | undefined>(undefined);
  const locationKey = url.pathname + url.search;
  useEffect(() => {
    const target = searchFocusTarget.current;
    searchFocusTarget.current = undefined;
    if (target === locationKey) searchButtonRef.current?.focus();
  }, [locationKey]);
  return (
    <ApiJournalWorkspace
      key={locationKey}
      searchButtonRef={searchButtonRef}
      store={store}
      documents={documents}
      onOpenJournal={onOpenJournal}
      onDocumentCreated={onDocumentCreated}
      options={options}
      memory={memory}
      category={category}
      categories={categories}
      queryText={query}
      projectId={readProjectFilter(url.searchParams) ?? ''}
      from={url.searchParams.get('from') ?? ''}
      to={url.searchParams.get('to') ?? ''}
      sort={url.searchParams.get('sort') === 'oldest' ? 'oldest' : 'newest'}
      onFilterNavigate={(nextCategory, nextQuery, fields = {}, restoreSearchFocus = false) => {
        const params = new URLSearchParams(url.search);
        params.delete('scope');
        params.set('category', nextCategory);
        if (nextQuery) params.set('q', nextQuery);
        else params.delete('q');
        for (const [key, value] of Object.entries(fields)) {
          if (value) params.set(key, value);
          else params.delete(key);
        }
        const path = '/journals' + (params.size ? '?' + params : '');
        searchFocusTarget.current = restoreSearchFocus ? path : undefined;
        const accepted = onFilterNavigate(path);
        if (!accepted) searchFocusTarget.current = undefined;
        return accepted;
      }}
    />
  );
}
