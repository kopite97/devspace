import { CancelledError, HttpError } from '../../shared/http/client';
import type { PrivateTransport } from '../../shared/http/transport';
import { QueryManager, type ManagedQuery } from '../../shared/http/queryManager';
import { object, uuid } from '../../shared/http/validation';
import {
  array,
  cursorPage,
  page,
  parseAccount,
  parseInstallation,
  parseRepository,
  parseLink,
  parseIssues,
  parseLabel,
  parseSettings,
  parseSync,
  parseJob,
  parsePreview,
  terminal,
  type RepositoryLink,
} from './model';
import { retryAt } from './errors';

export const githubBase = '/api/v2/integrations/github';
export const repositoryBase = (project: string, link?: string) =>
  `/api/v2/projects/${uuid(project)}/github/repositories${link ? '/' + uuid(link) : ''}`;
export type RequestIntent = { path: string; body?: unknown; key: string; createdAt: number };
export class GitHubStore {
  private reads = new Map<
    string,
    { invalidate: (clear?: boolean) => void; cancel: () => void; clearData: () => void }
  >();
  private access = new Map<string, string>();
  private linkLists = new Map<string, Set<string>>();
  private epoch = 0;
  private linkEpochs = new Map<string, number>();
  private jobLinks = new Map<string, string>();
  private stopped = false;
  private listeners = new Set<() => void>();
  private version = 0;
  private protectionVersion = 0;
  private completed = new Set<string>();
  private watchers = new Map<string, { consumers: number; stop: () => void }>();
  private accountState?: string;
  readonly jobs = new Map<string, string>();
  readonly intents = new Map<string, RequestIntent>();
  readonly cooldown = new Map<string, number>();
  private pauses = new Map<string, { until: number; error: HttpError }>();
  onChanged = () => {};
  onProtected = (_linkId?: string) => {};
  constructor(
    readonly transport: PrivateTransport,
    private manager: QueryManager,
  ) {
    transport.lifecycle.signal.addEventListener('abort', () => this.dispose(), { once: true });
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.version;
  protectionSnapshot = () => this.protectionVersion;
  connectionVersion = (linkId: string) => `${this.epoch}:${this.linkEpochs.get(linkId) ?? 0}`;
  private publish() {
    this.version++;
    for (const listener of this.listeners) listener();
  }
  private stamp(path: string) {
    const jobId = path.match(/\/jobs\/([^/?]+)/)?.[1];
    const linkId =
      path.match(/\/github\/repositories\/([^/?]+)/)?.[1] ??
      (jobId ? this.jobLinks.get(jobId) : undefined);
    return `${this.epoch}:${linkId ? (this.linkEpochs.get(linkId) ?? 0) : 0}`;
  }
  private assert(stamp: string, path: string) {
    this.transport.lifecycle.assert(this.transport.generation);
    if (this.stopped || stamp !== this.stamp(path)) throw new CancelledError();
  }
  protect(linkId?: string, exceptPath?: string, preserveJobs = false) {
    this.protectionVersion++;
    if (linkId) this.linkEpochs.set(linkId, (this.linkEpochs.get(linkId) ?? 0) + 1);
    else this.epoch++;
    for (const base of this.intents.keys())
      if (!linkId || base.endsWith('/' + linkId)) this.intents.delete(base);
    for (const base of this.cooldown.keys())
      if (!linkId || base.endsWith('/' + linkId)) this.cooldown.delete(base);
    for (const path of this.pauses.keys())
      if (!linkId || path.includes(linkId)) this.pauses.delete(path);
    for (const [base, id] of this.jobs)
      if (!preserveJobs && (!linkId || base.endsWith('/' + linkId))) {
        this.jobs.delete(base);
        this.watchers.get(id)?.stop();
        this.watchers.delete(id);
      }
    for (const [path, read] of this.reads)
      if (
        path !== exceptPath &&
        (!linkId ||
          path.includes(linkId) ||
          this.jobLinks.get(path.split('/').at(-1) ?? '') === linkId)
      ) {
        // Owner-visible link metadata must remain recoverable for cleanup even
        // when source access expires during a background job read.
        if (/\/github\/repositories$/.test(path)) read.invalidate(true);
        else read.clearData();
      }
    this.onProtected(linkId);
    this.publish();
  }
  private inspectLinks(path: string, links: RepositoryLink[]) {
    const ids = new Set(links.map((link) => link.id));
    for (const id of this.linkLists.get(path) ?? [])
      if (!ids.has(id)) this.protect(id, undefined, true);
    this.linkLists.set(path, ids);
    for (const link of links) {
      const state = `${link.accessStatus}:${link.status}:${link.paused}`;
      const previous = this.access.get(link.id);
      if (previous !== state) {
        this.access.set(link.id, state);
        if (
          link.accessStatus !== 'verified' ||
          ['disconnecting', 'disconnected'].includes(link.status)
        )
          this.protect(
            link.id,
            undefined,
            link.status === 'disconnecting' || link.status === 'disconnected',
          );
        else if (previous) this.onChanged();
      }
    }
    return links;
  }
  read<T>(path: string, parse: (value: unknown) => T): ManagedQuery<T> {
    const query = this.manager.get({
      key: 'github:' + path,
      contract: 'github-v2:' + path,
      policy: { freshForMs: 0, gcAfterMs: 60000, revalidateOnFocus: true },
      fetcher: async (signal) => {
        const pausedUntil = this.pauses.get(path);
        if (pausedUntil && Date.now() < pausedUntil.until) throw pausedUntil.error;
        const stamp = this.stamp(path);
        try {
          const data = await this.transport.request(path, { signal, expectedStatus: 200, parse });
          this.assert(stamp, path);
          if (/\/github\/repositories$/.test(path))
            this.inspectLinks(path, data as RepositoryLink[]);
          if (path === githubBase + '/account') {
            const status = (data as ReturnType<typeof parseAccount>).status;
            if (this.accountState !== status && status !== 'connected')
              this.protect(undefined, path);
            this.accountState = status;
          }
          return data;
        } catch (error) {
          this.assert(stamp, path);
          if (error instanceof HttpError) {
            if (error.status === 429)
              this.pauses.set(path, { until: retryAt(error) ?? Infinity, error });
            if (
              ['GITHUB_ACCESS_SCOPE_CHANGED', 'TASK_ACCESS_SCOPE_CHANGED'].includes(error.code) ||
              error.status === 404 ||
              (error.status === 403 && error.code !== 'CSRF_INVALID')
            ) {
              // Clear source material before allowing a user-triggered reload.
              queueMicrotask(() => {
                this.protect(undefined, path);
                query.clearData(error);
              });
            }
          }
          throw error;
        }
      },
    });
    this.reads.set(path, query);
    return query;
  }
  retry<T>(path: string, query: ManagedQuery<T>) {
    const at = this.pauses.get(path)?.until;
    if (at !== Infinity && at && Date.now() < at) return;
    this.pauses.delete(path);
    void query.load();
  }
  retryQuery<T>(query: ManagedQuery<T>) {
    for (const [path, read] of this.reads)
      if (read === query) {
        this.retry(path, query);
        return;
      }
  }
  account() {
    return this.read(githubBase + '/account', parseAccount);
  }
  links(project: string) {
    return this.read(repositoryBase(project), (value) => array(value, parseLink));
  }
  installations(p = 1) {
    return this.read(`${githubBase}/installations?page=${p}&limit=20`, page(parseInstallation));
  }
  repositories(installation: number, p = 1) {
    return this.read(
      `${githubBase}/installations/${installation}/repositories?page=${p}&limit=20`,
      page(parseRepository),
    );
  }
  settings(base: string) {
    return this.read(base + '/import-settings', parseSettings);
  }
  sync(base: string) {
    return this.read(base + '/sync-status', parseSync);
  }
  issues(base: string, params: URLSearchParams) {
    return this.read(base + '/issues?' + params, parseIssues);
  }
  labels(base: string, cursor = '') {
    return this.read(
      base + '/labels?' + new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) }),
      cursorPage(parseLabel),
    );
  }
  job(id: string) {
    return this.read(githubBase + '/jobs/' + uuid(id), parseJob);
  }
  watchJob(base: string, id: string) {
    this.jobLinks.set(id, base.split('/').at(-1)!);
    let watcher = this.watchers.get(id);
    if (!watcher) {
      const query = this.job(id);
      const inspect = () => {
        const state = query.getSnapshot();
        if (state.status === 'ready' && state.data) this.observeJob(base, state.data);
      };
      const tick = () => {
        const state = query.getSnapshot();
        if (
          document.visibilityState === 'visible' &&
          state.status === 'ready' &&
          state.data &&
          !terminal(state.data)
        )
          void query.load();
      };
      const unsubscribe = query.subscribe(inspect);
      const timer = setInterval(tick, 3000);
      document.addEventListener('visibilitychange', tick);
      watcher = {
        consumers: 0,
        stop: () => {
          unsubscribe();
          clearInterval(timer);
          document.removeEventListener('visibilitychange', tick);
        },
      };
      this.watchers.set(id, watcher);
      inspect();
    }
    watcher.consumers++;
    const current = watcher;
    return () => {
      if (this.watchers.get(id) !== current) return;
      if (--current.consumers === 0) {
        current.stop();
        this.watchers.delete(id);
      }
    };
  }
  refresh(base?: string) {
    for (const [path, query] of this.reads) if (!base || path.startsWith(base)) query.invalidate();
  }
  async mutation<T>(
    path: string,
    method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    body: unknown,
    parse: (v: unknown) => T,
    status = 200,
    key?: string,
  ) {
    const paused = this.pauses.get(path);
    if (paused && paused.until !== Infinity && Date.now() < paused.until) throw paused.error;
    const stamp = this.stamp(path);
    try {
      const value = await this.transport.request(path, {
        method,
        json: body,
        parse,
        expectedStatus: status,
        ...(status === 204 ? { response: 'empty' as const } : {}),
        headers: key ? { 'Idempotency-Key': key } : undefined,
      });
      this.assert(stamp, path);
      return value;
    } catch (error) {
      this.assert(stamp, path);
      if (error instanceof HttpError) {
        const until = retryAt(error);
        if (error.status === 429 && until !== undefined) this.pauses.set(path, { until, error });
        if (error.code === 'CSRF_INVALID') await this.transport.recoverSecurity();
        else if (
          error.status === 404 ||
          error.status === 403 ||
          ['GITHUB_ACCESS_SCOPE_CHANGED', 'TASK_ACCESS_SCOPE_CHANGED'].includes(error.code)
        )
          this.protect();
      }
      throw error;
    }
  }
  async preview(base: string, body: unknown, mapping = false) {
    return this.mutation(
      base + (mapping ? '/status-mapping-previews' : '/task-import-previews'),
      'POST',
      body,
      parsePreview,
    );
  }
  async submit(
    base: string,
    operation: 'task-imports' | 'sync-requests' | 'issue-fetches',
    body?: unknown,
    retry = false,
  ) {
    if (!retry && this.intents.has(base))
      throw new Error('응답이 불확실한 요청이 있습니다. 동일 요청으로 결과를 먼저 확인하세요.');
    let intent = retry ? this.intents.get(base) : undefined;
    if (retry && (!intent || Date.now() - intent.createdAt >= 86400000))
      throw new Error('재시도 정보가 없거나 만료되었습니다. 현황과 미리보기를 다시 확인하세요.');
    if (!intent) {
      intent = {
        path: base + '/' + operation,
        body,
        key: crypto.randomUUID(),
        createdAt: Date.now(),
      };
      this.intents.set(base, intent);
    }
    let result: { jobId: string };
    try {
      result = await this.mutation(
        intent.path,
        'POST',
        intent.body,
        (v) => ({ jobId: uuid(object(v).jobId) }),
        202,
        intent.key,
      );
    } catch (error) {
      if (error instanceof HttpError && error.status >= 400 && error.status < 500)
        this.intents.delete(base);
      throw error;
    }
    this.intents.delete(base);
    this.jobs.set(base, result.jobId);
    this.jobLinks.set(result.jobId, base.split('/').at(-1)!);
    if (!intent.path.endsWith('/task-imports')) this.cooldown.set(base, Date.now() + 60000);
    this.publish();
    return result.jobId;
  }
  async disconnect(base: string, revision: number, disposition: 'convert' | 'purge') {
    const result = await this.mutation(
      base + '?' + new URLSearchParams({ revision: String(revision), disposition }),
      'DELETE',
      undefined,
      (v) => ({ jobId: uuid(object(v).jobId) }),
      202,
    );
    this.protect(base.split('/').at(-1));
    this.jobs.set(base, result.jobId);
    this.jobLinks.set(result.jobId, base.split('/').at(-1)!);
    this.refresh(base.slice(0, base.lastIndexOf('/')));
    this.publish();
  }
  async cleanup(base: string, revision: number) {
    const result = await this.mutation(
      base + '/cleanup-requests',
      'POST',
      { revision, disposition: 'purge' },
      (v) => ({ jobId: uuid(object(v).jobId) }),
      202,
    );
    this.protect(base.split('/').at(-1));
    this.jobs.set(base, result.jobId);
    this.jobLinks.set(result.jobId, base.split('/').at(-1)!);
    this.refresh(base.slice(0, base.lastIndexOf('/')));
    this.publish();
  }
  observeJob(base: string, job: ReturnType<typeof parseJob>) {
    if (terminal(job) && !this.completed.has(job.id)) {
      this.completed.add(job.id);
      this.refresh(base);
      if (job.kind === 'detach' || job.kind === 'collect')
        this.refresh(base.slice(0, base.lastIndexOf('/')));
      this.onChanged();
    }
  }
  async connect(project: string, installationId: number, repositoryId: number, key: string) {
    const link = await this.mutation(
      repositoryBase(project),
      'POST',
      { installationId, repositoryId },
      parseLink,
      201,
      key,
    );
    this.protect(link.id);
    this.jobs.delete(repositoryBase(project, link.id));
    this.refresh(repositoryBase(project));
    return link;
  }
  dispose() {
    this.stopped = true;
    this.epoch++;
    for (const read of this.reads.values()) read.cancel();
    this.reads.clear();
    this.intents.clear();
    this.jobs.clear();
    this.access.clear();
    this.linkLists.clear();
    this.pauses.clear();
    this.cooldown.clear();
    this.listeners.clear();
    for (const watcher of this.watchers.values()) watcher.stop();
    this.watchers.clear();
    this.linkEpochs.clear();
    this.jobLinks.clear();
  }
}
