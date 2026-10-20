import { useEffect, useSyncExternalStore } from 'react';
import { CancelledError } from './client';

type QueryObserver = { invalidate: () => void };
const observers = new WeakMap<AbortSignal, QueryObserver>();
export const queryObserver = (signal?: AbortSignal) => (signal ? observers.get(signal) : undefined);

export type QueryState<T> = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: T;
  error?: unknown;
  stale: boolean;
};
export type QueryFetcher<T> = (signal: AbortSignal) => Promise<T>;
export type QueryLoadOptions = {
  force?: boolean;
  reason?: 'initial' | 'expired' | 'forced' | 'page';
};
export class Query<T> {
  private state: QueryState<T> = { status: 'idle', stale: true };
  private listeners = new Set<() => void>();
  private controller?: AbortController;
  private sequence = 0;
  private work?: Promise<void>;
  constructor(protected readonly fetcher: QueryFetcher<T>) {}
  getSnapshot = () => this.state;
  get observed() {
    return this.listeners.size > 0;
  }
  protected addListener(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size && this.work) this.onUnobserved();
    };
  }
  protected onUnobserved() {
    this.invalidate();
  }
  subscribe = (listener: () => void) => {
    return this.addListener(listener);
  };
  private publish(state: QueryState<T>) {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
  invalidate(clear = false) {
    this.sequence++;
    this.controller?.abort();
    this.work = undefined;
    this.publish({ status: 'idle', data: clear ? undefined : this.state.data, stale: true });
  }
  cancel() {
    this.sequence++;
    this.controller?.abort();
    this.work = undefined;
  }
  /** Retire in-flight work and protected snapshots without scheduling an automatic reload. */
  clearData(error: unknown = new Error('접근 상태를 다시 확인해 주세요.')) {
    this.cancel();
    this.publish({ status: 'error', error, stale: true });
  }
  seed(data: T) {
    this.publish({ status: 'idle', data, stale: true });
  }
  load(fetcher?: QueryFetcher<T>, _options?: QueryLoadOptions): Promise<void> {
    if (this.work) return this.work;
    const source = fetcher ?? this.fetcher;
    const sequence = ++this.sequence;
    const controller = new AbortController();
    observers.set(controller.signal, this);
    this.controller = controller;
    this.publish({ ...this.state, status: 'loading', error: undefined });
    const work = Promise.resolve()
      .then(() => source(controller.signal))
      .then((data) => {
        if (sequence === this.sequence && !controller.signal.aborted) {
          if (this.work === work) this.work = undefined;
          this.publish({ status: 'ready', data, stale: false });
        }
      })
      .catch((error: unknown) => {
        if (
          sequence === this.sequence &&
          !controller.signal.aborted &&
          !(error instanceof CancelledError)
        ) {
          if (this.work === work) this.work = undefined;
          this.publish({ ...this.state, status: 'error', error, stale: true });
        }
      })
      .finally(() => {
        if (this.work === work) this.work = undefined;
      });
    this.work = work;
    return work;
  }
}
export function useQuery<T>(query: Query<T>) {
  const state = useSyncExternalStore(query.subscribe, query.getSnapshot);
  useEffect(() => {
    if (state.status === 'idle') void query.load();
  }, [query, state.status]);
  return state;
}
