# PLAN-0031 구현·로컬 검증

검증일: 2026-10-20. [PLAN-0031](../../plans/PLAN-0031-github-issue-task-frontend.md)의 프론트 구현과
로컬 필수 흐름에 관한 기록이다. 실제 공개 HTTPS Webhook 전달 성공을 뜻하지 않는다.

## 구현

- 인증된 작업실의 `/github`, `/github/connection-result`와 프로젝트 상세 관리 슬롯을 연결했다.
  legacy 화면을 수용 검증의 대상으로 사용하지 않았다.
- GitHub 조회는 작업실의 QueryManager를 공유한다. 경로에는 프로젝트·연결·설치·job과
  필터·limit·cursor/page가 포함되며 정책은 fresh=0, GC=60초, focus 재조회다.
  설정 draft는 서버 재조회와 분리하고 다른 revision은 명시적 비교·다시 불러오기로 처리한다.
- 설치/저장소 page, Issue/라벨 cursor, preview afterIssueId를 분리했다. 최대 100개 선택,
  명시적 preview/import, 부분 실패 항목의 새 preview와 동일 요청 key/body 복구를 제공한다.
- job별 관찰 타이머를 공유한다. 숨김·마지막 관찰자 이탈·종결·오류 뒤 반복 요청을 중지하며,
  Retry-After 이전의 조회·mutation 네트워크 재시도를 막는다. 헤더 없는 작업 오류는 명시적 재시도다.
- Task source를 모델·보드·편집기·overview·Widget까지 전달했다. 원본 관리 필드는 UI와
  mutation 경계에서 막으며 변경한 priority/tag와 revision만 PATCH한다.
- 접근 상실 시 원문·선택·preview·Task entity/detail/list·편집 메모리와 집계/Widget snapshot을
  정리한다. 부분 응답을 받은 여러 열이 서로의 새 응답을 계속 취소하던 문제를 수정했다.
  새로운 정상 응답의 일반 Task와 서버 집계를 표시하며 숨겨진 개수는 계산하지 않는다.
- 연결별 세대를 분리해 다른 프로젝트의 지연 응답을 불필요하게 폐기하지 않는다.
  같은 linkId 재연결은 이전 요청·draft·cursor·job 참조와 cooldown을 폐기한다.
- DELETE 접수 즉시 보호 내용을 가리고, owner 연결 조회와 metadata job 관찰을 유지한다.
  convert/purge와 평탄한 cleanup 요청을 구분한다. 정리 요청에 import replay 계약을 적용하지 않는다.
- 프로젝트의 이미 검증된 상세가 배경 재조회 중이라는 이유로 자식을 unmount하지 않게 했다.
  접근 오류에서는 계속 가리며, 설정·작업 화면의 입력과 관찰은 일반 재조회 동안 유지한다.
- Markdown은 React가 escape하는 텍스트와 제한된 인라인 표현만 렌더링한다.
  raw HTML·원격 이미지·위험 URL을 실행하지 않으며 새 의존성은 추가하지 않았다.

## 환경과 계약

프론트 기준 커밋은 `0ce0e75378d8ce42b2e57300bb0f2e21cb1bc2e5`, 백엔드는
`d15f646510e7c94f05f2034cab37ba4e5960e153`이다. 백엔드에는 기존 배포 compose/문서 변경이
남아 있으며 이번 프론트 작업에서 백엔드 소스나 PLAN-0017 상태를 변경하지 않았다.

| 환경          | origin / 대상                                       | 용도                                                   |
| ------------- | --------------------------------------------------- | ------------------------------------------------------ |
| 실제 연결     | Vite `127.0.0.1:5173` → IDE 백엔드 `127.0.0.1:8080` | 기존 DB·Google 세션·실제 GitHub App과 공개 시험 저장소 |
| 격리 Vite     | `127.0.0.1:4175` → 소유한 테스트 백엔드 `:18080`    | 새 PostgreSQL·OIDC 테스트 제공자, GitHub disabled      |
| 격리 Nginx    | `127.0.0.1:4177` → 같은 유형의 별도 테스트 백엔드   | Dockerfile 산출물·SPA·API/OAuth proxy·보안 회귀        |
| 모의 브라우저 | `127.0.0.1:4190`                                    | GitHub 전용 인증된 UI 수용 검증. upstream은 닫힌 포트  |

실제 8080 프로세스 충돌을 해소한 뒤 사용자가 IDE로 백엔드를 실행했다. 프론트의 로컬
`BACKEND_UPSTREAM`은 8080으로, 백엔드 `.env`의 `APP_ORIGIN`과
`GITHUB_FRONTEND_RETURN_URL`은 각각 5173과 5173의 결과 경로로 맞췄다.
기존 Google/GitHub callback 주소는 8080을 유지했다. 실제 Google 로그인은 8080 callback 뒤
8080 `/github`로 상대 복귀하여 404가 표시됐고, 같은 loopback 세션의 5173 화면으로 다시 이동했다.
이를 Google의 5173 callback 전체 성공으로 기록하지 않는다. 배포에서는 등록 callback도
배포 프론트/API 프록시 origin에 맞춰 재검증해야 한다. 격리 OIDC 검증은 실제 프론트 origin의
callback·returnTo·reload·Origin·CSRF를 모두 통과했다.

인증된 실제 8080 `/v3/api-docs`와 백엔드 DTO 소스를 대조했다. GitHub 브라우저 JSON API는
26개이며 backend callback GET까지 포함한 operation은 27개다. Webhook POST는 별도다.
성공 상태 200/201/202/204, CSRF와 요청별 Idempotency-Key, nullable 필드,
설정의 평탄한 요청/중첩 응답, DELETE query와 cleanup JSON, 세 페이지 표현을 확인했다.
서버 계약의 callback과 DTO를 프론트의 fetch operation으로 합성하지 않았다.
operation 목록은 [격리 Vite 계약 근거](vite-github.json), [Nginx 계약 근거](nginx-github.json)에 있다.

## 실제 연결 검증

기존 DB를 초기화하지 않았다. 원격 Issue·라벨·App 설정을 변경하지 않았고,
계정 해제나 purge 같은 실제 파괴 시험도 하지 않았다.
새 `PLAN-0031 local validation` 프로젝트를 만들어 기존 시험 저장소를 별도로 연결했다.
프로젝트·연결·job·Task 식별자와 최종 설정은 [메타데이터 기록](local-connected.json)에 남겼다.
쿠키·토큰·OAuth code/state·private 본문은 기록하지 않았다.

| 검증                    | 기대                                | 실제 결과                                                                                |
| ----------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------- |
| 계정·설치·접근 저장소   | 현재 서버 상태 조회                 | connected, 개인 설치와 시험 저장소 선택 UI 표시                                          |
| 새 프로젝트 저장소 연결 | 독립 연결과 초기 수집               | 연결 성공, initializing 후 실제 수집 시각·Issue 2건 표시                                 |
| 선택 가져오기           | numeric Issue ID, preview 후 202    | Issue #2 preview 후 job `dd4573dc-037f-463e-894f-86495ad22d34` 접수                      |
| 작업 종결               | 알려진 jobId를 관찰                 | 200 completed, 성공 1·실패 0, Task 생성                                                  |
| 보드·집계 갱신          | 새 source Task 표시                 | 프로젝트 보드의 Task 1건과 todo=1 확인                                                   |
| 허용 필드 수정          | 원본 필드 잠김, priority/tag만 수정 | 제목·본문·상태·프로젝트 disabled, high/plan0031 저장 뒤 Task revision=2와 source 유지    |
| 설정 저장               | 조건 저장과 baseline 관측           | Backlog 라벨 조건 활성화 저장 성공, 기존 일치 Issue가 새 Task로 만들어지지 않음          |
| 중지·재개               | 사용자 paused와 source 표시         | 실제 중지 후 가져오기 제한·보드 중지 표시, 재개 성공                                     |
| 접근 확인 만료          | 원문 가림과 일반 Task 유지          | check_pending 관측·원문 가림·부분 안내, 기존 일반 Task 유지. verified 후 새 조회로 복귀  |
| 최종 복원               | enabled/paused/조건/매핑 복원       | 격리 연결 revision=5, enabled=false, paused=false, 빈 조건·null 매핑, baselineReady=true |
| 기존 프로젝트 복원      | 기존 의미와 매핑 보존               | revision=8, enabled=false, paused=false, 빈 조건·기존 3개 매핑 유지                      |

설정 전환으로 generation과 작업 메타데이터는 증가했다. revision을 과거 값으로 되돌리지 않았다.
마지막 관측 Task 작업 `d7b2352d-1945-4962-ba88-ffccf98276d7`은 kind=mapping, completed였다.
특정 설정 저장과 작업의 인과관계가 계약으로 제공되지 않으므로 최신 관측 상태로만 기록한다.
검증 프로젝트와 가져온 Task는 검토할 수 있도록 남겼으며 자동 가져오기는 off다.

## 자동·시각 검증

- 단위: 42개 파일, 261개 테스트 통과. DTO·ID/URL·사유/PATCH·같은 revision 관측,
  요청 복구·조회 공유·숨김/종결/오류 polling·연결 세대·cleanup 계약·부분 데이터 callback을 포함한다.
- GitHub 모의 브라우저: 37개 통과. 계정 상태와 재조회, CSRF/key, 100개 선택과 페이지,
  cursor/filter 초기화, partial 실패, 설정 충돌/미저장 보존, rate countdown,
  접근 404·사용자 교체·일반 Task 유지, 변환·복원·archive/paused 독립, Markdown/키보드/모바일을 검증했다.
  빈 설치·설치/저장소 page 분리, baseline 완료 시 기존 후보 미생성 및 후속 서버 apply의 focus 갱신,
  연결 실패/계정 충돌 안내와 위험 동의 URL 차단도 포함한다. baseline 시험은 이전 조회의
  갱신 체인이 끝나기 전에 다음 이벤트를 주입하던 경합을 정리한 뒤 3회 반복 통과했다.
- 현재 회귀: Projects 32, Tasks 20, Dashboard v3 9, Shell 6, auth의 Document 복귀 2개 통과.
  Shell 상세가 새 GitHub 조회를 실제 미인증 서버로 흘려 보내던 fixture 누락을 고쳐
  빈 연결 응답으로 격리하고 해당 직접 접근·새로고침을 다시 통과했다.
- `npm run build`, 경계·쿼리 검사 통과. Dockerfile 빌드도 통과했다.
  기존 큰 chunk 경고는 남아 있다. 새 query 예외나 런타임 의존성은 추가하지 않았다.
- 격리 실제 Vite와 Nginx의 callback·PKCE·reload·CSRF·Origin·로그아웃·사용자 전환·proxy가 통과했다.
  근거: [Vite session](vite-session.json), [Nginx session](nginx-session.json).
  GitHub가 disabled인 새 DB의 결과 화면과 not_configured 상태를 검증한 것으로,
  이 결과를 실제 GitHub OAuth나 원격 작업 성공으로 확장하지 않는다.
- 실제 연결 UI를 desktop/390px에서 살펴봤고, 모바일에서 가로 넘침이 없었다.
  별도로 격리 Nginx의 1440/390/320px와 reload를 확인했다.
  [desktop](nginx-desktop.png), [mobile](nginx-mobile.png)은 disabled 계정 분기의 실제 Nginx 캡처다.
  실제 모바일 기기·가상 키보드 검증은 수행하지 않았다.

기존 전체 suite도 실행했다. auth의 이전 영문 문구·깨진 `??? ??` selector·이전 Home 허용 목록,
Tasks/Projects의 이전 Home fixture와 인증 문구, Shell의 legacy 화면과 pixel parity 전제에 따른
실패를 통과로 계산하지 않았다. 최초 다수 suite 동시 실행에서 추가로 timeout이 발생한
Projects 8건은 worker를 2개로 줄여 모두 통과했다. 기존 3개 Projects/3개 Tasks 실패는
[PLAN-0030 기준선](../plan0030-ui-layout-audit/validation.md)의 대상과 동일하다.
현재 기능과 실제 인증을 검증하는 위 결과를 별도로 기록했다.

`check:docs` 전체는 기존 PLAN-0006~0008의 `../../../backend/` 링크 실패를 계속 보고한다.
새 문서·변경 문서의 링크, 변경 파일 Prettier와 `git diff --check`는 별도 검사한다.

### 재현 명령

```powershell
npm test
npm run check:boundaries
npm run check:queries
npm run build
npx playwright test --config playwright.github.config.ts
$env:BACKEND_ROOT = 'C:\Users\USER\lib\devspace\devspace-back'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'
node tests/real/run.mjs --github
node tests/real/run.mjs --github --nginx
```

전용 GitHub Playwright 구성은 기본 legacy renderer와 다른 인증 경계와 닫힌 upstream을 사용한다.
실제 검증은 기존 `tests/real/run.mjs`에 `--github`를 추가했다.
Nginx 첫 실행은 기본 Docker bridge에서 resolver `127.0.0.11:53` connection refused로 실패했다.
기존 runner가 소유한 user-defined network를 만들고 컨테이너/네트워크를 함께 정리하도록
수정한 뒤 전체 검증이 통과했다. Nginx 보안 헤더나 애플리케이션 보안 보호는 변경하지 않았다.

## 남은 실제 통합과 계약 인계

다음은 로컬 필수 흐름의 성공과 별개다. 이번 세션에서 성공으로 체크하지 않았다.

| 남은 범위                                                      | 미실행 근거와 재개 조건                                                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 원격 조건 비일치→일치에 따른 실제 자동 생성, 중지 중 원격 변경 | 원격 Issue 편집을 수행하지 않았다. 기존 백엔드 기록의 원격 Issue 접근 거절을 우회하지 않았다. 명시적으로 편집 가능한 격리 원격 시험 자원으로 재개 |
| 실제 조직 승인/설치 중단/권한 철회·계정 교체·재인증 실패       | 해당 시험 계정/조직 자원과 실제 철회 승인이 필요. UI 상태/격리는 모의 검증                                                                        |
| 실제 convert/purge·50개 이상 부분 해제/재개                    | 실제 데이터의 파괴 시험 제외. 해당 API 요청·보호 시점·metadata 관찰은 모의/단위 검증. 별도의 폐기 가능한 대량 데이터로 재개                       |
| Google callback의 5173 직접 복귀                               | 기존 실제 등록 callback은 8080. 5173 callback 등록·실행 설정을 맞춘 뒤 실제 provider 왕복을 다시 확인. 격리 제공자에서는 같은 origin 왕복 통과    |
| 공개 HTTPS Webhook 전달·누락 복구                              | 운영 배포·App 구독/secret/명시적 활성화 후 공개 이벤트로 재개. 로컬 수집이나 모의 결과를 실제 전달 성공으로 대체하지 않음                         |

계약 보완 사항은 PLAN의 담당자 이름 검색·login↔ID, callback 400 JSON의 결과 화면 복귀,
해제 영향 목록/개수, 작업 취소/전체 이력이다. 현재 계약 안에서 numeric ID 입력,
새 동의 시작, 명시적 정리 확인, 알려진 jobId 관찰을 제공한다.
배포 전 APP_ORIGIN·등록 callback·GitHub frontend return·Secure cookie·Host/Proto를 같은
배포 origin으로 맞추고 PLAN의 공개 HTTPS 체크리스트를 실행해야 한다.
