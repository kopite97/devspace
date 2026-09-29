import { Query, type QueryFetcher, type QueryLoadOptions } from './query';

export type QueryPolicy = {
  freshForMs: number;
  gcAfterMs: number;
  revalidateOnFocus?: boolean;
};

export type ManagedQueryDefinition<T> = {
  key: string;
  contract: string;
  policy: QueryPolicy;
  fetcher: QueryFetcher<T>;
  onRefresh?: (reason: 'expired' | 'forced' | 'initial') => void;
  onEvict?: () => void;
};

const now = () => Date.now();

export class ManagedQuery<T> extends Query<T> {
  private lastSuccessAt?: number;
  private lastUsedAt = now();
  private consumers = 0;
  private forceNextLoad = false;
  private evicted = false;

  get isEvicted() {
    return this.evicted;
  }

  constructor(
    private readonly manager: QueryManager,
    private readonly definition: ManagedQueryDefinition<T>,
  ) {
    super(definition.fetcher);
  }

  get lastUsed() {
    return this.lastUsedAt;
  }

  get consumerCount() {
    return this.consumers;
  }

  get contract() {
    return this.definition.contract;
  }

  get gcAfterMs() {
    return this.definition.policy.gcAfterMs;
  }

  get isFresh() {
    const state = this.getSnapshot();
    return (
      state.status === 'ready' &&
      !state.stale &&
      this.lastSuccessAt !== undefined &&
      now() - this.lastSuccessAt < this.definition.policy.freshForMs
    );
  }

  protected onUnobserved() {
    this.forceNextLoad = true;
    super.invalidate();
  }

  subscribe = (listener: () => void) => {
    const unsubscribe = this.addListener(listener);
    this.consumers++;
    this.lastUsedAt = now();
    if (this.consumers === 1 && !this.isFresh && this.getSnapshot().status !== 'loading') {
      queueMicrotask(() => {
        if (this.consumers && this.getSnapshot().status !== 'loading')
          void this.load(undefined, {
            force: true,
            reason: this.getSnapshot().data === undefined ? 'initial' : 'expired',
          });
      });
    }
    return () => {
      unsubscribe();
      this.consumers = Math.max(0, this.consumers - 1);
      this.lastUsedAt = now();
      this.manager.scheduleSweep();
    };
  };

  load(fetcher?: QueryFetcher<T>, options: QueryLoadOptions = {}): Promise<void> {
    this.evicted = false;
    this.lastUsedAt = now();
    const forced = options.force === true || this.forceNextLoad;
    if (!forced && this.isFresh) return Promise.resolve();
    const reason =
      options.reason ?? (this.getSnapshot().data === undefined ? 'initial' : 'expired');
    if (reason !== 'page') this.definition.onRefresh?.(reason);
    const wrapped: QueryFetcher<T> = async (signal) => {
      const data = await (fetcher ?? this.definition.fetcher)(signal);
      if (options.reason !== 'page') this.lastSuccessAt = now();
      this.forceNextLoad = false;
      this.lastUsedAt = now();
      this.manager.scheduleSweep();
      return data;
    };
    return super.load(wrapped, options);
  }

  invalidate = (clear = false) => {
    this.evicted = false;
    this.lastUsedAt = now();
    this.forceNextLoad = true;
    this.definition.onRefresh?.('forced');
    super.invalidate(clear);
  };

  seed = (data: T) => {
    this.evicted = false;
    this.lastUsedAt = now();
    this.lastSuccessAt = undefined;
    this.forceNextLoad = true;
    super.seed(data);
  };

  evict() {
    if (this.evicted || this.consumerCount || this.getSnapshot().status === 'loading') return false;
    this.evicted = true;
    this.lastSuccessAt = undefined;
    this.forceNextLoad = true;
    super.invalidate(true);
    this.definition.onEvict?.();
    return true;
  }

  revalidateOnFocus() {
    if (!this.consumerCount || !this.definition.policy.revalidateOnFocus || this.isFresh) return;
    void this.load(undefined, { force: true, reason: 'expired' });
  }

  dispose() {
    super.cancel();
    this.consumers = 0;
  }
}

export class QueryManager {
  private readonly entries = new Map<string, ManagedQuery<unknown>>();
  private sweepTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;

  get<T>(definition: ManagedQueryDefinition<T>): ManagedQuery<T> {
    if (this.disposed) throw new Error('Query manager is disposed.');
    const existing = this.entries.get(definition.key);
    if (existing) {
      if (existing.contract !== definition.contract)
        throw new Error(`Conflicting query definition: ${definition.key}`);
      return existing as ManagedQuery<T>;
    }
    const query = new ManagedQuery(this, definition);
    this.entries.set(definition.key, query as ManagedQuery<unknown>);
    return query;
  }

  revalidate() {
    for (const query of this.entries.values()) query.revalidateOnFocus();
  }

  sweep(at = now()) {
    for (const query of this.entries.values()) {
      if (!query.consumerCount && at - query.lastUsed >= query.gcAfterMs) query.evict();
    }
    this.scheduleSweep();
  }

  scheduleSweep() {
    if (this.disposed || this.sweepTimer) return;
    let delay: number | undefined;
    const at = now();
    for (const query of this.entries.values()) {
      if (query.consumerCount || query.isEvicted) continue;
      const remaining = Math.max(0, query.gcAfterMs - (at - query.lastUsed));
      delay = delay === undefined ? remaining : Math.min(delay, remaining);
    }
    if (delay === undefined) return;
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = undefined;
      this.sweep();
    }, delay);
    const unref = (this.sweepTimer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref;
    unref?.call(this.sweepTimer);
  }

  dispose() {
    this.disposed = true;
    if (this.sweepTimer) clearTimeout(this.sweepTimer);
    this.sweepTimer = undefined;
    for (const query of this.entries.values()) query.dispose();
    this.entries.clear();
  }
}
