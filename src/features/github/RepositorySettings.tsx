import { useState } from 'react';
import { Button } from '../../shared/ui/controls';
import { useUnsavedChanges } from '../../shared/hooks/useUnsavedChanges';
import type { GitHubStore } from './store';
import { ids, parseSettings, type Settings, type Preview } from './model';
import { errorText, itemError } from './errors';

export function RepositorySettings({
  store,
  base,
  settings,
  blocked,
}: {
  store: GitHubStore;
  base: string;
  settings: Settings;
  blocked: boolean;
}) {
  const [baseline, setBaseline] = useState(settings);
  const [enabled, setEnabled] = useState(settings.enabled),
    [labels, setLabels] = useState(settings.criteria.labelIds.join(','));
  const [assignees, setAssignees] = useState(settings.criteria.assigneeIds.join(','));
  const [mapping, setMapping] = useState(
    Object.fromEntries(
      Object.entries(settings.mapping).map(([k, v]) => [k, v === null ? '' : String(v)]),
    ),
  );
  const [preview, setPreview] = useState<Preview>(),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false);
  const changed =
    enabled !== baseline.enabled ||
    labels !== baseline.criteria.labelIds.join(',') ||
    assignees !== baseline.criteria.assigneeIds.join(',');
  const mappingChanged = Object.entries(baseline.mapping).some(
    ([k, v]) => mapping[k] !== (v === null ? '' : String(v)),
  );
  useUnsavedChanges(changed || mappingChanged || busy);
  const conflict = settings.revision !== baseline.revision;
  const mappingBody = () => {
    const values = Object.fromEntries(
      Object.entries(mapping).map(([k, v]) => [k, v ? ids(v, 1)[0] : null]),
    );
    const chosen = Object.values(values).filter((v) => v !== null);
    if (new Set(chosen).size !== chosen.length)
      throw new Error('상태 라벨은 중복 지정할 수 없습니다.');
    return values;
  };
  const run = async (kind: 'criteria' | 'preview' | 'mapping', afterIssueId?: number) => {
    setBusy(true);
    setNotice('');
    try {
      if (kind === 'preview') {
        setPreview(
          await store.preview(
            base,
            {
              ...mappingBody(),
              limit: 100,
              ...(afterIssueId === undefined ? {} : { afterIssueId }),
            },
            true,
          ),
        );
      } else {
        const body =
          kind === 'criteria'
            ? {
                revision: baseline.revision,
                enabled,
                labelIds: ids(labels),
                assigneeIds: ids(assignees),
              }
            : { revision: baseline.revision, ...mappingBody() };
        const result = await store.mutation(
          base + (kind === 'criteria' ? '/import-settings' : '/status-mapping'),
          'PUT',
          body,
          parseSettings,
        );
        setBaseline(result);
        setPreview(undefined);
        store.refresh(base);
        store.onChanged();
        setNotice('설정을 저장했습니다. 비동기 처리 상태와 Task 반영 결과를 확인해 주세요.');
      }
    } catch (e) {
      setNotice(errorText(e));
      store.settings(base).invalidate();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="github-panel">
      <h3>자동 가져오기</h3>
      <p>현재 조건과 이미 일치하는 Issue는 자동 생성되지 않습니다. 후보를 미리보고 선택하세요.</p>
      {conflict && (
        <div role="alert" className="notice">
          <p>
            서버 설정이 변경되었습니다. 입력 내용은 유지됩니다. 최신 값을 불러온 뒤 다시 적용하세요.
          </p>
          <Button
            onClick={() => {
              setBaseline(settings);
              setEnabled(settings.enabled);
              setLabels(settings.criteria.labelIds.join(','));
              setAssignees(settings.criteria.assigneeIds.join(','));
              setMapping(
                Object.fromEntries(
                  Object.entries(settings.mapping).map(([k, v]) => [
                    k,
                    v === null ? '' : String(v),
                  ]),
                ),
              );
              setPreview(undefined);
            }}
          >
            최신 설정 불러오기
          </Button>
        </div>
      )}
      <label>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        자동 가져오기 활성화
      </label>
      <div className="github-filters">
        <label>
          자동 가져오기 라벨 ID
          <input value={labels} onChange={(e) => setLabels(e.target.value)} />
        </label>
        <label>
          자동 가져오기 담당자 ID
          <input value={assignees} onChange={(e) => setAssignees(e.target.value)} />
        </label>
      </div>
      {!labels.trim() && !assignees.trim() && (
        <p className="notice">빈 조건은 모든 Issue와 일치합니다.</p>
      )}
      <Button
        disabled={busy || blocked || conflict || !changed}
        onClick={() => void run('criteria')}
      >
        자동 가져오기 설정 저장
      </Button>
      <h3>상태 라벨 매핑</h3>
      <p>라벨 ID를 지정하세요. 빈 값은 해제이며 Done 매핑은 선택 사항입니다.</p>
      <div className="github-filters">
        {(['todoLabelId', 'doingLabelId', 'doneLabelId'] as const).map((key, i) => (
          <label key={key}>
            {['할 일 라벨 ID', '진행 중 라벨 ID', '완료 라벨 ID'][i]}
            <input
              value={mapping[key]}
              onChange={(e) => {
                setMapping({ ...mapping, [key]: e.target.value });
                setPreview(undefined);
              }}
            />
          </label>
        ))}
      </div>
      <div className="github-actions">
        <Button
          disabled={busy || blocked || conflict || !mappingChanged}
          onClick={() => void run('preview')}
        >
          매핑 영향 미리보기
        </Button>
        <Button
          disabled={busy || blocked || conflict || !mappingChanged || !preview}
          onClick={() => void run('mapping')}
        >
          매핑 저장
        </Button>
      </div>
      {preview && (
        <div>
          {preview.items.map((i) => (
            <p key={i.issueId}>
              #{i.issueNumber} → {i.status} {i.statusReason} {itemError(i.errorCode)}
            </p>
          ))}
          <Button
            disabled={busy || !preview.nextAfterIssueId}
            onClick={() => void run('preview', preview.nextAfterIssueId!)}
          >
            매핑 미리보기 다음
          </Button>
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
