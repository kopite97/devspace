import { describe, expect, it } from 'vitest';
import { Lifecycle, createHttpClient } from '../../shared/http/client';
import { DashboardStore } from './apiStore';
import { parseWidgetSnapshot, parseWidgets, saveBody, type Widget } from './apiModel';

const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const id2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const snapshot = (widgetId = id, title = '제목') => ({
  id: widgetId,
  type: 'overview',
  title,
  configVersion: 1,
  revision: 1,
  config: { selection: { kind: 'all' } },
  referenceState: 'valid',
  createdAt: '2026-09-17T00:00:00Z',
  updatedAt: '2026-09-17T00:00:00Z',
});
const home = (layoutRevision = 1, widgets = [snapshot()]) => ({
  id: 'home',
  schemaVersion: 3,
  initialized: true,
  layoutRevision,
  placements: widgets.map((widget, index) => ({
    id: index ? id2 : id,
    widgetId: widget.id,
    size: 'medium',
  })),
  widgets,
});

function make(fetcher: typeof fetch) {
  const lifecycle = new Lifecycle();
  return new DashboardStore({
    lifecycle,
    generation: 0,
    recoverSecurity: async () => {},
    request: createHttpClient({ lifecycle, fetch: fetcher, getCsrfToken: async () => 'csrf' }),
  });
}

describe('Dashboard v3 / Widget v1 store', () => {
  it('retiring protected Widget reads does not cancel the independent Home layout read', async () => {
    let resolve!: (response: Response) => void;
    const store = make(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    const pending = store.home.load();
    await new Promise((done) => setTimeout(done, 0));
    store.clearProtectedData();
    resolve(Response.json(home(1)));
    await pending;
    expect(store.home.getSnapshot().status).toBe('ready');
    store.dispose();
  });
  it.each(['board', 'overview'])(
    'reports %s partial data from its actual nested statistics field',
    async (type) => {
      const store = make(async () =>
        Response.json({
          widgetId: id,
          type,
          configRevision: 1,
          configVersion: 1,
          payloadVersion: 1,
          availability: 'ready',
          freshness: 'current',
          readAt: '2026-10-20T00:00:00Z',
          sourceObservedAt: null,
          lastSuccessfulSyncAt: null,
          data: {
            kind: type,
            [type === 'board' ? 'statistics' : 'tasks']: {
              total: 1,
              externalDataUnavailable: true,
            },
          },
          page: null,
          problem: null,
        }),
      );
      let count = 0;
      store.onPartial = () => {
        count++;
      };
      const query = store.widgetData(id);
      await query.load();
      expect(count).toBe(1);
      expect(query.getSnapshot().status).toBe('ready');
      store.dispose();
    },
  );
  it('reads v3 Home and explicit initialization uses the v3 initialization endpoint', async () => {
    const calls: { path: string; options?: RequestInit }[] = [];
    const store = make(async (path, options) => {
      calls.push({ path: String(path), options });
      return String(path).includes('/initializations')
        ? Response.json(home(1), { status: 201 })
        : Response.json({
            id: 'home',
            schemaVersion: 3,
            initialized: false,
            layoutRevision: 0,
            placements: [],
            widgets: [],
          });
    });
    await store.home.load();
    expect(store.home.getSnapshot().data?.initialized).toBe(false);
    await store.initialize();
    expect(calls[0].path).toBe('/api/v3/dashboards/home');
    expect(calls[1].path).toBe('/api/v3/dashboards/home/initializations');
    expect(new Headers(calls[1].options?.headers).get('Idempotency-Key')).toBeTruthy();
    expect(JSON.parse(String(calls[1].options?.body))).toEqual({
      schemaVersion: 3,
      layoutRevision: 0,
    });
  });

  it('creates a Widget configuration before saving its placement', async () => {
    const calls: { path: string; options?: RequestInit }[] = [];
    const store = make(async (path, options) => {
      calls.push({ path: String(path), options });
      if (String(path) === '/api/v3/dashboards/home' && options?.method === 'PUT')
        return Response.json({
          id: 'home',
          schemaVersion: 3,
          initialized: true,
          layoutRevision: 2,
          placements: [{ id: id2, widgetId: id, size: 'wide' }],
          widgets: [snapshot()],
        });
      if (String(path) === '/api/v1/widgets') return Response.json(snapshot(), { status: 201 });
      return Response.json(home(1));
    });
    await store.home.load();
    const [draft] = parseWidgets([
      {
        id: 'draft-widget',
        type: 'overview',
        title: '새 위젯',
        size: 'wide',
        selection: { kind: 'all' },
      },
    ]);
    await store.save({ layoutRevision: 1, widgets: [draft] });
    expect(calls.map((call) => call.path)).toEqual([
      '/api/v3/dashboards/home',
      '/api/v1/widgets',
      '/api/v3/dashboards/home',
    ]);
    expect(JSON.parse(String(calls[1].options?.body))).toMatchObject({
      type: 'overview',
      config: { selection: { kind: 'all' } },
    });
    expect(JSON.parse(String(calls[2].options?.body))).toEqual(
      saveBody(1, [{ ...draft, id, size: 'wide' }]),
    );
  });

  it('reuses an unplaced Widget without creating a duplicate', async () => {
    const calls: { path: string; options?: RequestInit }[] = [];
    const unplacedSnapshot = snapshot(id2, '미배치');
    const unplaced = { ...parseWidgetSnapshot(unplacedSnapshot), size: 'medium' as const };
    const store = make(async (path, options) => {
      calls.push({ path: String(path), options });
      if (String(path) === '/api/v1/widgets?unplaced=true&limit=100')
        return Response.json({ items: [unplacedSnapshot], nextCursor: null });
      if (options?.method === 'PUT' && String(path) === '/api/v3/dashboards/home')
        return Response.json(home(2, [unplacedSnapshot]));
      return Response.json(home(1));
    });
    await store.home.load();
    await store.available.load();
    await store.save({ layoutRevision: 1, widgets: [{ ...unplaced, size: 'wide' }] });
    expect(calls.map((call) => call.path)).toEqual([
      '/api/v3/dashboards/home',
      '/api/v1/widgets?unplaced=true&limit=100',
      '/api/v3/dashboards/home',
    ]);
  });

  it('updates a Widget independently and keeps layout revision in the Dashboard request', async () => {
    const calls: { path: string; options?: RequestInit }[] = [];
    const store = make(async (path, options) => {
      calls.push({ path: String(path), options });
      if (options?.method === 'PUT' && String(path).includes('/widgets/'))
        return Response.json({ ...snapshot(id, '수정'), revision: 2 });
      if (options?.method === 'PUT')
        return Response.json(home(3, [{ ...snapshot(id, '수정'), revision: 2 }]));
      return Response.json(home(2));
    });
    await store.home.load();
    const current = store.home.getSnapshot().data!.widgets[0];
    await store.save({ layoutRevision: 2, widgets: [{ ...current, title: '수정', size: 'wide' }] });
    expect(calls.map((call) => call.path)).toEqual([
      '/api/v3/dashboards/home',
      '/api/v1/widgets/' + id,
      '/api/v3/dashboards/home',
    ]);
    expect(JSON.parse(String(calls[1].options?.body))).toMatchObject({
      revision: 1,
      title: '수정',
    });
    expect(JSON.parse(String(calls[2].options?.body))).toMatchObject({
      layoutRevision: 2,
      schemaVersion: 3,
    });
  });

  it('does not save against a stale layout revision or overlap mutations', async () => {
    let resolveSave!: (response: Response) => void;
    const store = make(async (_path, options) => {
      if (options?.method === 'PUT')
        return new Promise<Response>((resolve) => {
          resolveSave = resolve;
        });
      return Response.json(home(4));
    });
    await store.home.load();
    const widget = store.home.getSnapshot().data!.widgets[0];
    await expect(store.save({ layoutRevision: 3, widgets: [widget] })).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
    });
    const pending = store.save({ layoutRevision: 4, widgets: [widget] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(store.save({ layoutRevision: 4, widgets: [widget] })).rejects.toThrow();
    resolveSave(Response.json(home(5)));
    await pending;
  });

  it('deletes only an unplaced Widget with its captured revision', async () => {
    const calls: { path: string; options?: RequestInit }[] = [];
    const store = make(async (path, options) => {
      calls.push({ path: String(path), options });
      if (options?.method === 'DELETE') return Response.json({ id });
      return Response.json(home(1));
    });
    const widget = {
      ...parseWidgets([
        { id: 'draft', type: 'overview', title: '초안', size: 'small', selection: { kind: 'all' } },
      ])[0],
      id,
      revision: 3,
    };
    await expect(store.deleteWidget(widget)).resolves.toEqual({ id });
    expect(calls[0].path).toBe('/api/v1/widgets/' + id + '?revision=3');
    expect(calls[0].options?.method).toBe('DELETE');
  });

  it('reads typed Widget data envelopes and rejects a response for another Widget', async () => {
    const store = make(async (path) => {
      if (String(path).endsWith('/data'))
        return Response.json({
          widgetId: id,
          type: 'overview',
          configRevision: 1,
          configVersion: 1,
          payloadVersion: 1,
          availability: 'empty',
          freshness: 'current',
          readAt: '2026-09-17T00:00:00Z',
          sourceObservedAt: null,
          lastSuccessfulSyncAt: null,
          data: { kind: 'overview', projects: [], tasks: { todo: 0, doing: 0, done: 0, total: 0 } },
          page: null,
          problem: null,
        });
      return Response.json(home(1));
    });
    const data = store.widgetData(id);
    await data.load();
    expect(data.getSnapshot().data?.data).toMatchObject({ kind: 'overview' });

    const wrong = make(async (path) => {
      if (String(path).endsWith('/data'))
        return Response.json({
          widgetId: id2,
          type: 'overview',
          configRevision: 1,
          configVersion: 1,
          payloadVersion: 1,
          availability: 'empty',
          freshness: 'current',
          readAt: '2026-09-17T00:00:00Z',
          sourceObservedAt: null,
          lastSuccessfulSyncAt: null,
          data: { kind: 'overview', projects: [], tasks: { todo: 0, doing: 0, done: 0, total: 0 } },
          page: null,
          problem: null,
        });
      return Response.json(home(1));
    });
    const wrongData = wrong.widgetData(id);
    await wrongData.load();
    expect(wrongData.getSnapshot().status).toBe('error');
  });
});
