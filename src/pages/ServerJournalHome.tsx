import { WidgetFrame } from '../features/dashboard/WidgetFrame';
import { ApiRecentJournals } from '../features/journal/ApiRecentJournals';
import type { JournalStore } from '../features/journal/apiStore';

export function ServerJournalHome({
  store,
  limit = 3,
  onNavigate,
}: {
  store: JournalStore;
  limit?: number;
  onNavigate: (path: string) => void;
}) {
  return (
    <div className="journal-home-surface">
      <WidgetFrame
        widget={{
          id: 'server-journal-recent',
          type: 'journal',
          title: '최근 개발 일지',
          size: 'medium',
        }}
        editing={false}
        index={1}
        total={2}
        dragging={false}
        onDrag={() => {}}
        onDrop={() => {}}
        onMove={() => {}}
        onEdit={() => {}}
        onRemove={() => {}}
      >
        <ApiRecentJournals
          store={store}
          limit={limit}
          onOpenJournal={(id) => onNavigate(`/journals/${id}`)}
        />
      </WidgetFrame>
    </div>
  );
}
