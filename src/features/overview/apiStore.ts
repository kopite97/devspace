import type { PrivateTransport } from '../../shared/http/transport';
import { Query } from '../../shared/http/query';
import { parseOverview, type Overview, type OverviewFilter } from './apiModel';
export class OverviewStore {
  private queries = new Map<string, Query<Overview>>();
  onPartial = () => {};
  constructor(private transport: PrivateTransport) {
    transport.lifecycle.signal.addEventListener('abort', () => this.dispose(), { once: true });
  }
  query(filter: OverviewFilter) {
    const key = JSON.stringify([filter.category, filter.projectId ?? null]);
    let query = this.queries.get(key);
    if (!query) {
      const params = new URLSearchParams({ category: filter.category });
      if (filter.projectId) params.set('projectId', filter.projectId);
      query = new Query<Overview>(async (signal) => {
        const result = await this.transport.request('/api/v2/overview?' + params, {
          signal,
          generation: this.transport.generation,
          expectedStatus: 200,
          parse: (value) => parseOverview(value, filter),
        });
        if (!signal.aborted && result.externalDataUnavailable) this.onPartial();
        return result;
      });
      this.queries.set(key, query);
    }
    return query;
  }
  invalidate(clear = false) {
    for (const query of this.queries.values()) query.invalidate(clear);
  }
  dispose() {
    for (const query of this.queries.values()) query.cancel();
    this.queries.clear();
  }
}
