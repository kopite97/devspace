import { JournalViewer } from '../features/journal/JournalViewer';
import { JournalDocumentList } from '../features/journal/JournalDocumentList';
import type { JournalDocuments } from '../features/journal/documentCollection';
export function ServerJournalViewerPage({
  id,
  store,
  onBack,
  onDocument,
}: {
  id: string;
  store: JournalDocuments;
  onBack: () => void;
  onDocument: (id: string, editing?: boolean) => void;
}) {
  return (
    <>
      <JournalViewer
        id={id}
        store={store}
        onBack={onBack}
        renderDocuments={() => (
          <JournalDocumentList
            id={id}
            store={store}
            onOpen={onDocument}
            onCreated={(id) => onDocument(id, true)}
          />
        )}
      />
    </>
  );
}
