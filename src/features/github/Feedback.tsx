import { useEffect, useMemo, useState } from 'react';
import type { Query, QueryState } from '../../shared/http/query';
import { Button } from '../../shared/ui/controls';
import { errorText, retryAt } from './errors';
import type { GitHubStore } from './store';
import type { ManagedQuery } from '../../shared/http/queryManager';

export function Feedback<T>({
  state,
  query,
  store,
}: {
  state: QueryState<T>;
  query: Query<T>;
  store?: GitHubStore;
}) {
  const at = useMemo(() => retryAt(state.error), [state.error]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!at || now >= at) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(1000, at - now));
    return () => clearTimeout(timer);
  }, [at, now]);
  return (
    <>
      {['idle', 'loading'].includes(state.status) && (
        <p role="status">GitHub 정보를 확인하고 있습니다…</p>
      )}
      {state.status === 'error' && (
        <div role="alert" className="notice">
          <p>{errorText(state.error)}</p>
          {at && now < at && <p>{Math.ceil((at - now) / 1000)}초 후 다시 시도할 수 있습니다.</p>}
          <Button
            disabled={!!at && now < at}
            onClick={() => (store ? store.retryQuery(query as ManagedQuery<T>) : void query.load())}
          >
            다시 확인
          </Button>
        </div>
      )}
    </>
  );
}
