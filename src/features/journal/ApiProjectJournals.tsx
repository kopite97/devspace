import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../shared/ui/controls';
import { journalDraft, type JournalProjectOption } from './apiModel';
import type { JournalStore } from './apiStore';
import type { JournalMemory } from './draftMemory';
import type { JournalProjectOptions } from './projectOptions';
import { ApiJournalEditor } from './ApiJournalEditor';
import { ApiRecentJournals } from './ApiRecentJournals';

export function ApiProjectJournals({
  store,
  options,
  memory,
  project,
  onOpenJournal,
}: {
  store: JournalStore;
  options: JournalProjectOptions;
  memory: JournalMemory;
  project: JournalProjectOption;
  onOpenJournal: (id: string) => void;
}) {
  const target = 'create:' + project.id;
  const [editing, setEditing] = useState(memory.editor?.target === target);
  const [notice, setNotice] = useState('');
  const create = () => {
    if (project.archived) return;
    memory.editor = { target, draft: { ...journalDraft(), projectId: project.id } };
    setNotice('');
    setEditing(true);
  };
  const action = !project.archived && (
    <Button onClick={create}>
      <Plus size={16} />
      일지 작성
    </Button>
  );
  return (
    <section className="journal-surface content-panel" aria-label="프로젝트 최근 일지">
      <div className="project-section-toolbar">
        <div className="panel-heading">
          <h2 data-section-index="04 / JOURNAL">최근 개발 일지</h2>
          <p>이 프로젝트의 최신 일지 최대 3건입니다.</p>
        </div>
        {action}
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      <ApiRecentJournals
        store={store}
        projectId={project.id}
        limit={3}
        onOpenJournal={onOpenJournal}
      />
      {editing && memory.editor?.target === target && (
        <ApiJournalEditor
          store={store}
          options={options}
          memory={memory}
          lockedProject={project}
          onClose={() => setEditing(false)}
          onSaved={(message) => {
            // JournalStore invalidates the observed recent query on confirmed creation.
            setEditing(false);
            setNotice(message ?? '');
          }}
        />
      )}
    </section>
  );
}
