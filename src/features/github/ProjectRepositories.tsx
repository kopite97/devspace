import { useEffect, useState, useSyncExternalStore } from 'react';
import { confirmNavigation } from '../../shared/lib/navigationGuard';
import { useQuery } from '../../shared/http/query';
import { Button } from '../../shared/ui/controls';
import { GitHubStore, repositoryBase } from './store';
import { parseSettings, terminal, type RepositoryLink } from './model';
import { Feedback } from './Feedback';
import { errorText } from './errors';
import { ConnectRepository } from './ConnectRepository';
import { IssueBrowser } from './IssueBrowser';
import { RepositorySettings } from './RepositorySettings';
import { JobProgress } from './JobProgress';
import './styles.css';

function RepositoryWorkspace({
  store,
  link,
  archived,
}: {
  store: GitHubStore;
  link: RepositoryLink;
  archived: boolean;
}) {
  const base = repositoryBase(link.projectId, link.id);
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  const settingsQuery = store.settings(base),
    settings = useQuery(settingsQuery);
  const syncQuery = store.sync(base),
    sync = useQuery(syncQuery);
  const [tab, setTab] = useState<'issues' | 'settings' | 'jobs'>('issues');
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [issueNumber, setIssueNumber] = useState('');
  const access =
    link.accessStatus === 'verified' && !['disconnecting', 'disconnected'].includes(link.status);
  const blocked = !access || archived || settings.status !== 'ready' || !!settings.data?.paused;
  const observed = sync.data;
  const jobId = store.jobs.get(base) ?? observed?.latestJob?.id;
  useEffect(() => {
    if (sync.status !== 'ready' || !observed) return;
    for (const job of [observed.latestCollectionJob, observed.latestTaskJob, observed.latestJob])
      if (job) store.observeJob(base, job);
    const pending = [observed.latestCollectionJob, observed.latestTaskJob, observed.latestJob].some(
      (j) => j && !terminal(j),
    );
    if (!pending && link.status !== 'initializing') return;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void syncQuery.load();
        if (settingsQuery.getSnapshot().status === 'ready') void settingsQuery.load();
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [store, base, sync.status, observed, link.status, syncQuery, settingsQuery]);
  const run = async (action: 'pause' | 'sync' | 'fetch' | 'convert' | 'purge' | 'cleanup') => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      if (action === 'pause') {
        if (!settings.data) throw new Error('최신 설정을 먼저 확인하세요.');
        await store.mutation(
          base + '/sync-settings',
          'PATCH',
          { revision: settings.data.revision, paused: !settings.data.paused },
          parseSettings,
        );
        store.refresh(base);
        store.onChanged();
      } else if (action === 'sync' || action === 'fetch') {
        if ((store.cooldown.get(base) ?? 0) > Date.now())
          throw new Error('수동 수집은 저장소별 60초 간격입니다. 잠시 후 다시 시도하세요.');
        const number = Number(issueNumber);
        if (action === 'fetch' && (!Number.isSafeInteger(number) || number < 1))
          throw new Error('양의 Issue 번호를 입력하세요.');
        await store.submit(
          base,
          action === 'sync' ? 'sync-requests' : 'issue-fetches',
          action === 'fetch' ? { issueNumber: number } : undefined,
        );
        setTab('jobs');
      } else {
        if (
          !window.confirm(
            action === 'purge' || action === 'cleanup'
              ? '이 저장소에 남은 GitHub 보호 Task를 영구 삭제합니다. 복원할 수 없으며 일반 사본은 대상이 아닙니다. 계속할까요?'
              : '접근 가능한 Task의 마지막 정상 내용을 일반 사본으로 보존하고 연결을 해제할까요?',
          )
        )
          return;
        if (action === 'cleanup')
          await store.cleanup(base, settings.data?.revision ?? link.revision);
        else await store.disconnect(base, settings.data?.revision ?? link.revision, action);
        setTab('jobs');
      }
    } catch (e) {
      setNotice(
        ['convert', 'purge', 'cleanup'].includes(action)
          ? '응답을 확인하지 못했더라도 해제가 진행 중일 수 있습니다. 연결·작업 상태를 확인한 뒤 재개하세요. ' +
              errorText(e)
          : errorText(e),
      );
      store.refresh(base);
      store.links(link.projectId).invalidate();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="github-panel">
      <h3>{access ? link.fullName : '접근 확인이 필요한 저장소'}</h3>
      <p>
        {link.status} · {link.accessStatus}
        {archived ? ' · 프로젝트 보관됨' : ''}
        {settings.data?.paused ? ' · 사용자 중지' : ''}
      </p>
      <Feedback store={store} query={syncQuery} state={sync} />
      {observed && (
        <p>
          원문 수집: {observed.coverage.lastSuccessfulSyncAt ?? '아직 없음'}
          <br />
          Task 반영: {observed.lastTaskAppliedAt ?? '아직 없음'}
          <br />
          {settings.data?.enabled && !settings.data.paused && !observed.baselineReady
            ? '자동 가져오기 기준 상태 준비 중'
            : '수집과 Task 반영은 별도 단계입니다.'}
        </p>
      )}
      <div className="github-actions">
        <Button
          onClick={() => {
            store.refresh(base);
            store.onChanged();
          }}
        >
          상태 새로고침
        </Button>
        <Button disabled={busy || !access} onClick={() => void run('sync')}>
          수동 재동기화
        </Button>
        <Button
          disabled={busy || !access || !settings.data || archived}
          onClick={() => void run('pause')}
        >
          {settings.data?.paused ? 'Task 동기화 재개' : 'Task 동기화 중지'}
        </Button>
      </div>
      {access && (
        <label>
          오래된 Issue 번호
          <input
            inputMode="numeric"
            value={issueNumber}
            onChange={(e) => setIssueNumber(e.target.value)}
          />
          <Button disabled={busy || !issueNumber} onClick={() => void run('fetch')}>
            번호로 원문 수집
          </Button>
        </label>
      )}
      <div className="github-tabs" aria-label="저장소 관리">
        {(['issues', 'settings', 'jobs'] as const).map((t, i) => (
          <Button
            key={t}
            aria-pressed={tab === t}
            onClick={() => {
              if (t === tab || confirmNavigation()) setTab(t);
            }}
          >
            {['Issue', '동기화·설정', '작업 결과'][i]}
          </Button>
        ))}
      </div>
      {!access && (
        <p role="alert">
          원문 접근을 확인할 수 없습니다. 계정 재인증 또는 설치 권한을 확인하세요. 보호 데이터
          정리는 아래에서 가능합니다.
        </p>
      )}
      {tab === 'issues' && access && <IssueBrowser store={store} base={base} blocked={blocked} />}
      {tab === 'settings' && access && (
        <>
          <Feedback store={store} query={settingsQuery} state={settings} />
          {settings.data && (
            <RepositorySettings
              store={store}
              base={base}
              settings={settings.data}
              blocked={archived}
            />
          )}
        </>
      )}
      {tab === 'jobs' &&
        (jobId ? (
          <JobProgress store={store} base={base} id={jobId} />
        ) : (
          <p>현재 관측된 작업이 없습니다. 전체 작업 이력은 제공하지 않습니다.</p>
        ))}
      {tab !== 'issues' && store.intents.has(base) && (
        <div className="notice">
          <p>응답이 불확실한 요청이 있습니다. 화면을 닫아도 서버에서 실행됐을 수 있습니다.</p>
          <Button
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void store
                .submit(base, 'sync-requests', undefined, true)
                .then(() => setTab('jobs'))
                .catch((e) => setNotice(errorText(e)))
                .finally(() => setBusy(false));
            }}
          >
            동일 요청으로 결과 확인
          </Button>
        </div>
      )}
      {notice && (
        <p role="alert" className="notice">
          {notice}
        </p>
      )}
      <details>
        <summary>저장소 연결 해제·정리</summary>
        <p>
          50개 단위로 처리하며 창을 닫아도 작업이 계속됩니다. 부분 완료 시 최신 상태를 확인한 뒤
          남은 처리를 재개하세요.
        </p>
        <Button
          disabled={busy || link.accessStatus !== 'verified'}
          onClick={() => void run('convert')}
        >
          일반 Task로 보존 후 해제
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void run('purge')}>
          남은 보호 Task 영구 삭제·해제
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => void run('cleanup')}>
          접근 불가·부분 해제의 남은 Task 정리
        </Button>
      </details>
    </div>
  );
}
export function ProjectRepositories({
  store,
  project,
  archived,
  onAccount,
}: {
  store: GitHubStore;
  project: string;
  archived: boolean;
  onAccount: () => void;
}) {
  const query = store.links(project),
    state = useQuery(query);
  useSyncExternalStore(store.subscribe, store.protectionSnapshot);
  useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [connecting, setConnecting] = useState(false),
    [selected, setSelected] = useState<string>();
  const link = state.data?.find((l) => l.id === selected);
  return (
    <section className="content-panel github-workspace" aria-label="프로젝트 GitHub 저장소">
      <header className="panel-heading">
        <div>
          <h2>GitHub 저장소</h2>
          <p>Issue를 프로젝트 Task로 가져오세요.</p>
        </div>
        <div className="github-actions">
          <Button onClick={onAccount}>계정 설정</Button>
          <Button
            disabled={archived || (state.data?.length ?? 0) >= 100}
            onClick={() => setConnecting(true)}
          >
            저장소 연결
          </Button>
          <Button onClick={() => query.invalidate()}>연결 새로고침</Button>
        </div>
      </header>
      <Feedback store={store} query={query} state={state} />
      {state.status === 'ready' && !state.data?.length && (
        <p>연결된 저장소가 없습니다. 계정을 연결하고 저장소를 선택하세요.</p>
      )}
      {state.data?.map((l) => (
        <div className="github-row" key={l.id}>
          <div>
            <strong>{l.accessStatus === 'verified' ? l.fullName : '접근 확인 필요'}</strong>
            <small>
              {l.status} · {l.accessStatus} {l.paused ? '· 중지' : ''}
            </small>
          </div>
          <Button
            onClick={() => {
              if (confirmNavigation()) setSelected(selected === l.id ? undefined : l.id);
            }}
          >
            {selected === l.id ? '접기' : '저장소 관리'}
          </Button>
        </div>
      ))}
      {link && (
        <RepositoryWorkspace
          key={link.id + ':' + store.connectionVersion(link.id)}
          store={store}
          link={link}
          archived={archived}
        />
      )}
      {[...store.jobs]
        .filter(
          ([base]) =>
            base.startsWith(repositoryBase(project) + '/') &&
            !state.data?.some((l) => base.endsWith('/' + l.id)),
        )
        .map(([base, id]) => (
          <JobProgress key={id} store={store} base={base} id={id} />
        ))}
      {connecting && (
        <ConnectRepository store={store} project={project} onClose={() => setConnecting(false)} />
      )}
    </section>
  );
}
