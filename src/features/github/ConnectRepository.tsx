import { useState } from 'react';
import { useQuery } from '../../shared/http/query';
import { Button, Modal } from '../../shared/ui/controls';
import type { GitHubStore } from './store';
import { Feedback } from './Feedback';
import { errorText } from './errors';

function Repositories({
  store,
  installation,
  project,
  onConnected,
}: {
  store: GitHubStore;
  installation: number;
  project: string;
  onConnected: () => void;
}) {
  const [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const [intent, setIntent] = useState<{ id: number; key: string }>();
  const query = store.repositories(installation, page),
    state = useQuery(query);
  const connect = async (id: number) => {
    const request = intent?.id === id ? intent : { id, key: crypto.randomUUID() };
    setIntent(request);
    setBusy(true);
    setNotice('');
    try {
      await store.connect(project, installation, id, request.key);
      onConnected();
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <Feedback store={store} query={query} state={state} />
      {state.status === 'ready' &&
        state.data?.items.map((r) => (
          <div className="github-row" key={r.id}>
            <div>
              <strong>{r.fullName}</strong>
              <small>{r.privateRepository ? '비공개 저장소' : '공개 저장소'}</small>
            </div>
            <Button disabled={busy || !r.issuesEnabled} onClick={() => void connect(r.id)}>
              {r.issuesEnabled ? '연결' : 'Issues 비활성'}
            </Button>
          </div>
        ))}
      {state.status === 'ready' && !state.data?.items.length && (
        <p>접근 가능한 저장소가 없습니다. App의 선택 저장소와 조직 승인 여부를 확인하세요.</p>
      )}
      <div className="github-actions">
        <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
          이전 저장소
        </Button>
        <Button disabled={!state.data?.nextPage} onClick={() => setPage(state.data!.nextPage!)}>
          다음 저장소
        </Button>
      </div>
      {notice && <p role="alert">{notice}</p>}
    </div>
  );
}
export function ConnectRepository({
  store,
  project,
  onClose,
}: {
  store: GitHubStore;
  project: string;
  onClose: () => void;
}) {
  const [page, setPage] = useState(1),
    [installation, setInstallation] = useState<number>();
  const query = store.installations(page),
    state = useQuery(query);
  return (
    <Modal title="GitHub 저장소 연결" onClose={onClose} wide>
      <p>
        설치된 App에서 현재 접근 가능한 저장소를 선택하세요. 계정 연결과 App 설치는 별도 단계입니다.
      </p>
      <Feedback store={store} query={query} state={state} />
      {state.status === 'ready' &&
        state.data?.items.map((i) => (
          <div className="github-row" key={i.id}>
            <span>
              {i.accountLogin} · {i.accountType}
            </span>
            <Button
              disabled={i.suspended || !i.issuesReadable}
              onClick={() => setInstallation(i.id)}
            >
              {i.suspended ? '설치 중지됨' : !i.issuesReadable ? 'Issues 권한 필요' : '저장소 선택'}
            </Button>
          </div>
        ))}
      {state.status === 'ready' && !state.data?.items.length && (
        <p>
          설치가 없습니다. GitHub 연동 설정에서 App을 설치하거나 조직 승인·선택 저장소를 확인하세요.
        </p>
      )}
      <div className="github-actions">
        <Button
          disabled={page === 1}
          onClick={() => {
            setInstallation(undefined);
            setPage(page - 1);
          }}
        >
          이전 설치
        </Button>
        <Button
          disabled={!state.data?.nextPage}
          onClick={() => {
            setInstallation(undefined);
            setPage(state.data!.nextPage!);
          }}
        >
          다음 설치
        </Button>
      </div>
      {installation && (
        <Repositories
          key={installation}
          store={store}
          installation={installation}
          project={project}
          onConnected={onClose}
        />
      )}
    </Modal>
  );
}
