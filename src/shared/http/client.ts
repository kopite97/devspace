export class CancelledError extends Error {
  constructor() {
    super('Request cancelled');
    this.name = 'CancelledError';
  }
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors: Record<string, string> = {},
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class Lifecycle {
  generation = 0;
  private controller = new AbortController();
  get signal() {
    return this.controller.signal;
  }
  reset() {
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
  }
  assert(generation: number) {
    if (generation !== this.generation) throw new CancelledError();
  }
}

export class SingleFlight<T> {
  private current?: { generation: number; promise: Promise<T> };
  run(generation: number, work: () => Promise<T>): Promise<T> {
    if (this.current?.generation === generation) return this.current.promise;
    const promise = Promise.resolve().then(work);
    const entry = { generation, promise };
    this.current = entry;
    void promise
      .finally(() => {
        if (this.current === entry) this.current = undefined;
      })
      .catch(() => {});
    return promise;
  }
}

type RequestOptions<T> = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  json?: unknown;
  form?: FormData;
  timeoutMs?: number;
  headers?: HeadersInit;
  signal?: AbortSignal;
  generation?: number;
  response?: 'json' | 'empty' | 'blob';
  expectedStatus?: number;
  parse?: (value: unknown) => T;
  onMetadata?: (metadata: ResponseMetadata) => void;
};

export type ResponseMetadata = {
  workspaceRevision?: string;
  generation: number;
};

export function workspaceRevision(value: string | null): string | undefined {
  return value !== null && /^(0|[1-9]\d*)$/.test(value) ? value : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function createHttpClient(deps: {
  lifecycle: Lifecycle;
  fetch?: typeof fetch;
  timeoutMs?: number;
  onAuthError?: (error: HttpError, generation: number) => void;
  getCsrfToken?: (generation: number) => Promise<string>;
}) {
  const fetcher = deps.fetch ?? globalThis.fetch.bind(globalThis);
  return async function request<T = unknown>(
    path: string,
    options: RequestOptions<T> = {},
  ): Promise<T> {
    const generation = options.generation ?? deps.lifecycle.generation;
    deps.lifecycle.assert(generation);
    // Encoded path separators and dot segments must not escape the API root.
    if (
      !/^\/api\/v(?:1|2|3)\//.test(path) ||
      /[\\#\s]/.test(path) ||
      /%(?:2e|2f|5c|25)/i.test(path.split('?')[0]) ||
      path.split('?')[0].split('/').includes('..')
    ) {
      throw new HttpError(0, 'INVALID_TARGET', 'Invalid API target.');
    }
    const controller = new AbortController();
    const signals = [deps.lifecycle.signal, options.signal].filter((s): s is AbortSignal => !!s);
    const abort = () => controller.abort();
    for (const signal of signals) {
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
    let timedOut = false;
    const timer = setTimeout(
      () => {
        timedOut = true;
        controller.abort();
      },
      options.timeoutMs ?? deps.timeoutMs ?? 15000,
    );
    const check = () => {
      deps.lifecycle.assert(generation);
      if (signals.some((signal) => signal.aborted)) throw new CancelledError();
      if (timedOut) throw new HttpError(0, 'TIMEOUT', 'The request timed out. Please retry.');
    };
    const waitFor = <V>(work: Promise<V>): Promise<V> =>
      new Promise((resolve, reject) => {
        const interrupted = () => {
          try {
            check();
          } catch (error) {
            reject(error);
          }
        };
        controller.signal.addEventListener('abort', interrupted, { once: true });
        if (controller.signal.aborted) interrupted();
        void work
          .then(resolve, reject)
          .finally(() => controller.signal.removeEventListener('abort', interrupted));
      });
    let reportedAuthError: HttpError | undefined;
    try {
      check();
      const headers = new Headers(options.headers);
      if (options.form && (options.json !== undefined || headers.has('Content-Type')))
        throw new HttpError(0, 'INVALID_BODY', 'Multipart requests must use a browser boundary.');
      if (headers.has('Origin') || headers.has('Cookie'))
        throw new HttpError(0, 'INVALID_HEADER', 'Browser-owned headers cannot be set.');
      if (!headers.has('Accept')) headers.set('Accept', 'application/json');
      if (options.json !== undefined && !headers.has('Content-Type'))
        headers.set('Content-Type', 'application/json');
      if (
        options.method &&
        ['POST', 'PATCH', 'PUT', 'DELETE'].includes(options.method) &&
        deps.getCsrfToken
      ) {
        const token = await waitFor(deps.getCsrfToken(generation));
        check();
        headers.set('X-CSRF-Token', token);
      }
      const response = await waitFor(
        fetcher(path, {
          method: options.method ?? 'GET',
          credentials: 'same-origin',
          redirect: 'error',
          headers,
          body:
            options.form ?? (options.json === undefined ? undefined : JSON.stringify(options.json)),
          signal: controller.signal,
        }),
      );
      check();
      if (!response.ok) {
        const reportedUnauthorized = response.status === 401 && !!deps.onAuthError;
        if (reportedUnauthorized) {
          // Invalidate from headers immediately; an unreadable body cannot keep a session alive.
          reportedAuthError = new HttpError(401, 'HTTP_ERROR', 'Authentication is required.');
          deps.onAuthError?.(reportedAuthError, generation);
        }
        let body: Record<string, unknown> = {};
        try {
          body = record(await waitFor(response.json()));
        } catch {
          /* Status remains authoritative. */
        }
        if (reportedUnauthorized) {
          // The callback intentionally retired this request; retain any body already available.
        } else if (response.status === 401) {
          // Status remains authoritative even if reading its error body timed out.
          deps.lifecycle.assert(generation);
          if (signals.some((signal) => signal.aborted)) throw new CancelledError();
        } else check();
        const fields: Record<string, string> = {};
        for (const [key, value] of Object.entries(record(body.fieldErrors)))
          if (typeof value === 'string')
            Object.defineProperty(fields, key, { value, enumerable: true });
        const error = new HttpError(
          response.status,
          text(body.code) ?? 'HTTP_ERROR',
          body.code === 'API_VERSION_RETIRED'
            ? '이전 API의 생성 재시도 기간이 종료되었습니다. 초안과 요청은 유지됩니다. 현재 목록에서 생성 여부를 확인한 후 새 작업을 시작해 주세요.'
            : 'The request could not be completed.',
          fields,
          text(body.requestId),
        );
        if (
          (response.status === 401 && !reportedUnauthorized) ||
          (response.status === 403 && error.code === 'ACCOUNT_DISABLED')
        ) {
          reportedAuthError = error;
          deps.onAuthError?.(error, generation);
        }
        if (reportedUnauthorized) reportedAuthError = error;
        throw error;
      }
      if (options.expectedStatus !== undefined && response.status !== options.expectedStatus)
        throw new HttpError(
          response.status,
          'PROTOCOL_ERROR',
          'Unexpected server response status.',
        );
      if (options.response === 'empty') {
        if (response.status !== 204)
          throw new HttpError(response.status, 'PROTOCOL_ERROR', 'Unexpected server response.');
        check();
        options.onMetadata?.({
          workspaceRevision: workspaceRevision(response.headers.get('X-Workspace-Data-Revision')),
          generation,
        });
        return undefined as T;
      }
      if (options.response === 'blob') {
        const blob = await waitFor(response.blob());
        check();
        return blob as T;
      }
      if (!/\bapplication\/(?:[\w.-]+\+)?json\b/i.test(response.headers.get('Content-Type') ?? ''))
        throw new HttpError(response.status, 'PROTOCOL_ERROR', 'Expected a JSON response.');
      let value: unknown;
      try {
        value = await waitFor(response.json());
      } catch {
        throw new HttpError(response.status, 'PROTOCOL_ERROR', 'Invalid JSON response.');
      }
      check();
      let parsed: T;
      try {
        parsed = options.parse ? options.parse(value) : (value as T);
      } catch {
        throw new HttpError(response.status, 'PROTOCOL_ERROR', 'Invalid server response.');
      }
      check();
      options.onMetadata?.({
        workspaceRevision: workspaceRevision(response.headers.get('X-Workspace-Data-Revision')),
        generation,
      });
      return parsed;
    } catch (error) {
      // An active auth callback may have retired this generation; preserve its typed error.
      if (error === reportedAuthError) throw error;
      check();
      if (error instanceof HttpError || error instanceof CancelledError) throw error;
      throw new HttpError(0, 'NETWORK_ERROR', 'Unable to reach the server. Please retry.');
    } finally {
      clearTimeout(timer);
      for (const signal of signals) signal.removeEventListener('abort', abort);
    }
  };
}
