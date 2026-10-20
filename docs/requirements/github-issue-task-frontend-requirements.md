# GitHub App·Issue–Task 프론트엔드 구현 요구사항

작성일: 2026-10-20  
상태: 프론트 구현용 요구사항. 백엔드 PLAN-0017은 active이며 실제 통합 검증이 일부 남아 있다.

프론트 구현·로컬 검증의 현재 결과와 남은 실제 시험은
[PLAN-0031 검증 기록](../reviews/plan0031-github-issue-task-frontend/validation.md)을 참조한다.
아래 코드 조사 내용은 요구사항 작성 시점의 기준선이다.

## 1. 목적과 계약 기준

GitHub Issue를 프로젝트의 Task 보드에서 관리하도록 기존 프론트를 확장한다.
현재 백엔드 API로 프론트 구현을 시작할 수 있다. 프론트 구현 후 실제 사용 흐름에서
남은 통합 검증을 수행한다. 이 문서는 프론트 구현·배포·통합 검증 완료 기록이 아니다.

- [백엔드 상세 API·DTO·오류 계약](../../../devspace-back/docs/requirements/frontend/github-app-issue-task-integration.md): 구현 시 필수 참조.
- [백엔드 PLAN-0017](../../../devspace-back/docs/plans/PLAN-0017-github-app-issue-task-integration.md): 승인 범위와 완료 조건.
- [최신 실제 검증 기록](../../../devspace-back/docs/reviews/plan0017/live-manual-validation.md): 2026-10-20 로컬 후속 검증까지 확인.
- [자동 검증 기록](../../../devspace-back/docs/reviews/plan0017/implementation-validation.md), [App 설정](../../../devspace-back/docs/operations/github-app-setup.md).

위 링크는 두 저장소가 같은 상위 디렉터리에 있는 현재 배치를 기준으로 한다.
다른 환경에서는 `devspace-back/docs/requirements/frontend/github-app-issue-task-integration.md`를 함께 확보한다.
상세 DTO 전체를 이 문서에 복제하지 않는다. 실제 백엔드 OpenAPI와 위 계약을 대조하고,
불일치는 백엔드에 확인한다. 프론트에서 임의 endpoint나 상태 값을 만들지 않는다.

배포 환경의 Swagger 비활성화는 의도된 설정이다. 개발 편의를 위해 공개하지 않는다.
로컬의 인증된 `/swagger-ui/index.html`, `/v3/api-docs`를 사용한다.

## 2. 구현 범위와 권장 순서

| 순서 | 구현 대상              | 완료할 사용자 흐름                                                    |
| ---- | ---------------------- | --------------------------------------------------------------------- |
| 1    | 계정 연결과 결과 화면  | 서비스 로그인 → GitHub 동의 → 결과 복귀 → 실제 계정 상태 재조회       |
| 2    | 프로젝트별 다중 저장소 | 설치·저장소 선택 → 연결 → 초기 수집·권한 상태 표시                    |
| 3    | Issue 조회·가져오기    | 필터·페이지 이동 → 선택·미리보기 → 가져오기 → 항목별 결과 → Task 표시 |
| 4    | 기존 Task 화면 연동    | 원본 관리 배지·수정 제한·원문 이동·오류 표시·통계 갱신                |
| 5    | 연결별 설정과 수명주기 | 상태 매핑·자동 가져오기·중지/재개·재동기화·일반 Task 전환·연결 해제   |
| 6    | 실제 통합 검증         | 원격 변경·권한 철회·Webhook·실패 복구까지 검증하고 근거 기록          |

계정당 활성 GitHub 계정은 하나, 프로젝트당 저장소는 여러 개다.
같은 저장소를 다른 프로젝트에도 연결할 수 있으며 각 프로젝트의 Task는 별개다.
기존 `Project.repositoryUrl`은 단순 링크이므로 인증된 저장소 연결로 취급하지 않는다.

이번 범위 밖: 기존 일반 Task에 Issue 붙이기, GitHub Issue/라벨 생성·수정 API,
드래그 결과의 GitHub 반영, PR·Commit·Actions·GitHub Projects, 새 GitHub 전용 위젯,
개발일지·문서·마일스톤 연동, SSE. 프론트에서 GitHub API를 직접 호출하지 않는다.

## 3. 현재 프론트에서 확인할 변경 지점

실제 구현 전 각 경로의 지침과 최신 코드를 다시 읽는다. 아래는 조사 시작점이며 새 구조를 강제하지 않는다.

| 기존 경로                                                                                   | 필요한 변경                                                                   |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/shared/http/client.ts`                                                                 | 기존 세션·CSRF·오류 처리 재사용, GitHub 요청별 idempotency/revision 계약 반영 |
| `src/app/routes.ts`, `src/app/PageRouter.tsx`                                               | GitHub 결과 화면의 직접 접근·새로고침·로그인 복귀 처리                        |
| `src/app/layouts/AccountMenu.tsx`                                                           | 계정 연결 상태와 설정 진입점 검토                                             |
| `src/pages/ProjectDetailPage.tsx`, `src/features/projects/ProjectDetailLayout.tsx`          | 연결 저장소 목록·관리·Issue 가져오기 진입점                                   |
| `src/features/tasks/apiModel.ts`, `apiStore.ts`                                             | `source`, `externalDataUnavailable`, 사유 필터와 캐시 처리                    |
| `src/features/tasks/ApiTaskEditor.tsx`, `ApiTaskManager.tsx` 및 presentation 모델           | 원본 관리 필드의 편집·드래그·완료·이동 제한, priority/tag 수정                |
| `src/features/overview/`, `src/features/dashboard/`, `src/pages/home/WidgetDataContent.tsx` | 부분 데이터 안내와 Task 원본 메타데이터 유지·갱신                             |
| `src/app/auth/`의 Task/project/dashboard handoff                                            | 세션·화면 전환 시 새 메타데이터와 권한 변경 전파 확인                         |

현재 `ApiTask`/`parseTask`에는 `source`가 없고 Task presentation으로도 전달하지 않는다.
API 타입만 추가하고 중간 변환에서 원본 정보를 잃는 일이 없도록 전체 경로를 확인한다.
기존 구조·스타일·HTTP 계층을 사용하고 새 의존성 필요 여부는 별도로 검토한다.

현재 구현에서 특히 주의할 사항:

- `src/app/auth/routeIntent.ts`의 `safeReturnTo`는 GitHub 결과 경로와 `github` 쿼리를
  허용하지 않는다. 라우터만 추가하지 말고 안전한 로그인 복귀 경로·허용 쿼리도 함께 다룬다.
  임의 외부 URL을 허용하는 방식으로 제한을 풀지 않는다.
- `src/shared/http/client.ts`는 same-origin API 요청과 `redirect: 'error'`를 사용한다.
  연결 시작 JSON 응답은 이 계층으로 받고, `authorizationUrl`은 검증 후 브라우저 탐색으로
  이동한다. GitHub callback을 이 JSON 클라이언트로 fetch하지 않는다.
- 현재 `HttpError`에는 `Retry-After`가 보존되지 않는다. 헤더 기반 재시도를 구현하려면
  HTTP 계층의 오류 메타데이터 전달도 보완해야 한다. 헤더가 없으면 값을 추정하지 않는다.
- `src/shared/http/query.ts`는 로딩·오류 시 기존 data를 유지하고 기본 invalidate도
  데이터를 지우지 않는다. 접근 상실·범위 변경 시 단순 invalidate만으로 끝내지 말고
  Task entity/detail/list, Issue 미리보기·선택, 위젯 등 해당 보호 데이터와 늦은 응답을 정리한다.
  일반 Task까지 불필요하게 비우지 않으면서 이전 private 원문이 재등장하지 않게 검증한다.

## 4. 로그인·callback·배포 경로

1. 기존 서비스 로그인 세션을 확보한다. GitHub 계정 연결은 서비스 로그인과 별개다.
2. `POST /api/v2/integrations/github/authorization-requests`의 `authorizationUrl`로 이동한다.
3. GitHub callback은 백엔드가 처리한다. 프론트에서 code/state를 교환·저장·재사용하지 않는다.
4. 백엔드 `GITHUB_FRONTEND_RETURN_URL`의 프론트 결과 경로를 구현한다.
   현재 공개 설정의 `/github/connection-result`를 프론트 라우트로 구현하거나,
   다른 경로를 선택하면 백엔드 설정과 함께 맞춘다.
5. `?github=connected|denied|account_conflict|failed`를 읽고 account API를 재조회한다.
   쿼리만으로 성공 처리하지 않는다. 취소·만료·새로고침·로그인 만료·재인증도 처리한다.

연결 시작 URL은 10분 유효한 일회성 state를 포함한다. 만료·재로그인·이미 사용한 callback은
기존 URL을 재시도하지 않고 현재 서비스 세션에서 연결 시작부터 다시 수행한다.
현재 백엔드는 모든 callback 오류를 결과 화면으로 redirect하지 않는다.
`GITHUB_INVALID_STATE` 등은 callback 주소에서 400 JSON으로 끝날 수 있다.
프론트 결과 화면만으로 모든 OAuth 오류를 처리했다고 기록하지 않는다.
설정 화면에 연결 재시작 경로를 제공하고, 모든 실패를 프론트로 복귀시키는 UX가 필요하면
백엔드 보완 항목으로 분리한다.

설치 화면으로 이동한 경우에도 복귀 시 account·installations·repositories를 다시 조회한다.
App 설치와 사용자 계정 동의는 별개이므로 설치 완료를 계정 연결 성공으로 간주하지 않는다.

현재 공개 nginx와 Vite는 `/api`, `/oauth2`를 프록시한다.
프론트 결과 화면을 구현하면 SPA 라우트에서 처리하며, 백엔드 임시 HTML 페이지를
사용할 때만 그 정확한 경로의 프록시가 필요하다. 두 방식을 혼용하지 않는다.

로컬 검증 시 `localhost`와 `127.0.0.1`을 섞지 않는다. 프론트 origin, 백엔드 `APP_ORIGIN`,
서비스 로그인 redirect URI, GitHub callback, return URL과 프록시를 실제 구성에 맞춘다.
8080 직접 로그인 성공이 Vite origin에서의 OAuth 성공을 증명하지는 않는다.
공개 환경과 로컬 환경은 DB·세션·GitHub 연결 상태가 다르다.
GitHub App 등록 callback과 백엔드 callback 설정을 함께 대조하고 로컬 설정으로
공개 환경의 callback을 덮어쓰지 않는다. 공개 HTTPS에서는 Secure 세션 쿠키와 전달된
Host/Proto가 맞는지 확인한다. CSRF/CORS/쿠키 보호를 끄는 방식으로 환경 문제를 해결하지 않는다.

### 로컬 개발과 배포 후 Webhook 검증 분리

GitHub 서버는 개발 PC의 `127.0.0.1`/`localhost`로 Webhook을 전달할 수 없다.
브라우저가 돌아오는 OAuth callback과 GitHub 서버가 호출하는 Webhook URL을 구분한다.
이번 작업에서는 실제 Webhook 전달·복구 검증을 **공개 HTTPS 환경에 배포한 후** 수행한다.
로컬 개발을 위해 터널이나 별도 공개 수신 인프라를 추가하지 않는다.

| 단계                         | 진행할 검증                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| 로컬 프론트 + 로컬 백엔드/DB | 로그인·계정 연결·저장소 조회·가져오기·설정·중지/재개·오류 UI. 원격 변경은 수동 재동기화로 확인 |
| 프론트와 수신 백엔드 배포 후 | 실제 GitHub 이벤트 전달·서명 검증·Task 반영·실패 전달 복구와 배포 프론트의 재조회 결과 확인    |

배포 후에는 다음 조건을 먼저 확인한다.

- GitHub App의 Webhook URL은 공개 백엔드로 연결되는
  `https://<공개 호스트>/api/integrations/github/webhooks`다. 프론트 결과 화면 URL이 아니다.
- 수신 백엔드 배포·프록시 라우팅, App과 백엔드의 Webhook secret 일치,
  필요한 이벤트 구독과 명시적인 Webhook 활성화, 작업 worker 실행 상태를 확인한다.
  프론트 코드에 secret을 전달하지 않는다.
- 배포 서비스의 세션에서 GitHub 계정과 격리된 테스트 저장소를 연결한다.
  로컬 DB의 기존 연결이 배포 DB에도 있다고 가정하지 않는다.
- 테스트 이벤트가 수신된 배포 DB에서 작업·Task 결과를 확인한다.
  공개 Webhook을 배포 서버로 보내면서 로컬 DB의 Task 갱신을 기대하지 않는다.
- 수동 재동기화 성공이나 모의 Webhook 테스트를 실제 전달 성공으로 기록하지 않는다.
  배포 전에는 해당 체크리스트를 미완료로 남기며, 프론트 구현 자체는 계속 진행한다.
- GitHub 전달의 202는 수신 접수이며 Task 반영 완료가 아니다. 전달 결과·서버 작업 종료·
  실제 Task 상태·프론트 재조회까지 확인한다. Webhook 검증 중 수동 재동기화를 섞어
  반영 원인을 혼동하지 않는다. 복구 시험은 이벤트/작업 식별자와 기대 원본 상태를 함께 기록한다.

## 5. 화면별 동작

### 계정·설치·저장소

- 계정 상태 `not_configured/disconnected/connected/reauthorization_required`를 구분한다.
- 설치 목록이 비면 설치 링크와 조직 승인·선택 저장소 확인 안내를 제공한다.
  백엔드에 `approval_pending` 상태는 없으므로 임의로 승인 대기를 확정하지 않는다.
- 설치 ID만으로 연결 완료를 판단하지 않는다. 서버가 제공한 접근 가능 저장소를 선택한다.
- 설치·설치별 저장소 목록은 `page/limit/nextPage` 방식이다.
  프로젝트 연결 목록은 배열이며 cursor 방식이 아니다. 활성/해제 중 연결 상한은 프로젝트당 100개다.
- 저장소 상태 `initializing/ready/disconnecting/disconnected/failed`,
  접근 상태 `verified/check_pending/denied/reauthorization_required`,
  사용자 중지 `paused`와 프로젝트 보관을 각각 표시한다.
- 접근 미확인으로 이름/URL이 null이면 예전 private 이름·원문을 캐시에서 다시 보여주지 않는다.
- 계정 교체는 프로젝트 연결 정리 → 기존 계정 해제 → 새 사용자 동의 순서다.

### Issue 목록·선택 가져오기

- open/closed, 라벨·담당자 필터와 cursor 페이지네이션을 제공한다.
  라벨 조건은 ALL, 담당자는 ANY, 두 그룹은 AND다. 필터 변경 시 cursor를 버린다.
- Issue·라벨 목록은 `nextCursor`, 가져오기·매핑 미리보기는
  `nextAfterIssueId`를 다음 요청의 `afterIssueId`로 보내는 방식이다. 서로 혼용하지 않는다.
  목록/미리보기 limit은 1~100, 라벨·담당자 조건은 각각 최대 20개다.
- 초기 수집 범위는 모든 open Issue와 최근 90일 갱신된 closed Issue다.
  응답 total을 저장소 전체 역사적 Issue 수로 표현하지 않는다.
- Issue numeric ID와 표시 번호를 구분한다. 가져오기는 ID, 오래된 Issue 조회는 번호를 쓴다.
  PR은 대상이 아니다. 라벨 선택·매핑에는 이름이 아닌 ID를 사용한다.
- 선택 → 미리보기 → 명시적 가져오기 순서로 진행한다. 최대 100개 선택을 지킨다.
  미리보기는 예약이 아니므로 실제 작업 결과가 달라질 수 있다.
- 202는 접수 상태다. jobId로 완료·부분 성공·실패를 조회하고 항목별 원인과 재시도를 제공한다.
  휴지통 항목은 복원, 길이 초과 항목은 원문 수정 후 재시도 경로를 안내한다.
- 자동 가져오기 조건은 명시적 선택 가져오기의 필수 조건이 아니다.
  미리보기의 `matches=false`나 자동 제외 기록 `excluded=true`만으로 선택 가져오기를
  일괄 금지하지 않는다. `errorCode`와 현재 접근·중지·프로젝트 상태를 구분한다.
  제외된 원본을 명시적으로 다시 가져오면 새 Task이며 기존 일반 사본과 병합되지 않는다.
- 수동 재동기화와 오래된 Issue 조회는 저장소별 60초 cooldown을 공유한다.

담당자 선택 UI에는 현재 계약의 한계가 있다. API는 `assigneeIds` 조건과 Issue의 담당자
numeric ID 배열만 제공하고, 담당자 목록·이름 검색·login↔ID 변환 endpoint는 없다.
ID 기반 필터는 구현할 수 있지만 일반적인 이름/아바타 검색 선택기는 현재 계약만으로
완성할 수 없다. 수집된 ID 또는 직접 ID 입력으로 제공할지, 이름 검색용 백엔드 보완을
요청할지 구현 전에 정한다. 수집된 ID 집합을 전체 담당자 목록이라고 표시하거나
login 문자열을 ID로 전송하거나 프론트에서 GitHub API를 직접 호출하지 않는다.
이 제약은 계정 연결·라벨 기반 가져오기 등 나머지 구현을 막지 않는다.

### 자동 가져오기·상태 매핑

- 자동 가져오기는 기본 off이며 동기화 일시 중지와 다른 설정이다.
  빈 조건은 모든 Issue 일치임을 저장 전에 명확히 보여준다.
- 활성화·조건 변경·재개 시 기준 상태를 만든다. 자동 가져오기 활성화/재개가 진행 중일 때
  `baselineReady=false`를 준비 중으로 표시한다. 자동 가져오기 off나 사용자 중지 상태에서
  이 값이 false라는 이유만으로 계속 로딩 화면을 띄우지 않는다.
  이미 조건에 맞는 Issue는 미리보기에서 선택하고, 이후 관측된 조건 전환/신규 일치 Issue를 자동 처리한다.
- baseline 완료는 수집된 데이터에 대한 기준 상태 처리 완료다. 최신 GitHub 원문 수집이나
  Task 반영까지 모두 완료됐다는 의미가 아니다. `coverage.lastSuccessfulSyncAt`,
  `latestCollectionJob`, `latestTaskJob`, `lastTaskAppliedAt`을 구분해 표시한다.
- 설정 응답의 `criteria`, `mapping`과 달리 PUT 요청은 평탄한 필드다.
  변경 없는 중복 저장도 새 기준 상태를 만들 수 있으므로 막는다.
- todo/doing/done 라벨을 중복 지정하지 않는다. Done 매핑은 선택이며 null은 해제다.
  영향 미리보기 후 저장하고 비동기 재계산 완료를 확인한다.
- open + 유효한 상태 매핑 라벨 없음은 todo, closed + completed는 done이 라벨보다 우선이다.
  `not_planned`, `unknown_closure`, `mapping_conflict`, `mapping_error`는 마지막 상태를
  유지할 수 있다. 프론트가 상태를 임의 재계산하지 않고 서버 결과·사유를 표시한다.

### Task·보드·통계

- 일반 Task의 `source`는 null이다. GitHub Task에는 저장소/번호, 원문 링크,
  “GitHub에서 관리”, 마지막 반영 시각, 중지·충돌·내용 오류를 표시한다.
- GitHub Task의 제목·본문·상태·프로젝트 이동·드래그·완료 버튼을 제한한다.
  priority/tag만 수정하고 PATCH에 revision과 변경한 허용 필드만 넣는다.
  원본 관리 필드는 같은 값을 보내도 `TASK_SOURCE_MANAGED`가 발생한다.
- 제목 160/본문 10,000 UTF-16 단위 초과 시 새 Task 생성이 거부된다.
  연결 후 초과하면 마지막 정상 내용이 남으므로 “최신 본문”이라고 표시하지 않는다.
- Task 목록·stats의 `sourceReason` 필터와 `externalDataUnavailable`을 반영한다.
  정상 빈 결과와 권한/장애로 일부 외부 데이터가 제외된 결과를 구분한다.
  overview·위젯·휴지통에서도 같은 정책을 적용하고 숨겨진 개수를 추정하지 않는다.
- `externalDataUnavailable`의 위치는 Task 목록/stats/overview 응답 최상위,
  보드 위젯은 `data.statistics`, overview 위젯은 `data.tasks` 안이다.
  Task 사유 필터는 목록과 stats에 같은 조건으로 적용한다.
  통계는 보드 상태별 개수이며 `not_planned`를 임의로 완료 집계에서 빼지 않는다.
- 안전한 Markdown 렌더링과 외부 URL 검증을 적용한다. raw HTML 실행을 허용하지 않는다.
  본문·토큰·쿠키·OAuth code/state를 진단 로그에 기록하지 않는다.

### 중지·삭제·연결 해제

- 중지는 Task 반영/가져오기를 막지만 원문 수집·권한 철회 처리는 계속된다.
  프로젝트 archive와 사용자 paused는 별도이며 재활성화가 사용자 중지를 해제하지 않는다.
- soft delete/restore는 기존 Task API를 쓴다. 복원 응답이 최신 원문 반영 완료라는 뜻은 아니다.
- 일반 Task 전환은 마지막 정상 내용을 보존하고 자동 재가져오기 제외 기록을 남긴다.
  권한이 없는 내용을 이 기능으로 복구하도록 안내하지 않는다.
- 저장소 해제의 `convert`와 `purge`를 분리한다. purge는 남은 보호 Task 영구 삭제이며
  복원 불가임을 명시적으로 확인한다. 이미 일반 사본이 된 Task는 purge 대상이 아니다.
- 해제는 50개 단위 비동기 작업이다. disconnecting·부분 완료·재개를 표시하고,
  작업 중 화면을 닫아도 서버 작업은 유지됨을 안내한다.
- 해제 작업은 권한 상실 시에도 소유자에게 진행 메타데이터를 제공하지만 원문/개별 목록은
  제공하지 않는다. 현재 API에는 별도의 저장소 해제 영향 미리보기 endpoint가 없다.
  일반 가져오기 job의 items UI를 그대로 재사용하거나 전체 영향 개수를 추정하지 않는다.
  `purge` 정리는 서비스 소유권으로 가능하므로 GitHub 접근 실패만으로 정리 경로까지 숨기지 않는다.

## 6. 요청·오류·갱신 공통 규칙

- 기존 세션 쿠키와 `GET /api/v1/auth/csrf`를 사용한다.
  모든 POST/PUT/PATCH/DELETE에 `X-CSRF-Token`을 보낸다. 미리보기 POST도 포함한다.
- 요청별 필수 `Idempotency-Key`는 상세 계약을 따른다. 같은 작업 재시도는 같은 key/body,
  다른 선택·새 작업은 새 key를 쓴다. revision 충돌을 무조건 자동 재전송하지 않는다.
- HTTP timeout·탭 닫힘·polling 중지는 서버 작업 취소가 아니다. 현재 job 취소 API는 없다.
  응답을 잃은 가져오기 요청은 보관 기간 24시간 내 동일 key/body로 결과를 확인하며,
  revision을 바꾼 body에 이전 key를 재사용하지 않는다. 기간이 지났거나 요청 정보가 없으면
  현황·미리보기를 다시 확인한 뒤 사용자 의도로 새 요청을 만든다.
- 부분 실패 재시도는 성공 항목을 제외하고 실패 항목을 다시 미리본 뒤 최신 revision과
  새 key로 요청한다. 저장소별 queued 가져오기 상한은 10개다. 원문 최신성 대기는
  15분 후 `GITHUB_SOURCE_NOT_FRESH`로 끝날 수 있으므로 느린 작업을 임의 성공/취소 처리하지 않는다.
- Task revision, 연결 설정 revision, workspace data revision, layout revision을 구분한다.
  GitHub API는 workspace revision header를 제공하지 않으므로 작업 후 관련 API를 재조회한다.
- 같은 Task revision에서도 `source.lastAppliedAt` 등 관측 메타데이터는 바뀔 수 있다.
  revision이 같다는 이유만으로 새 source 응답을 버리지 않는다. 작업 종류에 따라
  Task·통계·overview·위젯을 다시 읽되 홈 배치 layoutRevision을 임의로 변경하지 않는다.
- `queued/running`은 진행 중, `completed/failed/partial`은 해당 시도의 종결이다.
  화면이 보일 때만 간격을 둔 polling을 수행하고 종결·화면 이탈 시 중지한다.
  `stage/page`를 파싱해 사용자 동작을 결정하지 않는다.
- 작업 관찰은 jobId를 기준으로 한다. `sync-status.latestJob`은 다른 작업으로 바뀔 수 있다.
  전체 작업 이력 목록 API는 없으므로 이를 제공한다고 가정하지 않는다. 돌아온 화면에서는
  알고 있는 jobId와 sync-status를 재조회하고 정보가 없으면 최신 관측 범위만 표시한다.
- 세션 만료·로그아웃·사용자 전환 때 polling과 진행 요청을 중단하고 기존 lifecycle 규칙에 따라
  Issue 선택·원본 미리보기·편집 메모리·작업 참조를 폐기한다. 다른 사용자의 화면에
  이전 요청을 재전송하거나 데이터를 합치지 않는다. 탭 간 알림은 변경 힌트로만 사용하고
  데이터·자격증명을 전달하지 않으며 포커스 복귀 시 서버 상태를 확인한다.
- 화면 진입·포커스 복귀·수동 갱신·작업 완료에 재조회한다.
  Webhook 수신 자체가 열린 프론트에 실시간 push되는 구조는 아니다.
- 오류는 message가 아니라 code로 분기한다. 401은 서비스 로그인,
  재인증 상태는 GitHub 재연결, CSRF 오류는 토큰/Origin 확인으로 구분한다.
- revision 충돌은 최신 설정 재조회, 접근 범위 변경은 cursor·기존 목록 폐기,
  접근 상실은 관련 원문 캐시 제거, 429는 대기/Retry-After 준수로 처리한다.
  GitHub 장애가 일반 Task 기능 전체를 막지 않게 한다.
- 409를 모두 revision 충돌로 처리하지 않는다. `GITHUB_REFRESH_IN_PROGRESS`는 토큰 갱신 중,
  `PROJECT_ARCHIVED`는 프로젝트 보관, `GITHUB_ACCOUNT_IN_USE`는 남은 연결 정리 필요 상태다.
  특히 갱신 중 응답만으로 계정 철회나 서비스 로그아웃을 확정하지 않는다.
- GitHub secret·PEM·user/installation token은 백엔드 소유다.
  프론트 환경변수나 브라우저 영속 저장소에 넣지 않는다. Webhook endpoint는 프론트에서 호출하지 않는다.

## 7. 검증 기준과 인계 기록

프론트 코드 검증은 기존 `npm test`, `npm run build`, 경계/쿼리 검사와
영향받는 브라우저 E2E를 사용한다. 모의 응답 UI 검증과 실제 GitHub 검증을 구분해서 기록한다.

- [ ] 계정 연결 성공/취소/실패/다른 계정 충돌/재인증, 결과 화면 직접 접근·새로고침.
- [ ] 개인·조직 설치/선택 저장소, 프로젝트별 복수 저장소, 초기 수집 중/실패/빈 목록.
- [ ] 선택 가져오기·중복 요청·부분 실패·작업 대기·완료 후 Task/통계/위젯 갱신.
- [ ] 원본 필드 수정 차단과 priority/tag 수정, 일반 Task의 기존 동작 회귀.
- [ ] 기준 상태의 기존 일치 Issue 미생성, 이후 조건 비일치→일치에 따른 실제 자동 생성.
- [ ] 닫기/재개방/라벨 변경, 복수 상태 라벨 충돌, not_planned, 라벨 삭제, 길이 초과와 정상 복귀.
- [ ] 중지 중 원격 변경, 재개 후 기존 Task 반영과 신규 후보 선택, archive/reactivate.
- [ ] 사용자/설치 접근 철회 후 상세·목록·stats·overview·위젯·휴지통 캐시와 cursor 처리.
- [ ] Task 전환·저장소 해제·부분 완료·재개·purge·계정 정리. 격리된 폐기 가능 데이터로 검증.
- [ ] **배포 후 수행:** 공개 HTTPS Webhook 전달·서명 검증·중단 후 전달 복구와 배포 DB/프론트 최종 상태 일치. 로컬 검증으로 대체 완료하지 않는다.
- [ ] 실제 프론트 origin과 배포 nginx에서 OAuth·CSRF·callback·return 라우팅 확인.
- [ ] 담당자 UI를 현재 ID 계약으로 제공할지 백엔드 보완할지 확정하고 그 범위의 동작 검증.
- [ ] 설치 page, Issue/라벨 cursor, 미리보기 seek 페이지네이션과 필터 변경 초기화 검증.
- [ ] 같은 revision의 source 갱신, 권한 상실 후 이전 캐시·늦은 응답 재노출 차단 검증.
- [ ] OAuth state 만료/재사용의 callback 오류와 설정 화면에서의 재시작 동선 검증.
- [ ] timeout 후 동일 요청 복구, 부분 실패만 재시도, 새로고침·탭 복귀 중 작업 관찰 검증.
- [ ] 서비스 사용자 전환·세션 만료 후 이전 Issue/편집 메모리/작업 참조 격리 검증.

실제 App/Webhook 권한·활성화 변경과 파괴적인 검증은 대상·범위를 확인하고 별도로 진행한다.
프론트 개발 요청만으로 운영 App 권한 변경이나 실제 사용자 데이터 삭제를 수행하지 않는다.

### 2026-10-20 기준 이미 확인된 범위

백엔드 전체 빌드 365개와 후속 집중 테스트 56개가 통과했다. 서로 중복이 있어 합산하지 않는다.
실제 로컬 OAuth·개인 설치·저장소 연결·선택 가져오기·수동 동기화에 의한 닫기/재개방·
세 상태 라벨 매핑이 확인됐다. 후속 브라우저 검증에서 중지/재개 200, 오래된 revision 409,
자동 가져오기 활성화와 baseline 완료, 비로그인 401을 확인했다.

이 결과는 조건 전환에 따른 실제 자동 생성, 중지 중 원격 변경의 반영, 모든 오류 UI,
조직·접근 철회, 공개 Webhook 전체 흐름의 통과를 의미하지 않는다.
GitHub 사이트 접근이 승인 단계에서 거절되어 원격 변경 검증은 중단했고 우회하지 않았다.
Webhook은 비활성으로 유지한 것이 마지막 확인 상태다. 실제 재개 전 다시 확인한다.

로컬 마지막 설정은 `revision=6`, `enabled=false`, `paused=false`, 빈 조건,
`baselineReady=true`, 기존 세 상태 매핑 유지다. 참고용 관측값이며 ID/revision을 코드에
하드코딩하지 않는다. 시작 시 account/repositories/import-settings/sync-status를 다시 조회한다.
공개 서비스는 로그인·API 접근이 가능하지만 GitHub 계정은 disconnected,
조회한 프로젝트의 연결 목록은 비어 있었다. 프론트 GitHub 기능은 아직 미구현이다.

### 통합 검증 완료 후 백엔드에 전달할 내용

환경·origin·백엔드 버전, 격리된 App/저장소 범위, 각 시나리오의 기대/실제 결과,
HTTP 상태·오류 code·jobId·최종 상태, 실패/생략 사유, 원격 설정 복원 여부를 기록한다.
비밀이나 private 원문을 포함하지 않는 화면·응답 근거를 첨부한다.
필수 검증이 충족되면 사용자 요청에 따라 백엔드 PLAN-0017 체크리스트와 완료 인덱스를
갱신한다. 프론트 구현 완료만으로 PLAN-0017을 자동 completed 처리하지 않는다.
