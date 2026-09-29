import { dashboardHandoff } from './dashboardHandoff';
import { CodeXml } from 'lucide-react';
import { LoginWorkflow } from './LoginWorkflow';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AuthSession } from './session';
import { connectAuthHints } from './crossTab';
import { consumeLoginError, loginUrl } from './routeIntent';
import { PrivateWorkspace } from './PrivateWorkspace';
import { projectHandoff } from './projectHandoff';
import { taskHandoff } from './taskHandoff';
import { journalHandoff } from './journalHandoff';
import { documentHandoff } from './documentHandoff';
import { linkHandoff } from './linkHandoff';
import { milestoneHandoff } from './milestoneHandoff';
import { confirmNavigation } from '../../shared/lib/navigationGuard';
import './auth.css';

const session = new AuthSession();
const getDashboardMemory = dashboardHandoff(session);
const getProjectMemory = projectHandoff(session);
const getTaskMemory = taskHandoff(session);
const getJournalMemory = journalHandoff(session);
const getDocumentMemory = documentHandoff(session);
const getLinkMemory = linkHandoff(session);
const getMilestoneMemory = milestoneHandoff(session);

export function AuthApp() {
  const [url, setUrl] = useState(() => new URL(window.location.href));
  const locationRef = useRef(url);
  const historyIndex = useRef(0);
  const restoringHistory = useRef(false);
  const handleNavigate = (path: string, replace = false) => {
    if (path === window.location.pathname + window.location.search) return true;
    if (
      !confirmNavigation(
        Boolean(
          getProjectMemory().editor ||
          getProjectMemory().category ||
          getTaskMemory().editor ||
          getJournalMemory().editor ||
          getDocumentMemory().draft ||
          getMilestoneMemory().editor ||
          getLinkMemory().editor ||
          getDashboardMemory().editor ||
          Object.values(getDashboardMemory().tasks).some((memory) => memory.editor),
        ),
        'Discard this draft? An unconfirmed creation may already exist. Review Projects before creating again.',
      )
    )
      return false;
    getProjectMemory().editor = undefined;
    getProjectMemory().category = undefined;
    getTaskMemory().editor = undefined;
    getJournalMemory().editor = undefined;
    getDocumentMemory().draft = undefined;
    if (
      /^\/journals\/[0-9a-f-]+$/.test(path) &&
      !/^\/(?:documents|journals)\//.test(locationRef.current.pathname)
    )
      getDocumentMemory().returns[path] = locationRef.current.pathname + locationRef.current.search;
    getMilestoneMemory().editor = undefined;
    getLinkMemory().editor = undefined;
    getDashboardMemory().editor = undefined;
    for (const memory of Object.values(getDashboardMemory().tasks)) memory.editor = undefined;
    if (replace)
      window.history.replaceState({ projectNavigationIndex: historyIndex.current }, '', path);
    else window.history.pushState({ projectNavigationIndex: ++historyIndex.current }, '', path);
    locationRef.current = new URL(window.location.href);
    setUrl(locationRef.current);
    return true;
  };
  const { state, busy, notice, logoutBlocked, sessionCheck } = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
  );
  const [intent] = useState(() => consumeLoginError(new URL(window.location.href)));
  useEffect(() => {
    window.history.replaceState({ ...window.history.state, projectNavigationIndex: 0 }, '');
    if (intent.failed)
      window.history.replaceState(
        window.history.state,
        '',
        intent.url.pathname + intent.url.search + intent.url.hash,
      );
    const disconnect = connectAuthHints(session);
    const release = session.retain();
    const handleFocus = () => {
      if (document.visibilityState === 'visible') session.resume();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) session.resume(true);
    };
    const handlePop = (event: PopStateEvent) => {
      if (restoringHistory.current) {
        restoringHistory.current = false;
        return;
      }
      const next =
        typeof event.state?.projectNavigationIndex === 'number'
          ? event.state.projectNavigationIndex
          : 0;
      if (
        !confirmNavigation(
          Boolean(
            getProjectMemory().editor ||
            getProjectMemory().category ||
            getTaskMemory().editor ||
            getJournalMemory().editor ||
            getDocumentMemory().draft ||
            getMilestoneMemory().editor ||
            getLinkMemory().editor ||
            getDashboardMemory().editor ||
            Object.values(getDashboardMemory().tasks).some((memory) => memory.editor),
          ),
          'Discard this draft? An unconfirmed creation may already exist.',
        )
      ) {
        const delta = historyIndex.current - next;
        if (delta) {
          restoringHistory.current = true;
          window.history.go(delta);
        } else
          window.history.replaceState(
            { projectNavigationIndex: historyIndex.current },
            '',
            locationRef.current.pathname + locationRef.current.search,
          );
        return;
      }
      getProjectMemory().editor = undefined;
      getProjectMemory().category = undefined;
      getTaskMemory().editor = undefined;
      getJournalMemory().editor = undefined;
      getDocumentMemory().draft = undefined;
      getMilestoneMemory().editor = undefined;
      getLinkMemory().editor = undefined;
      getDashboardMemory().editor = undefined;
      for (const memory of Object.values(getDashboardMemory().tasks)) memory.editor = undefined;
      historyIndex.current = next;
      locationRef.current = new URL(window.location.href);
      setUrl(locationRef.current);
      session.resume();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', session.suspend);
    window.addEventListener('popstate', handlePop);
    return () => {
      release();
      disconnect();
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('pagehide', session.suspend);
      window.removeEventListener('popstate', handlePop);
    };
  }, [intent]);
  const handleLogin = () =>
    session.login(() => window.location.assign(loginUrl(intent.url.pathname + intent.url.search)));
  if (state.kind === 'authenticated') {
    const sessionControls = (
      <div className="session-controls">
        {notice && <p role="alert">{notice}</p>}
        <button
          className="button button-secondary"
          type="button"
          disabled={busy || logoutBlocked}
          onClick={() => void session.logout()}
        >
          {busy ? 'Logging out…' : notice ? 'Retry logout' : 'Log out'}
        </button>
      </div>
    );
    return (
      <section
        key={`${state.identity.id}:${state.identity.workspace.id}:${state.generation}`}
        className="authenticated-workspace"
        aria-label={state.identity.displayName + ' · ' + state.identity.workspace.name}
      >
        {busy ? (
          <div className="auth-app">{sessionControls}</div>
        ) : (
          <PrivateWorkspace
            sessionError={notice}
            transport={{
              request: session.request,
              lifecycle: session.lifecycle,
              generation: state.generation,
              recoverSecurity: session.recoverMutationSecurity,
            }}
            url={url}
            onNavigate={handleNavigate}
            memory={getProjectMemory()}
            taskMemory={getTaskMemory()}
            journalMemory={getJournalMemory()}
            documentMemory={getDocumentMemory()}
            milestoneMemory={getMilestoneMemory()}
            linkMemory={getLinkMemory()}
            dashboardMemory={getDashboardMemory()}
            displayName={state.identity.displayName}
            workspaceName={state.identity.workspace.name}
            sessionControls={sessionControls}
            sessionNotice={
              sessionCheck === 'failed' && (
                <div className="session-check-notice" role="alert">
                  <span>
                    세션을 확인하지 못했습니다. 연결을 확인해 주세요. 저장은 확인 후 다시 시도할 수
                    있습니다.
                  </span>
                  <button
                    className="button button-secondary"
                    onClick={() => void session.revalidate()}
                  >
                    세션 다시 확인
                  </button>
                </div>
              )
            }
          />
        )}
      </section>
    );
  }
  return (
    <div className="auth-app auth-login-shell" aria-labelledby="auth-title">
      <LoginWorkflow />
      <div className="auth-login-panel">
        <header className="auth-header">
          <div className="auth-brand">
            <CodeXml className="auth-logo" size={64} strokeWidth={2} aria-hidden="true" />
            <h1 id="auth-title">devspace.</h1>
          </div>
        </header>
        {state.kind === 'checking' && (
          <section className="auth-card">
            <p role="status">로그인 정보를 확인하고 있어요…</p>
          </section>
        )}
        {state.kind === 'unauthenticated' && (
          <section className="auth-card">
            <h2>로그인하여 계속하세요</h2>
            {intent.failed && <p role="alert">Google 로그인에 실패했습니다. 다시 시도해 주세요.</p>}
            <button
              className="auth-google-button"
              type="button"
              disabled={busy}
              onClick={handleLogin}
            >
              <img
                src="https://www.gstatic.com/images/branding/googleg/1x/googleg_standard_color_128dp.png"
                width={24}
                height={24}
                alt=""
              />
              {busy ? 'Google로 이동 중…' : 'Google로 계속하기'}
            </button>
          </section>
        )}
        {state.kind === 'disabled' && (
          <section className="auth-card">
            <h2>이용이 제한된 계정입니다</h2>
            <p role="alert">
              이 계정으로는 devspace.를 이용할 수 없습니다. 관리자에게 문의해 주세요.
            </p>
          </section>
        )}
        {state.kind === 'bootstrap-error' && (
          <section className="auth-card">
            <h2>연결을 확인해 주세요</h2>
            <p role="alert">{state.message}</p>
            {state.requestId && <p>Request ID: {state.requestId}</p>}
          </section>
        )}
      </div>
    </div>
  );
}
