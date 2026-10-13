import { useId, useRef, useState } from 'react';
import { Button, Field, Modal } from '../../shared/ui/controls';
import { CategoryFilterControl } from '../projects/CategoryFilterControl';
import type { CategoryFilter, CategoryOption } from '../projects/categoryFilter';
import type { JournalProjectOption, JournalSort } from './apiModel';

export type JournalSearchValues = {
  category: CategoryFilter;
  query: string;
  projectId: string;
  from: string;
  to: string;
  sort: JournalSort;
};

export function JournalSearchDialog({
  values,
  categories,
  projects,
  onApply,
  onClose,
}: {
  values: JournalSearchValues;
  categories: readonly CategoryOption[];
  projects: readonly JournalProjectOption[];
  onApply: (values: JournalSearchValues) => boolean;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(() => ({ ...values }));
  const isComposing = useRef(false);
  const rangeErrorId = useId();
  const validRange = !draft.from || !draft.to || draft.from <= draft.to;

  return (
    <Modal title="검색 및 정렬" onClose={onClose}>
      <form
        className="journal-search-form"
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            (isComposing.current ||
              event.nativeEvent.isComposing ||
              event.nativeEvent.keyCode === 229)
          )
            event.preventDefault();
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (!validRange || isComposing.current) return;
          const unchanged = (Object.keys(values) as (keyof JournalSearchValues)[]).every(
            (key) => draft[key] === values[key],
          );
          if (unchanged || onApply(draft)) onClose();
        }}
      >
        <div className="journal-search-fields">
          <div className="journal-search-query">
            <Field label="검색어">
              <input
                aria-label="현재 화면 검색"
                placeholder="일지 검색"
                value={draft.query}
                onChange={(event) => setDraft({ ...draft, query: event.target.value })}
                onCompositionStart={() => {
                  isComposing.current = true;
                }}
                onCompositionEnd={() => {
                  isComposing.current = false;
                }}
              />
            </Field>
          </div>
          <CategoryFilterControl
            value={draft.category}
            options={categories}
            onChange={(category) => setDraft({ ...draft, category })}
          />
          <Field label="일지 프로젝트 필터">
            <select
              value={draft.projectId}
              onChange={(event) => setDraft({ ...draft, projectId: event.target.value })}
            >
              <option value="">전체 프로젝트</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                  {project.archived ? ' (보관)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="시작일">
            <input
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={draft.from}
              aria-invalid={!validRange || undefined}
              aria-describedby={!validRange ? rangeErrorId : undefined}
              onChange={(event) => setDraft({ ...draft, from: event.target.value })}
            />
          </Field>
          <Field label="종료일">
            <input
              type="date"
              min="0001-01-01"
              max="9999-12-31"
              value={draft.to}
              aria-invalid={!validRange || undefined}
              aria-describedby={!validRange ? rangeErrorId : undefined}
              onChange={(event) => setDraft({ ...draft, to: event.target.value })}
            />
          </Field>
          <Field label="일지 정렬">
            <select
              value={draft.sort}
              onChange={(event) => setDraft({ ...draft, sort: event.target.value as JournalSort })}
            >
              <option value="newest">최신순</option>
              <option value="oldest">과거순</option>
            </select>
          </Field>
        </div>
        {!validRange && (
          <p id={rangeErrorId} role="alert">
            종료일은 시작일 이후로 선택해 주세요.
          </p>
        )}
        <div className="modal-actions">
          <Button
            type="button"
            onClick={() =>
              setDraft({
                category: 'all',
                query: '',
                projectId: '',
                from: '',
                to: '',
                sort: 'newest',
              })
            }
          >
            초기화
          </Button>
          <Button type="button" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={!validRange}>
            적용
          </Button>
        </div>
      </form>
    </Modal>
  );
}
