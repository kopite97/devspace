import { CancelledError, HttpError } from '../../shared/http/client';
import { Query } from '../../shared/http/query';
import { count, object, oneOf, string, timestamp, uuid } from '../../shared/http/validation';
import type { PrivateTransport } from '../../shared/http/transport';
import {
  createWidgetBody,
  parseDashboard,
  parseWidgetSnapshot,
  saveBody,
  updateWidgetBody,
  type ApiDashboard,
  type DashboardSave,
  type Widget,
  type WidgetDataEnvelope,
} from './apiModel';

export type WidgetDefinition = {
  type: string;
  configVersion: number;
  configSchema: Record<string, unknown>;
  supportedSizes: string[];
  dataKind: string;
  availability: string;
};

function parseWidgetPage(value: unknown) {
  const v = object(value);
  if (Object.keys(v).some((key) => !['items', 'nextCursor'].includes(key)))
    throw new Error('Invalid Widget page.');
  if (!Array.isArray(v.items) || (v.nextCursor !== null && typeof v.nextCursor !== 'string'))
    throw new Error('Invalid Widget page.');
  return {
    items: v.items.map(parseWidgetSnapshot),
    nextCursor: v.nextCursor as string | null,
  };
}

function parseDefinition(value: unknown): WidgetDefinition {
  const v = object(value);
  if (
    Object.keys(v).some(
      (key) =>
        ![
          'type',
          'configVersion',
          'configSchema',
          'supportedSizes',
          'dataKind',
          'availability',
        ].includes(key),
    )
  )
    throw new Error('Invalid Widget catalog entry.');
  const supportedSizes = v.supportedSizes;
  if (!Array.isArray(supportedSizes) || !supportedSizes.every((size) => typeof size === 'string'))
    throw new Error('Invalid Widget catalog sizes.');
  const type = oneOf(v.type, [
    'overview',
    'board',
    'deploy',
    'links',
    'journal',
    'milestone',
  ] as const);
  const configVersion = count(v.configVersion);
  if (configVersion < 1) throw new Error('Invalid Widget catalog version.');
  const dataKind = string(v.dataKind);
  if (dataKind !== type) throw new Error('Invalid Widget catalog data kind.');
  const availability = oneOf(v.availability, ['ready', 'unavailable'] as const);
  if (
    !supportedSizes.length ||
    supportedSizes.some((size) => !['small', 'medium', 'wide'].includes(size))
  )
    throw new Error('Invalid Widget catalog sizes.');
  return {
    type,
    configVersion,
    configSchema: object(v.configSchema),
    supportedSizes,
    dataKind,
    availability,
  };
}

function parseDataEnvelope(value: unknown): WidgetDataEnvelope {
  const v = object(value);
  const data = v.data;
  const page = v.page;
  const problem = v.problem;
  if (
    ![
      'widgetId',
      'type',
      'configRevision',
      'configVersion',
      'payloadVersion',
      'availability',
      'freshness',
      'readAt',
      'sourceObservedAt',
      'lastSuccessfulSyncAt',
      'data',
      'page',
      'problem',
    ].every((key) => key in v)
  )
    throw new Error('Invalid Widget data response.');
  if (page !== null) {
    const p = object(page);
    if (typeof p.total !== 'number' || !Number.isSafeInteger(p.total) || p.total < 0)
      throw new Error('Invalid Widget data total.');
    if (p.nextCursor !== null && typeof p.nextCursor !== 'string')
      throw new Error('Invalid Widget data cursor.');
  }
  let parsedProblem: WidgetDataEnvelope['problem'] = null;
  if (problem !== null) {
    const p = object(problem);
    if (typeof p.code !== 'string' || typeof p.retryable !== 'boolean')
      throw new Error('Invalid Widget data problem.');
    parsedProblem = { code: p.code, retryable: p.retryable };
  }
  const type = oneOf(v.type, [
    'overview',
    'board',
    'deploy',
    'links',
    'journal',
    'milestone',
  ] as const);
  const availability = oneOf(v.availability, ['ready', 'empty', 'unavailable'] as const);
  const freshness = oneOf(v.freshness, ['current', 'stale', 'unknown'] as const);
  const parsedData = data === null ? null : object(data);
  if (parsedData && parsedData.kind !== type) throw new Error('Widget data type mismatch.');
  if (availability === 'unavailable') {
    if (freshness !== 'unknown' || parsedData !== null || page !== null || parsedProblem === null)
      throw new Error('Unavailable Widget data must not contain data.');
  } else if (freshness === 'unknown' || parsedData === null) {
    throw new Error('Widget data payload is missing.');
  }
  if (freshness === 'current' && parsedProblem !== null)
    throw new Error('Current Widget data cannot contain a problem.');
  const configRevision = count(v.configRevision);
  const configVersion = count(v.configVersion);
  const payloadVersion = count(v.payloadVersion);
  if (configRevision < 1 || configVersion < 1 || payloadVersion < 1)
    throw new Error('Invalid Widget data version.');
  return {
    widgetId: uuid(v.widgetId),
    type,
    configRevision,
    configVersion,
    payloadVersion,
    availability,
    freshness,
    readAt: timestamp(v.readAt),
    sourceObservedAt: v.sourceObservedAt === null ? null : timestamp(v.sourceObservedAt),
    lastSuccessfulSyncAt:
      v.lastSuccessfulSyncAt === null ? null : timestamp(v.lastSuccessfulSyncAt),
    data: parsedData,
    page:
      page === null
        ? null
        : {
            total: (page as Record<string, unknown>).total as number,
            nextCursor: (page as Record<string, unknown>).nextCursor as string | null,
          },
    problem: parsedProblem,
  };
}

function key() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export class DashboardStore {
  onPartial = () => {};
  readonly home: Query<ApiDashboard>;
  readonly catalog: Query<WidgetDefinition[]>;
  readonly available: Query<ReturnType<typeof parseWidgetPage>>;
  private readonly dataQueries = new Map<string, Query<WidgetDataEnvelope>>();
  private epoch = 0;
  private lifetime = new AbortController();
  private pending = false;
  private watermark = 0;
  private initializationKey?: string;
  private readonly creationIntents = new Map<string, { key: string; fingerprint: string }>();
  onSaved = () => {};

  constructor(readonly transport: PrivateTransport) {
    this.home = new Query(async (signal) => {
      const epoch = this.epoch;
      const data = await transport.request('/api/v3/dashboards/home', {
        signal,
        generation: transport.generation,
        expectedStatus: 200,
        parse: parseDashboard,
      });
      this.assert(epoch);
      if (data.layoutRevision < this.watermark)
        throw new Error('이전 배치 응답입니다. 다시 확인해 주세요.');
      this.watermark = data.layoutRevision;
      return data;
    });
    this.catalog = new Query((signal) =>
      transport.request('/api/v1/widget-types', {
        signal,
        generation: transport.generation,
        expectedStatus: 200,
        parse: (value) => {
          if (!Array.isArray(value)) throw new Error('Invalid Widget catalog.');
          return value.map(parseDefinition);
        },
      }),
    );
    this.available = new Query((signal) =>
      transport.request('/api/v1/widgets?unplaced=true&limit=100', {
        signal,
        generation: transport.generation,
        expectedStatus: 200,
        parse: parseWidgetPage,
      }),
    );
    transport.lifecycle.signal.addEventListener('abort', () => this.dispose(), { once: true });
  }

  private assert(epoch = this.epoch) {
    this.transport.lifecycle.assert(this.transport.generation);
    if (this.lifetime.signal.aborted || epoch !== this.epoch) throw new CancelledError();
  }

  widgetData(id: string, cursor?: string) {
    const keyName = id + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : '');
    let query = this.dataQueries.get(keyName);
    if (!query) {
      query = new Query((signal) =>
        this.transport.request(
          '/api/v1/widgets/' +
            encodeURIComponent(id) +
            '/data' +
            (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''),
          {
            signal,
            generation: this.transport.generation,
            expectedStatus: 200,
            parse: (value) => {
              const data = parseDataEnvelope(value);
              if (data.widgetId !== id) throw new Error('Widget data identity mismatch.');
              const payload = data.data === null ? null : object(data.data);
              const statistics =
                data.type === 'board'
                  ? payload?.statistics
                  : data.type === 'overview'
                    ? payload?.tasks
                    : undefined;
              if (
                statistics &&
                typeof statistics === 'object' &&
                'externalDataUnavailable' in statistics &&
                statistics.externalDataUnavailable === true
              )
                this.onPartial();
              return data;
            },
          },
        ),
      );
      this.dataQueries.set(keyName, query);
    }
    return query;
  }

  invalidate() {
    this.epoch++;
    this.home.invalidate();
    this.catalog.invalidate();
    this.available.invalidate();
    for (const query of this.dataQueries.values()) query.invalidate();
  }
  clearProtectedData() {
    for (const query of this.dataQueries.values()) query.invalidate(true);
  }

  async initialize() {
    this.assert();
    const result = await this.transport.request('/api/v3/dashboards/home/initializations', {
      method: 'POST',
      json: { schemaVersion: 3, layoutRevision: 0 },
      headers: { 'Idempotency-Key': (this.initializationKey ??= key()) },
      generation: this.transport.generation,
      signal: this.lifetime.signal,
      expectedStatus: 201,
      parse: parseDashboard,
    });
    this.assert();
    this.watermark = Math.max(this.watermark, result.layoutRevision);
    this.home.seed(result);
    this.available.invalidate();
    this.initializationKey = undefined;
    this.onSaved();
    return result;
  }

  async initializeEmpty() {
    this.assert();
    const result = await this.transport.request('/api/v3/dashboards/home', {
      method: 'PUT',
      json: { schemaVersion: 3, layoutRevision: 0, placements: [] },
      generation: this.transport.generation,
      signal: this.lifetime.signal,
      expectedStatus: 200,
      parse: parseDashboard,
    });
    this.assert();
    this.watermark = Math.max(this.watermark, result.layoutRevision);
    this.home.seed(result);
    this.available.invalidate();
    this.onSaved();
    return result;
  }

  async save(intent: DashboardSave) {
    this.assert();
    if (this.pending) throw new Error('배치를 저장 중입니다.');
    const baseline = this.home.getSnapshot().data;
    if (!baseline || baseline.layoutRevision !== intent.layoutRevision)
      throw new HttpError(409, 'REVISION_CONFLICT', '최신 배치를 먼저 확인해 주세요.');
    this.pending = true;
    try {
      const current = new Map(
        [
          ...baseline.widgets,
          ...(baseline.unplacedWidgets ?? []),
          ...(this.available.getSnapshot().data?.items ?? []),
        ].map((widget) => [widget.id, widget]),
      );
      const resolved: Widget[] = [];
      for (const draft of intent.widgets) {
        const previous = current.get(draft.id);
        if (previous) {
          if (previous.type !== draft.type)
            throw new HttpError(
              409,
              'WIDGET_TYPE_IMMUTABLE',
              '기존 위젯의 종류는 변경할 수 없습니다.',
            );
          const changed =
            previous.title !== draft.title ||
            JSON.stringify(previous.selection) !== JSON.stringify(draft.selection) ||
            previous.limit !== draft.limit ||
            (draft.configVersion !== undefined && previous.configVersion !== draft.configVersion);
          if (changed) {
            const saved = await this.transport.request(
              '/api/v1/widgets/' + encodeURIComponent(draft.id),
              {
                method: 'PUT',
                json: updateWidgetBody({
                  ...draft,
                  revision: previous.revision,
                  configVersion: previous.configVersion,
                }),
                generation: this.transport.generation,
                signal: this.lifetime.signal,
                expectedStatus: 200,
                parse: parseWidgetSnapshot,
              },
            );
            resolved.push({ ...saved, size: draft.size });
          } else resolved.push({ ...previous, size: draft.size });
        } else {
          const createBody = createWidgetBody(draft);
          const fingerprint = JSON.stringify(createBody);
          const intent = this.creationIntents.get(draft.id);
          const creationKey = intent?.fingerprint === fingerprint ? intent.key : key();
          this.creationIntents.set(draft.id, { key: creationKey, fingerprint });
          const created = await this.transport.request('/api/v1/widgets', {
            method: 'POST',
            json: createBody,
            headers: { 'Idempotency-Key': creationKey },
            generation: this.transport.generation,
            signal: this.lifetime.signal,
            expectedStatus: 201,
            parse: parseWidgetSnapshot,
          });
          resolved.push({ ...created, size: draft.size });
        }
      }
      const response = await this.transport.request('/api/v3/dashboards/home', {
        method: 'PUT',
        json: saveBody(intent.layoutRevision, resolved),
        generation: this.transport.generation,
        signal: this.lifetime.signal,
        expectedStatus: 200,
        parse: parseDashboard,
      });
      this.assert();
      if (
        response.layoutRevision <= intent.layoutRevision ||
        response.layoutRevision < this.watermark
      )
        throw new HttpError(
          200,
          'PROTOCOL_ERROR',
          '저장 응답을 확인하지 못했습니다. 최신 배치를 확인해 주세요.',
        );
      this.watermark = response.layoutRevision;
      this.home.seed(response);
      this.available.invalidate();
      for (const query of this.dataQueries.values()) query.invalidate();
      for (const draft of intent.widgets) this.creationIntents.delete(draft.id);
      this.onSaved();
      return response;
    } catch (error) {
      this.assert();
      this.home.invalidate();
      throw error;
    } finally {
      this.pending = false;
    }
  }

  async deleteWidget(widget: Widget) {
    this.assert();
    if (widget.revision === undefined) throw new Error('Widget revision이 없습니다.');
    const deleted = await this.transport.request(
      '/api/v1/widgets/' +
        encodeURIComponent(widget.id) +
        '?revision=' +
        encodeURIComponent(String(widget.revision)),
      {
        method: 'DELETE',
        generation: this.transport.generation,
        signal: this.lifetime.signal,
        expectedStatus: 200,
        parse: (value) => {
          const v = object(value);
          if (Object.keys(v).some((key) => key !== 'id'))
            throw new Error('Invalid deleted Widget.');
          return { id: uuid(v.id) };
        },
      },
    );
    this.assert();
    if (deleted.id !== widget.id) throw new Error('Deleted Widget identity mismatch.');
    this.available.invalidate();
    this.dataQueries.get(widget.id)?.cancel();
    return deleted;
  }

  dispose() {
    this.lifetime.abort();
    this.epoch++;
    this.home.cancel();
    this.catalog.cancel();
    this.available.cancel();
    for (const query of this.dataQueries.values()) query.cancel();
  }
}
