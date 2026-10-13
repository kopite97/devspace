import { JournalViewer } from '../features/journal/JournalViewer';
import { JournalDocumentList } from '../features/journal/JournalDocumentList';
import { CreateDocumentButton } from '../features/journal/CreateDocumentButton';
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
    <JournalViewer
      id={id}
      store={store}
      onBack={onBack}
      renderAction={(options) => (
        <CreateDocumentButton
          key={id}
          journalId={id}
          store={store}
          onCreated={(documentId) => onDocument(documentId, true)}
          {...options}
        />
      )}
      renderDocuments={(options) => (
        <JournalDocumentList id={id} store={store} onOpen={onDocument} {...options} />
      )}
    />
  );
}
