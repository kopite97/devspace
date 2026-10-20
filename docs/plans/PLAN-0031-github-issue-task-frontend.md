# Plan: GitHub 계정·저장소 연결과 Issue–Task 프론트엔드

작성일: 2026-10-20  
상태: `completed` — 2026-10-20 구현과 필수 로컬 검증 완료. 추가 실제 통합·공개 Webhook은 아래 인계 범위로 남긴다.

## Goal

계정·프로젝트별 저장소 연결, Issue 가져오기, Task·보드 연동, 설정·오류·연결 정리를
현재 백엔드 계약으로 구현한다. 기존 일반 Task 동작과 세션 격리를 유지하고 로컬
백엔드로 가능한 검증을 수행한다. 실제 Webhook 전달·복구는 공개 HTTPS 배포 후 남긴다.

기준 문서:

- [프론트 요구사항](../requirements/github-issue-task-frontend-requirements.md)
- [백엔드 API·DTO·오류 계약](../../../devspace-back/docs/requirements/frontend/github-app-issue-task-integration.md)
- [백엔드 PLAN-0017](../../../devspace-back/docs/plans/PLAN-0017-github-app-issue-task-integration.md)
- [최신 실제 검증 기록](../../../devspace-back/docs/reviews/plan0017/live-manual-validation.md)
- [자동 검증 기록](../../../devspace-back/docs/reviews/plan0017/implementation-validation.md)
- [App 설정](../../../devspace-back/docs/operations/github-app-setup.md)
- [쿼리 정책](../guides/query-policy.md)

### 조사 기준선

- 최신 2026-10-20 기록은 로컬 OAuth·개인 설치·저장소·선택 가져오기,
  수동 동기화 닫기/재개방·세 상태 매핑, 중지/재개·revision 충돌·baseline 처리 확인이다.
  백엔드 전체 365개와 집중 56개 테스트는 중복이 있어 합산하지 않는다.
- 조건 전환의 실제 자동 생성, 중지 중 원격 변경, 조직·철회·해제·복구와 공개 Webhook은
  미검증이다. 과거 백엔드 검증을 새 프론트의 통과 근거로 대신하지 않는다.
- 로컬 마지막 revision=6, enabled=false, paused=false는 관측값이다.
  시작 시 account/repositories/import-settings/sync-status를 재조회하고 하드코딩하지 않는다.
  공개 환경은 계정 disconnected·조회 프로젝트 연결 없음이 마지막 관측이다.
- `ApiTask`/presentation에 source가 없고 Task 목록/stats 파서도
  externalDataUnavailable을 전달하지 않는다. `HttpError`에는 Retry-After가 없다.
- 인증된 실제 조합은 `PrivateWorkspace`와 `ServerProjectsPage`의 render 슬롯이다.
  legacy `PageRouter`/`ProjectDetailPage`만 수정해서 완료로 간주하지 않는다.
- QueryManager와 쿼리 검사는 구현되어 있다. `source.md`의 PLAN-0022 미구현 설명은
  현 코드·상세 가이드와 다르므로 현 구현을 사용한다. 계획 작성 중 지침은 변경하지 않는다.

## Scope

- In scope:
  - 계정 메뉴 진입, 연결·재인증·교체와 `/github/connection-result`.
  - 프로젝트별 다중 저장소·설치 선택, Issue 필터·미리보기·가져오기·작업 관찰.
  - 자동 가져오기·라벨 매핑·중지/재개·수동 동기화·오래된 Issue 조회.
  - Task source·편집 제한·사유 필터, 보드/overview/기존 위젯/휴지통 표시.
  - Task 전환·저장소 convert/purge·부분 해제 재개·계정 정리.
  - 보호 캐시·세션·오류 처리, 모의 및 로컬 실제 검증, 통합 인계 기록.

- Out of scope:
  - 기존 일반 Task에 Issue 연결, GitHub 쓰기, PR/Commit/Actions/Projects, SSE,
    신규 GitHub 위젯, 일지·문서·마일스톤 연동.
  - 임의 백엔드 API 추가, 공개 Swagger 활성화, 프론트의 GitHub 직접 호출.
  - 이번 구현 단계의 운영 배포·App 권한/구독 변경·Webhook 활성화,
    실제 사용자 데이터 파괴 시험, 로컬용 터널·공개 수신 인프라 추가.
  - 백엔드 PLAN-0017 자동 완료 처리와 무관한 기존 PLAN 상태 변경.

## Changes

### 1. 계약 대조와 공통 기반

1. 승인 후 로컬 인증 세션의 `/v3/api-docs`를 상세 계약과 대조한다.
   브라우저 27개 operation의 메서드·성공 상태·nullable DTO·revision·요청별
   Idempotency-Key와 Task/overview/widget 확장 필드를 확인한다.
   현재 계획 작성은 문서·소스 조사이며 실행 서버 OpenAPI 확인 완료를 주장하지 않는다.
   불일치는 영향 기능과 보완 필요 사항으로 기록하고 추측 구현하지 않는다.
2. `src/features/github/`에 모델/파서·저장소·작업 관찰·기능 UI를 둔다.
   app은 기존 transport·QueryManager 주입과 기능 간 변경 콜백을 담당하고 pages는
   조합만 한다. GitHub 업무 규칙을 shared에 넣거나 기능 간 직접 의존을 늘리지 않는다.
3. 조회 키에는 리소스, projectId/linkId/installationId/jobId, 모든 응답 결정 필터·limit·
   페이지 표현을 넣는다. 초기 정책은 freshForMs=0, gcAfterMs=60000,
   revalidateOnFocus=true로 명시하며 보호 데이터는 세션 메모리에만 둔다.
   미리보기 POST는 CSRF를 적용하며 GET 캐시로 취급하지 않는다.
   이 정책은 신규 GitHub 조회에 적용하며 기존 Task/overview/dashboard의 명시적
   legacy 예외를 이 계획에서 전면 이관하지 않는다. 변경 조회는 기존 예외 범위를
   확인하고 새 직접 Query 생성 예외를 추가하지 않는다.
   포커스 재조회 결과와 미저장 설정 draft를 분리한다. 서버 revision이 바뀌면
   변경 내용을 덮어쓰거나 자동 저장하지 않고 비교·재적용 동선을 제공한다.
4. HTTP 오류에 Retry-After를 보존하고 유효한 초/HTTP-date를 처리한다.
   헤더가 없으면 값을 추정하지 않는다. same-origin·redirect:error·CSRF·세션 세대 검증을 유지한다.

### 2. 계정·저장소 연결

1. 계정 설정에서 상태 4종과 연결/재인증/정리 동선을 제공한다.
   결과 경로를 인증 라우팅·직접 접근·새로고침에 연결하고 `safeReturnTo`에 정확한 내부
   경로와 허용된 github 결과값만 추가한다. 쿼리 대신 account 재조회로 성공을 확정한다.
2. authorizationUrl/설치 URL은 scheme·host 검증 후 브라우저로 이동한다.
   callback을 fetch하거나 code/state를 보관·재사용하지 않는다. 만료·재사용·로그인 만료는
   연결 시작부터 재개한다. callback 400 JSON의 한계를 별도로 안내한다.
3. `ServerProjectsPage`에 GitHub 관리 슬롯을 추가하고 설치→접근 가능한 저장소 선택→
   연결→초기 수집 상태를 표시한다. repositoryUrl은 단순 링크로 유지한다.
   설치/저장소 page·limit·nextPage와 프로젝트 연결 배열·상한 100을 구분한다.
4. 연결 상태 5종, 접근 상태 4종, 사용자 paused·프로젝트 archived를 따로 표시한다.
   null 이름/URL에 이전 private 값을 채우지 않는다. 설치 목록이 비면 설치/조직 승인
   확인을 안내하되 approval_pending을 만들지 않는다. 설치 복귀 후 관련 API를 재조회한다.
   계정 교체는 연결 정리→기존 계정 해제→새 동의 순서다.
5. 계정 설정은 `/github`로 두고 내부 로그인 복귀 허용 목록에 함께 등록한다.
   프로젝트 관리 UI는 기존 프로젝트 상세 안에 조합한다.
   결과 화면은 SPA가 처리하며 백엔드 임시 결과 HTML 프록시와 혼용하지 않는다.
   미저장 설정의 이동/뒤로 가기 보호는 기존 navigation guard에 연결하되,
   제출된 서버 job은 화면 이동 후에도 계속 실행됨을 구분해 안내한다.

### 3. Issue 조회·가져오기·작업 복구

1. open/closed, 라벨 ID ALL·담당자 ID ANY(그룹 간 AND), 각 조건 최대 20개와
   limit 1~100을 지원한다. 필터 변경 시 cursor·선택·미리보기를 초기화한다.
   담당자는 **numeric ID 직접 입력**을 기본 범위로 제안한다.
   수집된 ID를 전체 담당자 목록이라고 표현하거나 login 문자열을 ID로 보내지 않는다.
2. 초기 수집 범위는 open과 최근 90일 갱신 closed로 안내한다.
   Issue/라벨 nextCursor, 미리보기 nextAfterIssueId→afterIssueId, 설치 nextPage를
   혼용하지 않는다. 가져오기는 numeric ID, 오래된 Issue 조회는 표시 번호를 사용한다.
3. 최대 100개 선택→미리보기→명시적 가져오기를 구현한다.
   matches=false/excluded=true만으로 차단하지 않고 errorCode·접근·중지·보관을 구분한다.
   제외 원본의 재가져오기는 새 Task이며 기존 일반 사본과 합쳐지지 않음을 안내한다.
4. 202 이후 jobId로 queued/running/completed/failed/partial과 항목별 결과를 관찰한다.
   휴지통 복원·길이 초과·최신성 대기를 구분한다. 부분 실패는 실패 항목만 미리보기 후
   최신 revision·새 key로 요청한다. queued 상한 10과 최대 15분 최신성 대기를 안내한다.
5. timeout 복구는 24시간 내 동일 key/body를 재사용한다. 세션 메모리의 요청 정보는
   세션 종료 시 폐기한다. 새로고침 등으로 정보를 잃으면 상태·미리보기 확인 후
   사용자의 새 의도로 요청한다. body revision 변경 시 이전 key를 쓰지 않는다.
6. 화면이 보일 때 3초 간격으로 겹치지 않게 polling하고 숨김/이탈/종결 시 중지한다.
   rate limit은 Retry-After를 우선한다. 알려진 jobId를 관찰하며 latestJob 교체나
   stage/page로 작업 완료를 판단하지 않는다. 복귀 시 jobId·sync-status를 다시 읽는다.
   취소·전체 작업 이력 API를 가정하지 않고 화면 종료가 서버 취소가 아님을 알린다.
   같은 jobId를 여러 소비자가 열어도 관찰 요청은 공유한다. 포커스 조회와 polling이
   중복 실행되지 않게 한다. 429나 일시 장애 시 3초 자동 반복을 멈추고
   Retry-After 이전 재요청을 막으며 헤더가 없으면 명시적 재시도 동선을 제공한다.
   최초 수집·baseline·매핑처럼 mutation이 jobId를 반환하지 않는 흐름은 sync-status의
   작업 종류·관측 시각과 후속 설정·Task 재조회로 확인한다. job 응답에 없는 설정
   revision/generation 상관관계를 합성하지 않는다. latestJob 하나로
   특정 저장의 완료를 확정할 수 없으면 최신 관측 상태만 표시한다.
7. 수동 재동기화·오래된 Issue 조회의 저장소별 공통 60초 cooldown을 처리한다.

### 4. Task·보드·통계와 접근 보호

1. Task 모델/파서→presentation→editor/manager→TaskBoard/상태 액션,
   dashboard 모델→`WidgetDataContent`까지 source를 보존한다.
   저장소/번호·안전한 원문 링크·GitHub 관리·반영 시각·중지·충돌·내용 오류를 표시한다.
2. 제목/본문/상태/프로젝트 이동·드래그·완료를 UI와 mutation 경계에서 차단한다.
   PATCH는 revision과 변경한 priority/tag만 보낸다. 일반 Task 기존 동작을 유지한다.
   길이 초과 시 마지막 정상 내용임을 알리고 임의 절단·상태 재계산을 하지 않는다.
   제목 160/본문 10,000 UTF-16 단위의 경계·초과·이모지와 정상 복귀를 시험한다.
3. 목록/stats에 같은 sourceReason을 적용한다. externalDataUnavailable은
   목록/stats/overview 최상위, 보드 위젯 data.statistics, overview 위젯 data.tasks에서 읽는다.
   정상 빈 결과와 부분 제외를 구분하고 숨겨진 개수나 not_planned 완료 수를 임의 보정하지 않는다.
   sourceReason은 허용된 5개 값만 사용하고 목록/stats의 조회 키에도 포함한다.
   stats에는 기존 계약대로 status/deleted를 보내지 않는다. 해당 필터를 URL로 보존하면
   로그인 복귀에서도 검증된 값만 유지한다.
4. 접근 pending/상실·상세 404·scope 변경 시 Issue/선택/미리보기/Task entity/detail/list,
   편집 메모리·overview/widget/trash의 보호 데이터를 제거하거나 가린다.
   invalidate만으로 이전 data가 남지 않게 하고 요청 취소·세대 검증으로 지연 응답
   재삽입을 막는다. 일반 Task를 불필요하게 제거하지 않는다.
   externalDataUnavailable만으로 어느 link가 제외됐는지 추정하지 않는다.
   최신 응답에 없는 이전 GitHub entity를 병합하지 않고, 범위가 불명확하면 해당
   결과 범위의 보호 snapshot을 비운 뒤 재조회한다. active 편집기와 홈 Task 편집 메모리도
   동일하게 가린다. 서버의 접근 grant가 남은 동안 즉각적인 철회 탐지를 보장하지 않는다.
5. 작업 완료·화면 진입·포커스 복귀·수동 갱신에 Task/통계/overview/widget를 재조회한다.
   같은 Task revision의 source 관측 갱신도 수용한다. Task/설정/workspace/layout revision을
   구분하고 GitHub에 없는 workspace header나 layoutRevision 증가를 합성하지 않는다.
6. 안전한 Markdown 표시·외부 링크 검증을 적용하고 raw HTML을 실행하지 않는다.
   기존 수단을 조사한 뒤 필요한 경우에만 의존성을 추가한다.
   로그에 비밀·private 원문을 남기지 않는다. 로그아웃/만료/사용자 전환 시
   polling·요청·편집·작업 참조를 폐기하며 탭 알림에는 변경 힌트만 담는다.

### 5. 설정·수명주기·오류

1. 자동 가져오기 기본 off, 빈 조건=모든 Issue를 저장 전에 알린다.
   중첩 응답과 평탄한 PUT을 구분하고 변경 없는 저장을 막는다.
   활성화/재개 진행 중에만 baselineReady=false를 준비 중으로 표시한다.
   off/paused에서 무한 로딩하지 않고 baseline·수집 시각·수집/Task 작업·최종 반영을 구분한다.
2. 매핑 라벨 ID 중복을 막고 done=null 해제를 지원한다. 영향 미리보기 후 저장하고
   비동기 재계산을 확인한다. 기존 일치 Issue는 명시적 선택을 안내한다.
   not_planned/unknown_closure/mapping_conflict/mapping_error는 서버 결과·사유를 표시한다.
3. 중지와 archive/reactivate를 구분하고 사용자 paused를 임의 해제하지 않는다.
   soft delete/restore는 기존 API를 사용하며 복원 응답을 최신 원문 반영 완료로 표시하지 않는다.
4. 일반 Task 전환·저장소 convert·purge를 구분한다. purge는 대상·복원 불가를 명시적으로
   확인한다. 50개 단위 해제 진행·부분 완료·현재 revision 재개를 지원한다.
   해제 job은 metadata만 사용하며 import items나 전체 영향 수를 추정하지 않는다.
   일반 사본은 purge 대상이 아니며 접근 상실 시에도 소유자 정리 경로를 유지한다.
   DELETE 202 접수 또는 disconnecting 관측 즉시 해당 연결의 보호 Task와 원문 캐시를
   가리고 재조회한다. 종결까지 옛 내용을 유지하지 않는다. timeout은 해제 취소가
   아니므로 연결·sync-status를 먼저 확인한다.
   DELETE의 revision/disposition query와 cleanup-requests의 평탄한 JSON 요청을 구분한다.
   이 요청들은 가져오기와 달리 Idempotency-Key replay 계약이 없으므로 동일 key로
   복구된다고 가정하지 않는다.
   재연결은 같은 linkId를 재사용할 수 있으므로 로컬 연결 세대를 교체하고 이전 요청·
   설정 draft·Issue cursor·job 참조를 폐기한다. 서버의 제외 기록은 유지됨을 안내한다.
5. code 기반으로 서비스 401, GitHub 재인증, CSRF, REVISION_CONFLICT, scope 변경,
   GITHUB_REFRESH_IN_PROGRESS, PROJECT_ARCHIVED, GITHUB_ACCOUNT_IN_USE,
   rate limit/queue/link 상한과 외부 장애를 구분한다.
   409 일괄 재전송·GitHub 갱신 중 서비스 로그아웃을 하지 않고 일반 Task를 계속 제공한다.
   paused는 Task 반영/가져오기 제한이며 원문 수집·접근 철회 처리는 계속된다.
   수동 수집 버튼을 paused만으로 막지 않는다. 일반 전환은 마지막 정상 내용 보존과
   자동 재생성 제외를 알리고, 권한 없는 원문을 복구하는 수단으로 안내하지 않는다.

### 6. 계약 보완 및 인계

| 현재 계약 한계                     | 이번 구현                            | 별도 보완 필요                           |
| ---------------------------------- | ------------------------------------ | ---------------------------------------- |
| 담당자 이름 검색·login↔ID API 없음 | numeric ID 입력·검증                 | 이름/아바타 검색 UX용 조회 계약          |
| 일부 callback 오류는 400 JSON 종료 | 설정에서 새 연결 시작·한계 안내      | 모든 실패의 안전한 결과 화면 복귀        |
| 해제 영향 미리보기 없음            | 의미·복원 불가 확인과 관측 진행 표시 | 사전 영향 목록/개수가 필요하면 계약 추가 |
| 작업 취소·전체 이력 없음           | 알려진 jobId·최신 sync-status 관찰   | 해당 기능이 필요하면 별도 계약           |

실행 때 `docs/reviews/plan0031-github-issue-task-frontend/validation.md`에 환경/origin/
백엔드 버전, 기대·실제 결과, HTTP/code/jobId/최종 상태, 모의·로컬 실제·배포 후 구분,
미실행 사유·설정 복원 여부를 기록한다. 비밀·쿠키·OAuth code/state·private 본문은 제외한다.
계약 불일치와 보완 요청을 기능별 영향과 함께 누적한다.

## Validation

### Static

- 계획 작성: 상태/템플릿/상대 링크 확인, `npm run check:docs`, `git diff --check`.
  런타임 코드 변경이 없어 이 단계에서는 앱 테스트·빌드를 실행하지 않는다.
- 구현: `npm test`, `npm run check:boundaries`, `npm run check:queries`,
  `npm run build`, `npm run check:docs`, 변경 파일 format 검사.
  전체 문서 검사의 기존 PLAN-0006~0008 `../../../backend/` 링크 실패는 기준선으로
  분리 기록한다. 이번 변경 문서 링크는 모두 통과해야 하며 새 실패를 허용하지 않는다.
- DTO/nullability·평탄한 요청·source 전달·허용 PATCH·세 종류 페이지네이션·선택 제한,
  같은 key 복구/새 key 재시도·Retry-After·URL/returnTo·같은 revision 갱신·지연 응답
  차단을 단위 검증한다.

### Runtime

새 GitHub Playwright 구성을 인증된 앱에 연결한다. 기본 Playwright 설정은 legacy이므로
그 결과만 수용 검증으로 삼지 않는다. 기존 auth/tasks/projects/dashboard/shell 설정의
영향받는 회귀를 실행하며 모의 응답과 실제 백엔드 결과를 구분한다.

| 묶음        | 필수 시나리오와 기대 결과                                                                                         |
| ----------- | ----------------------------------------------------------------------------------------------------------------- |
| 계정·라우팅 | 성공/취소/실패/계정 충돌/재인증, 직접 접근·새로고침·로그인 복귀, state 만료/재사용 한계                           |
| 설치·저장소 | 개인/조직·빈 목록·다중 연결·초기 수집/실패, 페이지 이동, 접근 pending/denied와 null 이름 비노출                   |
| Issue·작업  | 필터 cursor 초기화·preview seek·최대 선택, matches/excluded 예외, 202/중복/timeout/부분 실패만 재시도             |
| Task·집계   | 원본 편집/드래그 차단·허용 PATCH, 사유 필터, overview/widget/trash 부분 데이터, 일반 Task 회귀                    |
| 설정        | 빈 조건·중복 저장 방지, baseline 기존 일치 미생성, 후속 자동 생성, 매핑/충돌/not_planned/라벨 삭제/내용 초과·복구 |
| 수명주기    | 중지 중 변경·재개, archive/reactivate와 paused 독립, 복원·전환·convert/purge·부분 해제 재개                       |
| 접근·세션   | 철회/404/scope 변경 후 보호 캐시·cursor 제거, 지연 응답 차단, 같은 revision 갱신, 만료/사용자 전환 격리           |
| 화면        | 기존 스타일, 키보드/포커스·오류 안내, 좁은 화면·데스크톱, Markdown/외부 링크 안전성                               |

위 표는 모두 모의 응답으로 검증할 필수 프론트 수용 기준이다. 실제 환경 시험의 성공 여부는
별도로 기록한다. 추가로 다음 경합을 검증한다: 미저장 설정 중 포커스/revision 변경,
두 화면의 같은 job 관찰, 429 후 반복 차단, 해제 접수 직후 보호 내용 제거,
같은 linkId 재연결 후 옛 응답 도착, 서로 다른 프로젝트의 같은 저장소 연결 격리.

#### 로컬 실제 백엔드

- 기존 DB를 초기화하지 않고 서버/세션/App 상태를 재확인한다.
  격리된 시험 프로젝트·저장소를 사용하며 파괴적 시험은 폐기 가능한 대상·범위를 확인한다.
- 프론트 origin·APP_ORIGIN·로그인 redirect·GitHub callback/return·Vite 프록시를 맞춘다.
  localhost/127.0.0.1을 섞지 않고 8080 Swagger 성공을 Vite UI 성공으로 대신하지 않는다.
  인증된 OpenAPI 대조 후 프론트의 계정/저장소/가져오기/설정/중지·재개/복구를 확인한다.
- nginx 산출물에서도 SPA 결과 경로·API 프록시를 확인한다. 보안 보호를 끄지 않는다.
- 허용된 격리 원격 변경은 수동 재동기화로 확인한다. 조건 전환 자동 생성과 중지 중
  변경을 포함하되 접근/환경/승인 차단 시 우회하지 않고 미완료 실제 시나리오로 기록한다.
- 시험 후 enabled/paused/조건/매핑은 원래 의미로 복원하며 revision을 되돌리지 않는다.

로컬 필수 흐름은 인증된 계약 확인, 실제 프론트 origin의 계정·저장소 조회,
선택 가져오기→작업 종결→Task/집계 갱신, 허용 필드 수정, 설정 저장·중지/재개다.
이 흐름의 실패나 미실행을 단순히 기록했다는 이유로 완료 처리하지 않는다.
환경 차단으로 수행할 수 없다면 해당 완료 조건을 미체크로 유지하고 차단 원인을 인계한다.
조직 계정·철회·원격 변경·파괴적 대량 시험처럼 별도 시험 자원이 필요한 실제 시나리오는
모의 수용 기준을 충족한 뒤 자원 부족의 근거·남은 범위·재개 조건을 명시해 후속 항목으로 둔다.

#### 공개 HTTPS 배포 후 — 이번 로컬 완료 조건에서 제외

- [ ] 배포 origin의 OAuth·CSRF·Secure 쿠키·Host/Proto·callback/return/nginx 확인.
- [ ] 공개 백엔드 `/api/integrations/github/webhooks`, secret 일치·구독·명시적 활성화·worker 확인.
- [ ] 배포 DB/세션에서 격리 계정·저장소 연결을 확인하고 실제 GitHub 이벤트 전달.
- [ ] 실제 서명 검증·접수 202·job 종결·배포 DB Task·프론트 재조회 결과 일치 확인.
- [ ] 중단/실패 전달 복구를 이벤트/job 식별자와 확인. 수동 sync를 섞어 원인을 혼동하지 않음.
- [ ] 남은 조직·철회·재인증 등 실제 통합 항목 실행 및 백엔드 인계.

배포 전에는 체크하지 않는다. 로컬 sync나 모의 서명 시험은 실제 전달 성공이 아니다.
프론트 구현 완료와 전체 실환경 통합 완료를 구분하고 백엔드 PLAN-0017은 별도 사용자 요청과
충분한 근거 없이 갱신하지 않는다.

## Completion Criteria

- [x] 계정·저장소·Issue·Task·설정·수명주기 UI와 오류 처리가 구현된다.
- [x] 필수 정적 검사와 영향받는 모의 브라우저 수용·회귀 검증이 통과한다.
- [x] 위에 명시한 로컬 필수 흐름이 통과하고 추가 실제 시험의 성공/실패/차단 범위가 근거와 함께 기록된다.
- [x] 접근 상실·세션 전환·지연 응답·일반 Task 회귀에 해결되지 않은 구현 결함이 없다.
- [x] 구현 결과·API 보완 사항·남은 실제 통합 검증·배포 후 Webhook 체크리스트를 인계한다.
- [x] 미실행 실제 검증을 통과로 기록하지 않고 필수 구현 검증 실패가 있으면 completed로 바꾸지 않는다.
- [x] 관련 문서와 계획 레지스트리를 실제 진행 상태에 맞게 갱신한다.

## 실행 결과

2026-10-20 단위 261개, GitHub 브라우저 37개와 영향받는 현재 회귀 검증이 통과했다.
빌드·경계·쿼리 검사와 격리 실제 Vite/Nginx 세션·프록시 검증을 통과했다.
IDE 백엔드와 실제 연결한 프론트에서 계약 확인, 저장소 연결, 선택 가져오기와 작업 종결,
Task/집계 갱신, 허용 필드 수정, 설정 저장·중지/재개를 확인했다.
설정은 원래 의미로 복원했고 시험 프로젝트의 자동 가져오기는 꺼 두었다.

구체적인 환경·결과·증거와 기존 테스트/문서 기준선은
[검증 기록](../reviews/plan0031-github-issue-task-frontend/validation.md)에 정리했다.
실제 Google callback의 프론트 origin 직접 복귀, 조직·철회·원격 변경·파괴적 대량 시험과
공개 HTTPS Webhook은 해당 기록의 재개 조건에 따라 후속 검증한다.
이 완료 상태는 프론트 구현과 필수 로컬 검증 범위이며 백엔드 PLAN-0017 상태는 변경하지 않았다.
