import { useState } from 'react';
import { Button } from '../../shared/ui/controls';
import { useQuery } from '../../shared/http/query';
import { object, string } from '../../shared/http/validation';
import { githubUrl } from './model';
import { GitHubStore, githubBase } from './store';
import { errorText } from './errors';
import { Feedback } from './Feedback';
import './styles.css';

const states = {
  not_configured: '서버 설정 필요',
  disconnected: '연결되지 않음',
  connected: '연결됨',
  reauthorization_required: '재인증 필요',
};
const results: Record<string, string> = {
  connected: 'GitHub 동의를 마쳤습니다. 현재 계정 상태를 확인해 주세요.',
  denied: 'GitHub 연결을 취소했습니다.',
  account_conflict: '다른 GitHub 계정과 충돌했습니다. 기존 연결을 먼저 정리해 주세요.',
  failed: '연결하지 못했습니다. 현재 서비스 세션에서 다시 시작해 주세요.',
};
export function AccountConnection({
  store,
  result,
  onProjects,
}: {
  store: GitHubStore;
  result?: string | null;
  onProjects: () => void;
}) {
  const query = store.account(),
    state = useQuery(query);
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const run = async (disconnect = false) => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      if (disconnect) {
        await store.mutation(githubBase + '/account', 'DELETE', undefined, () => undefined, 204);
        store.protect();
        store.refresh();
        store.onChanged();
      } else {
        const response = await store.mutation(
          githubBase + '/authorization-requests',
          'POST',
          undefined,
          (v) => ({ authorizationUrl: string(object(v).authorizationUrl) }),
          201,
        );
        const target = githubUrl(response.authorizationUrl);
        if (!target || new URL(target).pathname !== '/login/oauth/authorize')
          throw new Error('안전한 GitHub 동의 주소를 확인하지 못했습니다.');
        window.location.assign(target);
      }
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const account = state.status === 'ready' ? state.data : undefined;
  return (
    <section className="github-workspace" aria-label="GitHub 계정 설정">
      <header className="panel-heading">
        <div>
          <h2>GitHub 연동</h2>
          <p>계정을 연결한 뒤 프로젝트에서 저장소를 선택하세요.</p>
        </div>
        <Button onClick={() => query.invalidate(true)}>새로고침</Button>
      </header>
      {result && (
        <p role="status">
          {results[result] ?? '연결 결과를 확인할 수 없습니다. 현재 계정 상태를 확인하세요.'}
        </p>
      )}
      <Feedback store={store} query={query} state={state} />
      {account && (
        <div className="github-panel">
          <span className="github-badge">{states[account.status]}</span>
          {account.login && <h3>@{account.login}</h3>}
          <p>
            서비스 로그인과 GitHub 계정 연결은 별개입니다. 계정당 GitHub 계정 하나를 연결합니다.
          </p>
          <div className="github-actions">
            <Button
              variant="primary"
              disabled={busy || account.status === 'not_configured'}
              onClick={() => void run()}
            >
              {account.status === 'connected' ? 'GitHub 다시 인증' : 'GitHub 계정 연결'}
            </Button>
            {githubUrl(account.installationUrl) && (
              <a
                href={githubUrl(account.installationUrl)}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub App 설치·저장소 권한 관리 ↗
              </a>
            )}
            <Button onClick={onProjects}>프로젝트에서 저장소 연결</Button>
          </div>
          <p>
            동의 주소는 10분 동안 한 번만 유효합니다. 만료되거나 callback에서 오류가 표시되면 이
            화면에서 다시 연결하세요.
          </p>
          {account.status !== 'disconnected' && account.status !== 'not_configured' && (
            <details>
              <summary>계정 해제·교체</summary>
              <p>
                모든 프로젝트의 저장소 연결을 정리한 뒤 기존 계정을 해제하고 새 계정으로 동의하세요.
                GitHub App 제거와는 별개입니다.
              </p>
              <Button
                variant="danger"
                disabled={busy}
                onClick={() => {
                  if (window.confirm('프로젝트 저장소 연결을 정리한 뒤 GitHub 계정을 해제할까요?'))
                    void run(true);
                }}
              >
                GitHub 계정 해제
              </Button>
            </details>
          )}
        </div>
      )}
      {notice && (
        <p role="alert" className="notice">
          {notice}
        </p>
      )}
    </section>
  );
}
