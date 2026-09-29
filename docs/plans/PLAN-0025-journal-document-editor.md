# Plan: Journal에서 연결하는 공용 Document Editor 실제 API 연동

Status: `proposed`
Date: 2026-09-22
Revised: 2026-09-23

## Goal

Journals 목록 → Journal Viewer Page → Journal별 Document 목록·생성 → 공용 BlockNote Editor/Read-only Viewer 흐름을 실제 Backend API에 연결한다. 제목·본문 자동 저장, 최신 저장 후 게시, 이미지·파일 첨부와 실패 복구를 구현한다.

2026-09-23 사용자가 보완된 계획의 실행을 승인해 active로 전환했다. 패키지 설치·구현·실제 통합 검증을 순서대로 진행한다. 종전 Mock 우선 개발·별도 실제 연동 단계는 이번 수정으로 대체한다. 완료는 실제 Frontend/API 통합 검증을 뜻하며 Production 배포를 뜻하지 않는다.

## Scope

- In scope:
  - Journal Context 선택·확인과 새 글 작성, 인증 앱의 Journal 읽기 상세 Modal을 Page로 전환.
  - 기존 Journal 상세 API와 실제 Journal Document 목록·DRAFT 생성, documentId 기반 Editor/Viewer.
  - BlockNote 기본 기능, 별도 제목, Autosave·Publish·삭제 및 오류 복구.
  - 실제 multipart 업로드, Attachment Registry·현재 본문의 attachmentIds, 첨부 표시·다운로드·복원.
  - 기존 Router·인증·QueryManager·HTTP·공용 UI, FormData 전송과 프론트 Nginx 용량/timeout 설정 검토.
  - 기존 단위·브라우저 및 disposable real harness를 이용한 접근성·반응형·실제 Vite/Nginx 통합 검증.
- Out of scope:
  - Backend 구현 변경, MinIO 직접 접근, Production 배포, 실제 사용자 업무 데이터에 검증용 mutation.
  - DocumentSpace CRUD, 전역 Document 생성·목록, Project/Milestone/Resource Document 연결, Unpublish.
  - Custom Block/Slash, 외부 API Block, Realtime/Collaboration/WebSocket, Comment/Mention/Template/History/Share/AI.
  - 기존 Journal body의 BlockNote 변환·자동 이관, 전체 캐시 전환, 전역 디자인 개편, 미래 owner registry/plugin framework.
  - 개발용 가짜 서버·Mock preview·임시 metadata resolver·운영 fallback 구축, 새로운 lint 도구·설정·ADR.

## Changes

### 1. 기준 문서와 확인 근거

- [Frontend Requirements](../requirements/DOCUMENT_EDITOR_FRONTEND_REQUIREMENTS.md), [Common Domain & API Contract](../requirements/DOCUMENT_EDITOR_COMMON_CONTRACT.md), [계획 지침](PLANS.md), [런타임 템플릿](PLAN-TEMPLATE-RUNTIME.md)을 따른다. 루트·docs·src 및 각 영역 지침과 기존 구조·검증·환경·조회 정책을 적용한다.
- 2026-09-23 로컬 [Swagger](http://127.0.0.1:8080/swagger-ui/index.html)와 [OpenAPI](http://127.0.0.1:8080/v3/api-docs)의 200 응답, Document 6개·Attachment 3개 operation과 schema를 확인했다. 이는 명세 가용성 확인이며 인증된 CRUD·업로드 성공 증거가 아니다.
- 이전의 Backend proposed 상태를 현재 상태로 인용하지 않는다. 이번 확인에서 인접 backend checkout 경로는 존재하지 않았으므로 Backend 소스·계획 상태는 재확인하지 않았다. 실행 시 실제 checkout 및 저장소를 사용하는 disposable 검증 환경을 확인한다.
- 최신 live 명세에서 필수 `attachments` 상세 응답, 본문 기본 1MiB·전체 JSON 요청 1,114,112바이트·깊이 100, 파일 기본 10MiB·multipart 11MiB와 설정 변수를 확인했다. filename 255 UTF-16 units는 Frontend Requirements의 기준이며 현재 Swagger에서는 확인되지 않아 Backend 설정·실제 경계 검증으로 확인한다. 명세 확인을 실제 통합 성공으로 기록하지 않는다.
- [PLAN-0009](PLAN-0009-journal-integration.md)의 Journal CRUD, [PLAN-0019](PLAN-0019-project-detail-workbench-density.md)의 상세 구성, [PLAN-0022](PLAN-0022-project-query-cache.md)의 QueryManager, [PLAN-0023](PLAN-0023-widget-dashboard-api-refactoring.md)·[PLAN-0024](PLAN-0024-dashboard-widget-interactions.md)의 기존 실제 검증 기반을 재사용한다. 과거 v1/scope 설명과 테스트 생략 승인은 이번 실행 기준으로 확대하지 않는다.

### 2. 현재 코드베이스 분석

2026-09-22 소스·설정·lockfile을 읽어 확인한 사실이다. 신규 Backend API에 대한 실행 검증 결과가 아니다.

| 항목               | 현재 구현 및 계획에 미치는 영향                                                                                                                                                                                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 기술·패키지        | [package.json](../../package.json)은 React/React DOM `^19.0.0`, lock 실제 19.2.8. TypeScript 5.7.3, Vite 6.4.3, Vitest 4.1.11, Playwright 1.63.0. BlockNote 및 다른 Rich Text/Markdown Editor 패키지는 없다.                                                                                                                                             |
| Type 규칙          | [tsconfig.json](../../tsconfig.json)의 strict/noEmit, TS/TSX, named export, component PascalCase·나머지 camelCase, `unknown`을 검증해 좁히는 규칙. DTO·draft·presentation을 구분하고 `any`로 API 경계를 통과시키지 않는다.                                                                                                                               |
| 구조               | `src/app`은 인증·수명·조합, `pages`는 Route 조합, `features`는 도메인, `shared`는 기능 독립 코드. 별도 Router/전역 상태 라이브러리는 없다.                                                                                                                                                                                                               |
| 실제 Router        | [AuthApp](../../src/app/auth/AuthApp.tsx)의 History API·popstate·navigation guard와 [PrivateWorkspace](../../src/app/auth/PrivateWorkspace.tsx)의 pathname 분기. `/projects/:id` 선례가 있고 `/journals`만 존재한다. Journal/Document 상세 Route는 없다.                                                                                                 |
| 공유 경로 metadata | PageRouter는 별도 prototype용이지만 [routes.ts](../../src/app/routes.ts)의 readLocation/pagePaths는 [AuthenticatedLayout](../../src/app/auth/AuthenticatedLayout.tsx)도 사용한다. PrivateWorkspace와 함께 shell의 경로 metadata를 확장해야 상세에서 홈 선택/Page not found가 표시되지 않는다.                                                            |
| 인증·복귀          | [routeIntent](../../src/app/auth/routeIntent.ts)의 `safeReturnTo`가 허용 경로를 제한한다. AuthSession의 cookie 세션, `/api/v1/me`, CSRF, 동일 신원 재확인과 계정/작업실 세대 분리를 유지해야 한다.                                                                                                                                                       |
| API Client         | [client](../../src/shared/http/client.ts), [transport](../../src/shared/http/transport.ts), [freshTransport](../../src/shared/http/freshTransport.ts). same-origin cookie·CSRF·timeout·abort/generation·typed error·response parser를 제공한다. 현재 versioned API만 허용하며 JSON body와 JSON/204 응답만 지원한다.                                      |
| Server State       | [Query/useQuery](../../src/shared/http/query.ts)와 [QueryManager](../../src/shared/http/queryManager.ts). PrivateWorkspace가 manager 하나를 주입한다. Project는 관리 조회, JournalStore는 기존 직접 Query 예외다. 신규 조회는 이 예외를 복제하지 않는다.                                                                                                 |
| Local/Global State | 기능별 React state/ref와 draft memory, app의 인증·Store 조합. [JournalMemory](../../src/features/journal/draftMemory.ts)와 [journalHandoff](../../src/app/auth/journalHandoff.ts)는 동일 신원 재확인 시 메모리 초안을 보존한다. 인증 앱은 legacy localStorage를 데이터 권위로 사용하지 않는다.                                                           |
| 오류·상태          | HttpError/CancelledError, field errors·404·403·CSRF/인증·불확실 mutation을 구분한다. Query는 loading/ready/error/stale을 제공하며 실패한 추가 페이지는 기존 행을 유지한다. 실패를 빈 데이터로 바꾸지 않는다.                                                                                                                                             |
| 공용 UI·디자인     | [PageScaffold](../../src/shared/ui/PageScaffold.tsx)의 actions/feedback/filters, [controls](../../src/shared/ui/controls.tsx)의 Button/Field/Badge/EmptyState/Modal, [tokens](../../src/shared/styles/tokens.css)의 Warm Porcelain·Cobalt·Pretendard를 재사용한다.                                                                                       |
| Journal 목록       | [ServerJournalsPage](../../src/pages/ServerJournalsPage.tsx) → [ApiJournalWorkspace](../../src/features/journal/ApiJournalWorkspace.tsx). category/projectId/q/from/to/sort URL 필터, cursor 더 보기, 별도 생성·수정·삭제가 있다. `.document-row`는 이미 Journal 목록 클래스이므로 새 Document UI 이름과 구분해야 한다.                                  |
| Journal 상세 Modal | ApiJournalWorkspace의 `detail` state와 `onDetail=setDetail`이 목록의 `raw.body`를 Modal에 표시한다. 상세 Modal만을 위한 GET은 없다. 수정 진입의 `store.detail` GET은 별도 기능이다.                                                                                                                                                                      |
| 다른 상세 진입     | [ApiRecentJournals](../../src/features/journal/ApiRecentJournals.tsx)는 [ApiProjectJournals](../../src/features/journal/ApiProjectJournals.tsx)에서 사용된다. 현재 Home의 [WidgetDataContent](../../src/pages/home/WidgetDataContent.tsx)에도 JournalData 상세 Modal이 있다. ServerJournalHome은 현재 PrivateWorkspace에서 사용하지 않는다.              |
| 기존 Editor        | [ApiJournalEditor](../../src/features/journal/ApiJournalEditor.tsx)는 제목/Project/작성일/body textarea를 명시 저장한다. Project 상세의 locked Project 작성에서도 재사용한다. 새 Document Editor와 다른 기능이다.                                                                                                                                        |
| Journal DTO/API    | [apiModel](../../src/features/journal/apiModel.ts), [apiStore](../../src/features/journal/apiStore.ts): UUID `id`, `revision`, `title`, `body`, `projectId/projectName`, `categoryId`, `entryDate`, audit timestamps. 현재 `documentSpaceId`는 없다. `/api/v2/journals`의 목록·직접 상세·생성·PATCH·DELETE를 사용하며 목록은 `items/total/nextCursor`다. |
| Journal 검증       | 제목 1–120, body 1–20000, Project 필수, entryDate는 date-only. 이 제한을 별도 Document 제목/본문에 임의 적용하지 않는다. 기존 body는 그대로 표시·보존한다.                                                                                                                                                                                               |
| 파일·이미지 기반   | 소스에 실제 파일 업로드, multipart/FormData, Object URL 기반 미리보기, rich text/contentEditable 구현이 없다. 기존 정적 아이콘·이미지는 업로드 사례가 아니다.                                                                                                                                                                                            |
| 테스트·Mock        | `src/**/*.test.ts`의 Vitest, [Journal fixture](../../tests/journals/fixtures.ts)의 Playwright `page.route`와 Node 메모리 상태, [Journal config](../../playwright.journals.config.ts)의 4180 서버. 기본 [Playwright config](../../playwright.config.ts)는 legacy 진입이며 신규 인증 Journal 테스트를 대신하지 않는다.                                     |
| 명령               | `npm run build`는 prebuild `check:queries` 후 `tsc -b && vite build`. 별도 typecheck/lint script 및 ESLint/Biome 설정은 없다. `npm test`, `check:boundaries`, `check:queries`, `check:docs`, `format:check`가 있다.                                                                                                                                      |
| Base URL/Proxy     | [vite.config](../../vite.config.ts)의 server-only `BACKEND_UPSTREAM`, 기본 `http://127.0.0.1:8080`, 브라우저는 상대 경로. `/api`·`/oauth2` proxy와 [nginx.conf](../../nginx.conf)의 SPA fallback을 사용한다. MinIO 설정·자격정보는 Frontend에 추가하지 않는다.                                                                                           |

### 3. 확정 계약과 미해결 연동 조건

| 항목                      | 적용 기준                                                                                                                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Journal Detail            | 기존 v2 상세 API와 ApiJournal 필드를 사용한다. Journal DTO에 documentSpaceId를 필수로 추가하지 않는다.                                                                                                   |
| ID/경로                   | 모든 wire ID는 UUID 문자열, Frontend는 opaque string. 6절의 실제 v2 경로 사용.                                                                                                                           |
| 목록                      | limit 기본 20, 1–100; cursor는 opaque/null. createdAt/id 내림차순. 검색·상태 필터 없음. 한 응답의 total/page는 같은 snapshot이지만 여러 페이지는 단일 snapshot이 아님.                                   |
| 저장                      | title/content/attachmentIds 필수 전체 교체. 빈 제목·빈 JSON 배열 허용, attachmentIds=[]는 전부 detach.                                                                                                   |
| 게시                      | PUBLISHED도 PUT 가능. 반복 publish는 최초 publishedAt을 유지하며 재변경하지 않음. 저장된 수정은 별도 비공개 초안이 아니므로 재게시 전까지 숨겨진다고 안내하지 않음.                                      |
| 재시도                    | 생성·업로드에는 replay/idempotency 보장 없음. timeout 후 자동 POST 재시도 금지. pending 중복 차단만으로 응답 유실 중복을 방지했다고 주장하지 않음.                                                       |
| 동시 수정                 | PUT에 revision/ETag 없음. 한 session/document의 queue만 직렬화하며 다른 탭·클라이언트의 lost update 방지 보장은 없음. Workspace revision은 충돌 방지용 편집 revision이 아님.                             |
| Registry 복원 — 계약 확인 | DocumentSnapshot의 필수 attachments 배열로 복원. attachmentIds와 동일 snapshot·UUID 순서, 최대 100개 ATTACHED metadata이며 TEMP는 제외. 별도 metadata API/resolver는 만들지 않음. 실제 복원 검증은 대기. |
| HTTP                      | FormData 지원을 기존 client에 추가. 인증된 binary stream은 JSON parser를 거치지 않음. redirect 전역 정책 완화 불필요.                                                                                    |
| 조회 정책                 | 실제 QueryManager/check:queries를 사용. src/AGENTS·query-policy의 미구현 문구는 낡은 설명이며 check:queries는 직접 new Query 파일 허용 목록 검사임. 모든 fetch/alias 우회 검출을 가정하지 않음.          |

Registry 제공 방식은 상세 응답 확장으로 확정됐다. 남은 완료 gate는 실제 upload → save → reload → attachments 복원 → 재편집 검증이다. metadata 누락·불일치 또는 서버 INTERNAL_ERROR 시 본문을 유지하고 저장을 막아 attachmentIds 유실을 방지한다. [Backend 보완 요청](../requirements/document-editor-backend-followup.md)은 요청 당시 기록이며, 그 문서와 요구사항·공용 계약에 남은 ‘제공 방식 미확정’ 설명은 이 계획의 최신 명세 확인으로 대체한다. 구현 문서 정리 시 관련 DTO 예시와 상태도 동기화한다.

기존 app/pages 조합으로 feature 직접 의존을 피한다. BlockNote UI binding처럼 장기 유지에 영향을 주는 선택은 기존 결정 기록 규칙에 따라 실행 승인 범위에서 기록한다.

### 4. 목표 화면과 Navigation

`Journals Home`은 전역 Dashboard가 아니라 현재 `/journals` 목록 화면을 뜻한다. 기존 PageScaffold의 Header Action에 **새 글 작성**을 두는 것을 우선안으로 한다. 이미 있는 작성 action·모바일 폭을 검토해 기존 **일지 작성**과 역할을 구분하고, 별도 FAB나 새로운 전역 메뉴는 도입하지 않는다.

```text
/journals → Journal 항목 클릭 → /journals/:journalId
  Journal 기본 정보 + 기존 body + Documents 목록
  → Document 클릭 → /documents/:documentId (Read-only)

/journals의 새 글 작성 → Journal 선택/확인
  또는 /journals/:journalId의 새 글 작성 → 해당 Journal 확인
  → Journal Context에서 DRAFT 생성 → 반환 id → /documents/:documentId/edit
  → 제목/본문/첨부 작성 → Autosave → 최신 저장 성공 → Publish → Viewer
```

- 목록에서는 첫 Journal을 자동 선택하지 않는다. 기존 목록·검색·pagination 패턴을 이용해 context를 명시적으로 선택한다. 현재 Project/Category 필터나 Widget selection은 Journal ID를 대신할 수 없다.
- Journal이 없으면 선택기를 빈 상태로 표시하고 기존 **일지 작성**으로 연결한다. 빈 Journal을 자동 생성하거나 필요한 기존 필드를 임의 채우지 않는다. 현재 ApiJournalEditor의 onSaved는 ID를 반환하지 않으므로 기본안은 생성 후 갱신된 선택기에서 Journal을 명시적으로 다시 선택하는 흐름이다. 생성 성공만으로 Document를 자동 생성하지 않는다.
- Journal Viewer에서는 기본정보와 Document 목록을 독립 영역으로 표시한다. 상세 실패/접근 불가 상태에서 임의 Journal로 생성하지 않는다. 목록 실패는 Journal 기본정보를 지우지 않으며 retry를 제공한다.
- 기본정보는 기존 title, entryDate, projectName, body를 중심으로 하고 필요한 경우 audit timestamp를 표시한다. 가상의 cover/owner/permission 같은 API 필드를 만들지 않는다.
- Create pending 중 중복 클릭을 막고 실패 시 선택 context를 유지한다. 결과가 불확실하면 목록 재조회·확인 경로를 제공하고 생성 idempotency 보장이 없으므로 자동 POST 재시도를 하지 않는다.
- 새 Route는 PrivateWorkspace 및 safeReturnTo에 추가하고 공유 routes.ts/readLocation 또는 인증 shell의 경로 metadata를 확장해 AuthenticatedLayout의 선택 메뉴·페이지 제목·focus/scroll을 맞춘다. 공유 변경의 legacy 회귀도 검증한다. 대소문자·malformed encoding·추가 segment·직접 URL·새로고침·로그인 복귀를 기존 경로 보안 규칙으로 검증한다.
- 목록 복귀는 기존 query/filter를 보존한 안전한 내부 navigation context를 사용한다. Document DTO에 journalId/ownerType/ownerId를 추가하지 않는다. context 없는 Document deep link도 직접 조회할 수 있고, 복귀 fallback은 `/journals`다.
- dirty/saving/error·pending upload는 기존 [useUnsavedChanges](../../src/shared/hooks/useUnsavedChanges.ts), [navigationGuard](../../src/shared/lib/navigationGuard.ts)와 AuthApp의 동기 navigation guard에 연결한다. 이탈 취소 시 입력·요청을 유지하고, 명시적 폐기 후 이탈 시 타이머·구독·업로드를 정리한다. 서버가 이미 받은 요청의 취소를 rollback 성공으로 표시하지 않는다. unload 시 비동기 저장 완료나 beacon 저장을 보장하지 않는다.

### 5. 책임·상태·API 경계

신규 파일명은 구현 시 현재 convention에 맞춰 정하되 책임은 다음으로 제한한다.

| 위치                          | 책임                                                                                                                                                |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/auth`                | 동일 session/workspace의 transport·QueryManager·Document memory 조합, security recovery, navigation callback, lifecycle dispose와 연쇄 invalidation |
| `src/pages`                   | Journal Viewer 및 Document Viewer/Editor Route 조합, journal context → create → document route 연결                                                 |
| `src/features/journal`        | Journal 기본정보·선택·Journal Document collection service와 목록 DTO/표현. 기존 Journal CRUD 보존                                                   |
| 신규 `src/features/documents` | 도메인 독립 Document DTO/service/store, BlockNote Editor/Viewer, title draft, Autosave/Publish, Attachment service/registry/업로드 상태             |
| `src/shared/http`             | 기존 인증·취소·오류 경계를 유지한 필요한 FormData 전송. 도메인별 endpoint/업무 무효화는 넣지 않음                                                   |
| 실제 연동 검증                | 기존 disposable real harness에서 실제 API·파일 저장소 검증. 개발용 Mock 서버·운영 fallback은 만들지 않음                                            |

Document는 공용 **feature**이며 도메인 개념을 shared로 밀어 넣지 않는다. Documents가 JournalStore를 import하거나 journalId를 Editor 필수 prop으로 요구하지 않는다. Journal도 Documents의 내부 Store/Editor를 import하지 않고 pages/app이 callback과 데이터로 연결한다. Journal 목록 summary DTO와 Document detail DTO는 용도가 다르며 full detail 모델을 억지로 공유하지 않는다. 생성 service는 반환 id를 navigation에 전달하고 Editor는 그 id로 상세를 확인한다.

- 서비스 책임: `journalApi.getDetail`, `journalDocumentApi.getDocuments/createDocument`, `documentApi.getDocument/updateDocument/publishDocument/deleteDocument`, `attachmentApi.upload/delete`. Document 상세 parser가 attachments를 검증하고 문서 controller가 Registry에 병합한다. 별도 metadata resolver port/API를 만들지 않는다. content 로딩은 안정 Application URL과 서비스 경계로 처리한다. 이 이름은 책임 설명이며 기존 명명 규칙에 맞춰 조정 가능하다.
- 신규 조회는 작업실의 QueryManager를 주입받아 journal-detail, journal-document-list(journalId/limit와 고정 정렬의 cursor chain), document-detail(documentId)의 안정된 키·contract·정책을 선언한다. 개별 페이지 요청에는 해당 cursor를 포함하고 Journal/조회 조건이 바뀌면 cursor chain을 초기화한다. 화면별 별도 UI 캐시를 만들지 않는다.
- 초기 신규 조회 정책 제안은 `freshForMs: 0`, 미사용 GC 60초, focus 자동 재검증 off다. 페이지 진입/명시적 새로고침과 mutation invalidation으로 다시 확인한다. 이는 이 기능의 제안이며 Project 30초/5분 TTL을 복사한 값이 아니다.
- Title/content/registry·저장 중 snapshot·dirty generation은 documentId별 controller가 소유한다. 동일 세션에서 하나의 Document에 하나의 save queue만 두고, unmount 후 새 controller가 이전 in-flight 요청과 경쟁하지 않게 이전 요청의 종료/불확실 상태를 관리한다.
- create/delete는 해당 Journal 목록, save/publish는 document detail·열려 있는 Journal Document 목록을 무효화한다. 상위 Journal ID를 Document 모델에 넣지 않고 collection service/app의 구독·invalidation 연결로 처리한다.
- 기존 JournalStore의 상세는 편집을 위한 검증된 snapshot이고 신규 Viewer의 managed detail은 읽기 projection이다. app의 journals.onInvalidate 연결에서 기존 Dashboard 갱신을 유지하면서 Viewer 상세도 무효화한다. 수정 후 Viewer 재조회가 실패하면 stale/error를 표시하고 오래된 값을 최신으로 확정하지 않는다. 같은 Journal을 양쪽에서 별도로 수정 가능한 draft/cache 권위로 만들지 않는다.
- Journal 삭제 시 해당 context 목록·열린 자식 Document의 사용 가능 상태를 다시 확인한다. Frontend가 Attachment/MinIO 삭제를 연쇄 호출하지 않는다. 실제 cascade와 삭제 결과는 disposable 통합 환경에서 검증한다.
- 세션 종료/계정 전환은 Query·draft·registry·timer·요청을 폐기한다. 동일 신원 재확인 시 title/content와 그 본문이 참조하는 성공 업로드 metadata·registry mapping을 기존 handoff 패턴으로 메모리 보존한다. 아직 PUT되지 않은 TEMP 파일은 detail.attachmentIds에 없으므로 detail만으로 복원하지 않는다. cache/queued mutation을 복구하지 않으며 미확정 save/publish/upload를 자동 replay하지 않는다. 관계 복원이 끝나기 전 save를 막고 보존된 Editor를 server snapshot으로 강제 reset하지 않는다.

### 6. 실제 DTO·API·전송 계약

| 작업      | Endpoint                                       | 요청                            | 성공                         |
| --------- | ---------------------------------------------- | ------------------------------- | ---------------------------- |
| 생성      | POST /api/v2/journals/{journalId}/documents    | {title, content}                | 201 Document detail, DRAFT   |
| 목록      | GET /api/v2/journals/{journalId}/documents     | limit, cursor                   | 200 {items,total,nextCursor} |
| 상세      | GET /api/v2/documents/{documentId}             | 없음                            | 200 Document detail          |
| 저장      | PUT /api/v2/documents/{documentId}             | {title,content,attachmentIds}   | 200 Document detail          |
| 게시      | POST /api/v2/documents/{documentId}/publish    | 본문 없음                       | 200 Document detail          |
| 문서 삭제 | DELETE /api/v2/documents/{documentId}          | 본문 없음                       | 200 {deletedId}              |
| 업로드    | POST /api/v2/attachments                       | multipart documentId + file 1개 | 201 Attachment, TEMP         |
| 첨부 내용 | GET /api/v2/attachments/{attachmentId}/content | 없음                            | 200 binary                   |
| TEMP 삭제 | DELETE /api/v2/attachments/{attachmentId}      | 본문 없음                       | 200 {deletedId}              |

- Document detail: id, documentSpaceId, title, content, attachmentIds, **attachments**, status, authorId, createdAt, updatedAt, publishedAt. attachments는 생성·상세·저장·게시의 DocumentSnapshot 공통 필수 필드다. DRAFT의 publishedAt은 null. summary는 documentSpaceId/content/attachmentIds/**attachments**를 제외한다. PUT은 title/content/attachmentIds만 보내고 응답 전용 attachments는 보내지 않는다.
- Attachment metadata: id, documentId, originalFilename, contentType, size, status, contentUrl, createdAt. 업로드 AttachmentSnapshot의 status는 TEMP, 상세 attachments의 AttachedSnapshot은 ATTACHED다. 소유 Document를 확인한 성공 응답만 Registry에 등록한다. ID/author/status/audit를 요청에 임의 추가하지 않는다.
- title은 빈 문자열 허용·최대 200. content는 문자열이 아닌 JSON 배열이며 빈 배열 허용. 파싱된 content의 UTF-8 직렬화 기본 한도는 1,048,576바이트(1MiB), 전체 JSON 요청 기본 한도는 1,114,112바이트(content 한도 + 65,536)다. DOCUMENT_CONTENT_MAX_BYTES로 content 한도를 설정하며 실행 환경의 유효값을 확인한다. 중첩 깊이 최대 100 위반은 400, byte 초과는 413이다. attachmentIds는 필수 UUID 배열·중복 없이 최대 100개다. 입력 제한 초과 시 내용을 자르거나 초기화하지 않는다.
- 업로드는 PNG/JPEG/PDF/UTF-8 TXT, 빈 파일 거부. 기본 파일 한도는 10,485,760바이트(ATTACHMENT_MAX_BYTES), multipart 전체는 11,534,336바이트(ATTACHMENT_REQUEST_MAX_BYTES)다. 본문·JSON 요청·파일·multipart 한도를 서로 구분하고 설정값을 immutable 제품 상수로 가정하지 않는다. filename 제한은 실제 환경과 대조한다. Content-Type boundary는 브라우저가 생성하며 JSON과 FormData를 동시에 보내지 않는다.
- 기존 client의 15초 timeout은 업로드 전송 속도와 실제 저장 시간을 고려해 별도 선택 가능 여부를 검토한다. Nginx에 client_max_body_size가 명시되지 않은 현재 설정을 보완하고, multipart 여유를 포함한 전체 요청 크기와 proxy timeout을 실제 Vite/Nginx 경로에서 검증한다. MinIO secret은 Frontend에 추가하지 않는다.
- content는 인증된 binary stream이며 PNG/JPEG는 inline, PDF/TXT는 Content-Disposition에 따른 다운로드다. range/cache 지원을 가정하지 않고 안정 상대 contentUrl을 사용한다. redirect:'error'를 전역 해제하거나 presigned URL을 본문에 저장하지 않는다.
- 모든 변경에 기존 cookie/CSRF/Origin 규칙을 적용한다. X-Workspace-Data-Revision은 10진 문자열로 기존 freshness에 연결하며 Number나 문서 편집 revision으로 취급하지 않는다.
- 오류는 {code,message,fieldErrors,requestId}. 400/401/403/404/409/413/415/500/503과 네트워크 실패를 구분한다. 프록시가 반환한 비 JSON 413도 안전하게 표시한다. 정확한 409 코드는 실제 응답과 대조한다.
- 문서 DELETE 200은 DB 삭제와 파일 정리 작업 영속화이며 물리 파일 삭제는 지연될 수 있다. TEMP DELETE 200은 파일·metadata 삭제 완료다. 503 후 삭제 claim이 유지될 수 있으므로 자동 반복 삭제·재연결하지 않는다.
- 생성·업로드 timeout은 결과 불명확으로 표시한다. 문서는 목록 재확인 후 사용자 선택으로 복구하되 제목/시간만으로 생성 성공을 확정하지 않는다. 응답 유실 TEMP를 임의 URL로 복원하지 않으며 중복 가능성을 안내하고 명시적 재업로드만 허용한다.
- 개발용 Mock dataset/handler/metadata resolver/preview mode/fallback은 만들지 않는다. 기존 타 기능 fixtures는 보존한다. 새 기능의 API 모킹 fixture 대신 실제 disposable API와 브라우저에서의 응답 지연·차단으로 장애를 검증하고, 순수 controller 단위 테스트의 deferred Promise는 서버 대체 구현과 구분한다.

### 7. BlockNote Editor와 Read-only Viewer

승인 후 React 19/TypeScript/Vite 호환 버전을 설치·고정하고 lockfile을 기록한다. 작성 시 공식 release 목록에는 0.54.2가 확인되지만 설치·호환성을 검증한 버전은 아니다. `@blocknote/core`·`@blocknote/react`와 하나의 공식 UI binding만 선택한다. 기존 UI library가 없으므로 Mantine binding을 우선 검토하되 필수 peer dependencies·bundle·CSS/portal 충돌을 확인하고 앱 전체를 Mantine 디자인 시스템으로 전환하지 않는다. [공식 설치 안내](https://www.blocknotejs.org/docs/getting-started), [release 기록](https://github.com/TypeCellOS/BlockNote/releases).

- 공용 Editor는 별도 TitleInput + BlockNote Editor로 구성한다. title과 `editor.document`의 snapshot을 같은 save unit으로 다룬다. 저장 전 Markdown/HTML/자체 schema 변환을 하지 않는다.
- 설치한 버전의 기본 paragraph, heading, bullet/numbered/check list, toggle heading, toggle list, quote, code block, table, image, file을 검증한다. 공식 예시는 toggle heading의 `isToggleable`, toggleListItem을 제공한다. 필수 기능이 없으면 임의 Custom Block으로 우회하지 않고 버전/요구 충돌을 기록한다. [Built-in Blocks](https://www.blocknotejs.org/docs/features/blocks).
- bold/italic/underline/strike/link/text color/background color, slash 삽입, block 추가·삭제·drag/reorder·indent/outdent·지원 type 변경은 기본 toolbar/menu/handle을 사용한다. 한글 IME 입력 중 조합 상태를 깨거나 매 입력마다 Editor를 재생성하지 않는다.
- 기본 Emoji가 선택 버전에 있고 자연스럽게 통합되는 경우만 사용한다. 별도 Emoji/Custom Slash/AI/Comment 시스템은 추가하지 않는다.
- 공통 BlockNote 구성과 content를 Viewer에서 재사용하되 editable=false와 menu/toolbar/handle 비활성화를 명시한다. Slash/Side/Drag/Formatting/편집용 Link toolbar/File panel/Table handle 및 editable caret가 없어야 한다. 일반 텍스트 선택·복사, 링크/첨부 열기와 읽기용 Toggle 펼치기는 유지한다. Viewer에서 checklist 클릭·paste/drop·키보드 입력이 content 변경이나 save를 유발해서는 안 된다. [React props](https://www.blocknotejs.org/docs/react/overview).
- detail 로딩 전 빈 Editor를 먼저 mount해 자동 저장하지 않는다. JSON이 손상되거나 지원하지 않는 content이면 오류로 멈추고 빈 content로 overwrite하지 않는다. 같은 documentId의 배경 응답은 dirty Editor를 reset하지 않으며 다른 documentId 진입은 수명을 분리한다.
- route별 lazy loading을 검토해 일반 Journal 목록에 editor bundle을 불필요하게 싣지 않는다. font/color/spacing/focus/overlay는 기존 토큰에 맞춰 Document 영역에 한정한다.

### 8. Autosave·Publish·실패 복구

초기 debounce 제안은 1.5초다. 단위 테스트는 fake timer로, 브라우저는 실제 입력·느린 응답으로 검증한다. 저장 UI는 `저장 중... / 저장됨 / 저장 실패`를 제공하며 dirty 상태를 저장됨으로 표시하지 않는다.

1. 초기 detail 적용은 clean 상태다. title/content/첨부 활성 집합 변경 시 입력 세대를 증가시키고 DIRTY로 전환한다. selection-only 변화는 save하지 않는다.
2. debounce 후 title/content/attachmentIds와 세대 번호를 불변 snapshot으로 잡아 PUT 하나만 보낸다. request가 진행 중이면 새 PUT 대신 최신 pending snapshot을 유지한다.
3. A 저장 중 입력 B가 발생하면 입력은 유지하고, A 성공은 A 세대만 확인한다. 현재 입력·선택·undo 상태를 A 응답으로 덮지 않는다. B가 남으면 최신 snapshot으로 다음 save를 수행한다. 마지막 요청까지 성공해야 SAVED다.
4. 실패하면 ERROR와 현재 title/content/registry를 유지하고 queue 자동 반복을 멈춘다. validation/403/404/네트워크·timeout/결과 불확실성을 구분하며 명시적 재시도·재조회/확인 경로를 제공한다. 불확실 PUT을 서버 반영 실패로 단정하거나 인증 복구 뒤 자동 replay하지 않는다.
5. background refetch, 오래된 documentId 응답, session generation 변경, unmount 뒤 응답은 입력을 변경하지 못한다. 같은 문서 재진입 시 확인된 상태와 남은 미확정 저장을 먼저 조정한다.
6. Publish는 다른 Publish/Delete와 상호 배제한다. 클릭 시 입력·첨부 조작을 잠시 잠그고 in-flight upload/save가 끝나는 경계를 만든다. 업로드 실패/미완료 상태는 먼저 해결하도록 안내한다. 최신 generation의 title/content/attachmentIds를 flush하고 성공을 확인한 후에만 POST publish한다.
7. flush 실패 시 publish 요청은 **0회**여야 한다. publish 실패 시 저장된 draft와 현재 입력을 유지하고 재시도를 제공한다. 성공 응답이 유실되면 detail을 조회해 상태를 확인하고 무조건 POST를 반복하지 않는다.
8. publish 성공 후 응답 또는 확인된 detail의 PUBLISHED/publishedAt을 표시하고 Viewer로 이동한다. 로컬에서 status를 미리 확정하지 않는다. 제목/본문이 바뀐 채 이전 snapshot을 게시하는 순서 역전을 방지한다.
9. PUBLISHED 문서도 같은 PUT으로 수정하며 최초 publishedAt과 PUBLISHED 상태를 유지한다. 저장된 변경을 재게시 전 비공개 상태로 안내하지 않는다.
10. Document 삭제는 진행 중 save/upload/publish와 조정하고 별도 확인 후 수행한다. 삭제 실패·불확실 결과는 draft를 버리지 않는다. 성공 시 context 목록을 갱신하고 안전한 복귀 경로로 이동한다.

### 9. Attachment Registry와 수명

BlockNote의 `uploadFile` hook은 Attachment service를 호출해 검증된 안정 contentUrl을 반환하고, 필요하면 `resolveFileUrl`로 표시 URL만 해석한다. image picker/drop/clipboard paste와 file picker가 같은 adapter·실패 경로를 사용한다. [공식 File Panel 문서](https://www.blocknotejs.org/docs/react/components/image-toolbar).

- Registry는 attachmentId/contentUrl/originalFilename/contentType과 document 소유 확인 정보를 관리한다. 업로드 성공 후 등록하고 성공/실패/pending 상태를 파일 단위로 표시한다. 숫자 progress를 얻을 수 없으면 가짜 백분율 대신 진행 중 표시를 사용한다.
- 상세 parser는 attachmentIds와 attachments의 길이·최대 100개·UUID 순서·중복 없음·각 ID 일치·documentId 일치·ATTACHED 상태와 필수 metadata를 검증한다. 정상 무첨부는 두 배열 모두 []다. 누락/불일치와 INTERNAL_ERROR를 빈 Registry로 보정하지 않고 재조회 안내와 저장 차단으로 처리한다.
- Registry는 서버가 확인한 ATTACHED snapshot과 같은 세션의 TEMP/Undo용 metadata를 구분한다. 저장 응답의 attachments로 전체 메모리를 교체하지 않는다. snapshot에 없는 성공 업로드 TEMP와 detach 후 Undo/Redo에 필요한 metadata는 유지하되, 이를 현재 ATTACHED라고 단정하거나 다음 attachmentIds에 자동 포함하지 않는다. 실제 본문 참조로만 다음 저장 집합을 결정한다.
- 저장 A 중 새 첨부 B 업로드가 성공한 뒤 A 응답이 도착해도 B의 TEMP metadata와 최신 입력을 보존한다. 다음 저장은 최신 본문과 B를 포함하고 성공 응답에서 ATTACHED로 확인한다. 응답 병합은 해당 documentId/session/save generation 기준으로 수행하며 늦은 snapshot이 새로운 확인 상태를 덮지 못한다. 삭제 성공·서버에서 사용 불가로 확인된 첨부는 Undo로 자동 재연결하지 않고 오류/재업로드 경로를 제공한다.
- save snapshot을 만들 때 실제 `editor.document`의 nested children을 포함해 Image/File 참조를 순회하고 Registry와 대조한다. 현재 사용 중인 서비스 Attachment ID를 중복 없는 집합으로 보내며, 일반 외부 링크를 서비스 첨부로 추정하지 않는다.
- 같은 첨부를 두 block이 쓰면 한 block 제거만으로 ID를 빼지 않는다. block 삭제/URL 교체 시 마지막 참조가 사라졌을 때 활성 목록에서 제외한다. undo/redo로 참조가 돌아오면 registry 정보가 남아 있어야 한다.
- 업로드 중 block 제거, 문서 이동, 취소, 여러 파일 중 하나 실패, 늦은 성공 응답을 검증한다. 현재 문서에 없는 파일을 자동 삽입하거나 성공한 다른 파일을 지우지 않는다. 미완료 업로드를 완료된 첨부처럼 save/publish하지 않는다.
- ATTACHED 파일은 block 제거 후 save 성공으로 TEMP가 된 뒤에만 명시 삭제할 수 있다. 자동 hard delete로 undo를 깨지 않으며 기본 정리는 서버 grace cleanup에 맡긴다. 409 ATTACHMENT_IN_USE는 관계 재확인과 안내로 처리한다.
- 다른 Document의 attachment URL을 paste해 현재 Document 소유 ID로 승격하지 않는다. backend가 소유권을 검증하며 실제 잘못된 관계 거부를 검증한다.
- 새 문서 로드·새로고침에서는 동일 DocumentSnapshot의 content/attachmentIds/attachments로 Registry를 복원한 뒤 편집을 허용한다. 동일 신원 handoff 시에는 위 병합 규칙으로 미저장 TEMP metadata를 보존한다. metadata가 부족하면 기존 IDs를 조용히 비우거나 모든 IDs를 영구 유지하는 임시 우회 대신 저장을 멈추고 복원 오류/재시도를 제공한다. 별도 metadata 네트워크 조회는 필요하지 않다.
- MinIO URL/bucket/objectKey/presigned URL은 content에 저장하지 않는다. same-origin media 요청의 401/403·content-type·download filename·proxy size 제한을 실제 API로 검증한다. PNG/JPEG는 inline, PDF/TXT는 다운로드하며 range/cache 지원을 가정하지 않는다.
- native image/file 요청은 JSON client의 auth callback을 거치지 않으므로 load error를 파일 단위로 표시하고 기존 세션 재확인·retry 경로를 연결한다. 문서 전체를 빈 Editor로 바꾸지 않는다. resolver가 만든 Object URL은 소비자 수명 종료 시 revoke한다.

### 10. 기존 Modal 제거와 회귀 경계

| 대상                                   | 변경/보존 계획                                                                                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ApiJournalWorkspace                    | 상세 `detail` state·setDetail trigger·close handler·detail Modal JSX 제거, row callback을 route 이동으로 변경                                                                                           |
| ApiRecentJournals / ApiProjectJournals | ApiRecentJournals의 상세 state/Modal 제거. ApiProjectJournals는 navigation callback을 전달하고 기존 생성 state/ApiJournalEditor를 유지. 최근 3개·Project context 보존                                   |
| Home WidgetDataContent의 JournalData   | 기존 `onNavigate`를 전달해 Journal Page 이동. 상세 Modal과 미사용 useState/Modal import 제거. Dashboard에 새 Document 작성 버튼이나 Project Document 연동은 추가하지 않음                               |
| ApiJournalEditor·startEdit             | 기존 Journal 생성/수정, direct detail GET, locked Project, revision, handoff를 보존. Document 작성과 구분된 이름/행동 유지                                                                              |
| 삭제 확인/공유 Modal                   | Journal 삭제 확인과 controls의 범용 Modal은 유지. Viewer가 대체하는 읽기 상세 Modal과 역할이 다름                                                                                                       |
| 스타일                                 | 제거된 상세 전용 selector만 사용처 검색 후 삭제. 공유 `.detail-body`, 목록 row/form/Project/mobile CSS는 다른 소비자가 있어 일괄 삭제하지 않음                                                          |
| isolated legacy prototype              | JournalWorkspace/JournalEditor/RecentJournals/저장소는 별도 기존 회귀 진입점에만 남음. 이번 인증 앱에서 읽기 Modal fallback으로 재사용하지 않는다. 전체 prototype 폐기는 범위 밖이라는 유지 이유를 기록 |

전환 후 인증 앱에서는 읽기용 Journal Modal과 Viewer를 병행하지 않는다. 정적 사용처 조사와 Journal 목록·Project 최근 목록·Dashboard 위젯의 실제 클릭 검증으로 잔여 진입을 확인한다.

### 11. 실행 Sessions

#### Session 1 — 기준·계약·환경 확인

- 현재 source/Router/Modal/요구사항과 live OpenAPI를 다시 확인하고 snapshot·수용 기준을 기록한다. BlockNote 호환 버전/UI binding과 기존 검사 명령을 확정한다.
- 실제 Backend checkout, disposable DB/OIDC/파일 저장소의 실행 조건을 확인한다. 확정된 DocumentSnapshot.attachments 계약과 환경별 요청 용량을 다시 대조한다. metadata 제공 방식은 결정 완료이며 실제 권한·일관성·복원 검증은 실행 결과로 남긴다.

#### Session 2 — Service·실제 API·multipart 기반

- collection/detail/update/publish/delete/attachment service·DTO parser를 구현하고 기존 transport에 FormData를 추가한다. 실제 API만 사용하고 Mock preview는 만들지 않는다.
- UUID/JSON 배열/읽기 전용 필드 제외/전체 교체/응답 상태/metadata를 검증한다. CSRF·401·취소·session generation·JSON 기존 회귀와 Vite/Nginx 업로드 제한을 확인한다.
- content와 전체 JSON 요청 크기를 별도로 검증한다. 유효한 JSON에서 허용 한도 직전/정확한 한도/초과, content 자체는 허용되지만 요청 공백 등으로 전체 body 한도만 초과하는 경우, UTF-8 다중 바이트 및 depth 100 경계를 포함한다. 파일 한도와 multipart overhead를 포함한 전체 한도도 각각 검증한다. 400/413 발생 시 현재 입력·Registry 보존과 publish 0회를 확인하고, Nginx 비 JSON 413도 같은 안전한 실패 UX로 처리한다.

#### Session 3 — Journal Viewer와 상세 진입 전환

- 실제 Journal detail을 표시하고 Router·safeReturnTo·shell metadata를 확장한다. 목록/Project/Home 읽기 Modal을 함께 제거하고 navigation callback으로 연결한다.
- 직접 URL/reload/back-forward/login returnTo/잘못된 경로/필터 복귀/focus/상세 오류를 검증한다. 기존 Journal 생성·수정·삭제 확인 Modal은 유지한다.

#### Session 4 — Journal Documents 목록·새 글 작성

- summary 목록·cursor 더 보기·빈 상태·retry와 명시 context 선택 → 실제 201 생성 → Editor route를 구현한다. pending 중복 클릭을 막는다.
- Journal A/B 격리, limit 1/20/100·잘못된 cursor·추가 페이지 실패 보존을 검증한다. 빈 Journal 선택기에서 기존 일지 작성 후 명시 재선택을 요구한다. POST 응답 유실 시 자동 재생성 0회와 결과 확인 흐름을 검증한다.

#### Session 5 — 공용 BlockNote Editor·Viewer

- 호환 버전/binding 설치·고정, TitleInput/Editor/Viewer·lazy loading·scoped theme를 구현한다. 상세 loading/403/404/손상 JSON에서 빈 content 자동 저장을 금지한다.
- 7절 전체 block/formatting/slash/drag/reorder/indent/type change/IME와 JSON round trip을 실제 조작한다. Viewer 편집 UI·PUT 0회, Journal context 없는 Document deep link를 확인한다.

#### Session 6 — 실제 Attachment·Registry

- uploadFile·image drop/paste·file picker·파일별 오류, nested/중복 참조·undo, 서버 metadata 복원과 인증된 콘텐츠 표시/다운로드를 구현한다.
- attachmentIds/attachments의 빈 배열·최대 100개·순서/소속/상태 일치와 parser의 누락·중복·불일치 거부를 단위 검증한다. 실제 저장·재조회에서 두 배열의 동일 snapshot 관계와 TEMP 제외를 확인한다. detach → save 응답 → Undo → 재저장 및 업로드 TEMP metadata 보존을 검증한다.
- 실제 binary·허용/거부 MIME·0byte·파일/요청 용량 경계·TEMP↔ATTACHED·타 문서 첨부·409·503·삭제 중 404를 검증한다. 업로드 중 제거/이동/늦은 응답/응답 유실에서 자동 업로드 재시도 0회를 확인한다. 복원 경로 미완료 시 이 Session을 완료 처리하지 않는다.

#### Session 7 — Autosave·Publish·세션 수명

- 1.5초 debounce, 문서별 직렬 queue, retry/reconciliation, publish flush, 삭제 상호 배제, unsaved guard·handoff·dispose를 구현한다.
- 느린 A 중 B/C → 최신 후속 snapshot, 동시 PUT 최대 1, 실패 시 입력 유지·publish 0회, 게시 응답 유실, PUBLISHED 재편집·반복 게시 최초 게시일 보존을 검증한다. 미저장 TEMP metadata handoff·계정 전환·지연 응답 차단, 같은 문서 재진입을 확인한다. 다중 탭 충돌 방지 보장은 명시적으로 제외한다.
- 저장 A 응답 지연 → 첨부 B 업로드 성공/본문 삽입 → A 응답 도착 → B를 포함한 다음 PUT → B의 ATTACHED 확인을 필수 회귀로 추가한다. A 응답이 최신 입력·TEMP metadata·Undo 기록을 지우지 않고 새로고침 후에도 B가 복원되어야 한다.

#### Session 8 — 통합·실제 Vite/Nginx·완료

- 기존 tests/real 진입점을 확장해 disposable workspace·파일 저장소에서 전체 읽기/작성/첨부/게시/삭제 흐름을 검증한다. 실제 환경의 실행 옵션·초기화·정리·증거 경로를 기록하며 존재하지 않는 runner flag를 가정하지 않는다.
- 기존 Journal CRUD·Project/Home/auth 회귀, 직접 URL/로그인 복귀, desktop/mobile/keyboard/시각 검토를 완료한다. 과거 Project E2E 3건 실패 등 기존 baseline을 구분하고 현재 변경으로 발생한 실패는 해결한다.
- 새 개발 Mock/fixture/fallback·secret이 source 및 production artifact에 없음을 확인한다. gate·필수 검증 미완료 시 proposed/active의 실제 상태를 유지하며 completed로 표시하지 않는다.

### 12. 계약 확인과 실제 검증의 완료 경계

Registry metadata는 별도 API 신설 없이 DocumentSnapshot.attachments로 제공되는 계약을 확인했다. 따라서 Backend 제공 방식 결정 gate는 해소됐으며, 실제 업로드·저장·새로고침·권한·메모리 병합 검증 gate는 남아 있다. [보완 요청](../requirements/document-editor-backend-followup.md)의 요청 이력과 구분하고 완료 시 공용 계약·요구사항·계획 목록의 미확정 표현과 DTO 예시도 최신 계약으로 동기화한다.

생성·업로드 idempotency와 문서 revision/ETag 신설은 이번 Frontend 완료의 필수 Backend 요청이 아니다. 현재 보장 범위에 맞는 순차 처리·명시적 복구·한계를 유지한다. Production 배포와 Backend 구현 변경은 별도 범위다.

## Validation

### Static

**계획 작성·수정 단계:** 문서 경로·기준 요구사항 대응·template 구조·proposed 상태·README 순서를 검토하고 `npm run check:docs`, 변경 문서의 포맷 검사, `git diff --check`를 수행한다. 코드·패키지를 수정하거나 build/unit/browser 테스트를 실행하는 단계가 아니다.

**승인 후 구현 단계:**

- Build: `npm run build` 성공(prebuild 조회 검사 + `tsc -b` + Vite).
- Type Check: 로컬 TypeScript의 `npx --no-install tsc --noEmit` 성공. 별도 typecheck script가 원래 존재한다고 기록하지 않는다.
- 구조·문서: `npm run check:boundaries`, `npm run check:queries`, `npm run check:docs`, `git diff --check`. query 검사의 한계를 보완해 직접 fetch·컴포넌트 Mock·feature 역의존을 리뷰한다.
- 포맷: `npm run format:check`와 변경 파일 개별 검사. 기존 repository 포맷 실패는 신규 실패와 분리하여 기록하고, 이번 변경 파일은 반드시 통과시킨다.
- Unit: `npm test` 및 Document controller/registry/DTO/route/auth의 가까운 기존 suite. snapshots·fake timer·deferred Promise로 저장 직렬화/세대/실패/flush를 검증하며 단순 구현 복제 테스트를 늘리지 않는다.
- Attachment transport를 확장하면 JSON 회귀, FormData boundary 자동 처리, CSRF·timeout·abort·401·계정 전환을 단위 검증한다.
- `node tools/check-auth-artifact.mjs`와 신규 Mock/fallback import 검토로 legacy 데이터·개발 fixture가 production 산출물에 포함되지 않는지 확인한다. 실제 API adapter와 업로드 proxy까지 검증한다.

### Runtime

기존 `playwright.journals.config.ts`와 `tests/journals`를 확장하여 Document의 인증된 shell 흐름까지 검증한다. 실행은 `npx --no-install playwright test --config playwright.journals.config.ts`를 사용한다. 4180 preview 서버를 재사용할 때는 기존 `JOURNAL_REUSE_SERVER=1` 규칙을 따른다. 새 기능 전용 config/runner를 만들지 않는다. 변경된 Home·auth·Project 진입은 기존 Dashboard/auth/관련 suite를 선택해 추가 실행한다.

기존 Journal suite의 API fixtures는 기존 CRUD 회귀용으로 유지한다. 신규 Document/Attachment 성공·영속성 검증은 tests/real의 실제 Backend 경로에서 수행하고 새 Document Mock 응답을 fixtures에 추가하지 않는다. 공통 브라우저 조작 helper를 재사용하되 두 검증의 증거를 구분한다.

| 검증 영역          | 합격 기준                                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 전체 읽기 흐름     | Journals → Journal Viewer → 해당 Journal Document 목록 → 공용 Document Viewer가 이어지고 상세 dialog가 열리지 않음                                                                                                                           |
| 전체 작성 흐름     | /journals 및 Journal Viewer의 새 글 action → 명시 context → 실제 DRAFT 생성 → Editor → 작성/첨부 → Autosave → 최신 저장 후 Publish → 목록/Viewer 반영                                                                                        |
| Journal 상태       | 목록 loading/empty/error·추가 페이지 실패, 실제 Detail loading/정상/error/권한·없는 ID, Document collection empty/error/retry가 서로 구분됨                                                                                                  |
| Route·인증         | 직접 URL/reload/back-forward/로그인 returnTo, 목록 filter 복귀, malformed route, sidebar·title/focus, 동일 신원 검증·계정 교체·401/403 후 늦은 응답 차단                                                                                     |
| Block              | Paragraph/Heading/Bullet/Numbered/Checklist/Toggle Heading/Toggle List/Quote/Code/Table/Image/File를 삽입·저장·복원하고 nested children 구조 보존                                                                                            |
| Formatting·조작    | Bold/Italic/Underline/Strike/Link/Text/Background Color, Slash, block 추가·삭제·drag/reorder·indent/outdent·지원 type 변경, 한글 IME와 keyboard 동작                                                                                         |
| Autosave           | title/content 양쪽 debounce, save state 전이, 최대 동시 PUT 1, A 진행 중 최신 입력 후 B, 오래된 응답이 현재 입력을 변경하지 않음                                                                                                             |
| Save 실패          | 현재 title/content/registry 유지, 서버 저장값 강제 rollback 없음, 명시적 retry·불확실 결과 확인, 손상 detail이 빈 content PUT으로 이어지지 않음                                                                                              |
| Publish            | pending save/upload를 조정하고 최신 PUT 성공 뒤 POST. 최종 PUT 실패 시 POST 0회, publish 실패 시 draft 유지, 중복/응답 유실·status 재조회 처리                                                                                               |
| Upload             | Image block·drag/drop·clipboard paste·File block, pending/success/error, 여러 파일 중 부분 실패, upload 중 제거·이동·세션 교체가 Editor 전체 장애를 만들지 않음                                                                              |
| Registry           | nested/중복/삭제/URL 변경/undo/redo에 따른 정확한 unique attachmentIds, 타 문서 첨부 거부, 저장 후 TEMP↔ATTACHED·409 처리                                                                                                                    |
| 새로고침·첨부      | 성공 저장한 title/BlockNote JSON/attachmentIds와 bytes/metadata 복원. stable contentUrl 유지, 실제 저장 상태와 binary/metadata 복원을 확인                                                                                                   |
| 첨부 오류          | 이미지/파일 content load failure·403/404·재시도 표시, metadata 복원 실패 때 ID를 조용히 제거하지 않음                                                                                                                                        |
| Read-only          | 편집 커서/Slash/Side/Drag/Formatting 등 편집 UI 없음, 입력·paste/drop·checklist 조작으로 변경/PUT 발생 0회, 링크·복사·읽기 Toggle 정상                                                                                                       |
| Document 오류·삭제 | loading/not found/access denied/save/publish/delete 오류별 안내와 재시도, 삭제 확인/실패 draft 보존·성공 후 복귀, Journal 삭제 뒤 열린 문서 처리                                                                                             |
| Modal·Journal 회귀 | list/Project/Home 읽기 Modal state/trigger 제거. 기존 Journal 생성·수정·삭제 확인, 수정 성공 후 Viewer title/body 재조회, 공용 Modal focus/Escape와 isolated legacy suite 정상                                                               |
| 시각·접근성        | desktop 1440×1000/1280×800, mobile 390×844/320px, landscape/200% zoom에서 overflow·toolbar portal·파일명·표 가로스크롤 확인. keyboard/focus/상태 aria-live·기존 대비 유지. 스크린샷을 직접 검토하며 DOM 통과만으로 시각 완료를 선언하지 않음 |
| 실제 통합·격리     | 실제 API/저장소/Vite/Nginx 흐름 성공, 검증 데이터 격리, 신규 개발 Mock·fallback·secret의 source/artifact 포함 0                                                                                                                              |

기존 disposable real harness를 확장해 실제 API·파일 저장소와 Vite/fresh Nginx를 검증한다. 실행 중 port 8080 작업실에는 검증용 mutation을 보내지 않는다. 인증·파일 저장소·metadata gate의 미완료를 단위/DOM 성공으로 대신하지 않는다. Backend 소스는 이 Frontend 계획에서 수정하지 않는다.

## Completion Criteria

- [x] Journal 목록·Project 최근 목록·Home Journal 클릭이 독립 Viewer Page로 이동하고 인증 앱의 이전 읽기 상세 Modal을 제거했다.
- [x] 실제 Journal Detail의 기존 필드·body와 Journal별 Documents loading/empty/error/목록을 정상 표시한다.
- [x] Journals Home 및 Viewer에서 Journal Context를 확인하고 DRAFT 생성 → 반환 documentId 기반 공용 Editor로 이동한다.
- [ ] 공용 Editor/Viewer가 같은 BlockNote JSON을 사용하며 모든 필수 block/formatting/조작 및 Read-only 제한을 검증했다.
- [x] title/content Autosave 직렬화·저장 상태·실패 입력 보존·최신 save 후 publish를 지연/실패/응답 유실까지 검증했다.
- [x] Image/File 입력·실제 upload·registry·현재 attachmentIds·안정 URL·새로고침 복원·파일별 실패를 검증했다.
- [x] navigation guard·동일 신원 handoff·계정 종료·오래된 응답 차단 및 기존 Journal CRUD 회귀가 통과했다.
- [ ] Build/Type Check와 기존 Repository의 관련 unit/browser/경계·조회·문서·포맷 검증이 통과하고 UI를 직접 검토했다.
- [x] 실제 API·저장소·Vite/Nginx 통합을 검증했고 신규 개발 Mock·fallback·secret이 source/artifact에 없다.
- [x] DocumentSnapshot.attachments의 실제 복원·권한·ID/순서/소속 검증, 저장 중 TEMP 병합과 detach 후 Undo 회귀를 통과했다. 다중 탭 충돌 방지의 제한은 유지한다.
- [x] content·전체 JSON 요청·파일·multipart의 개별 경계와 설정값을 검증하고 오류 시 입력/Registry 보존 및 publish 차단을 확인했다.
- [x] 구현 결과에 맞는 문서와 README 상태를 갱신했다. 위 기준 충족 전 완료 처리하지 않으며 현재는 PLAN-0026 실행에 따라 남은 검증을 후속 대기한다.

## Execution Record

- 2026-09-23 ?? ?? ??: ???? PLAN-0026 ??? ??? ????. ?? active ??? ?? ? ??? ?? ??? ?? ??? ?? proposed? ????. ?? ?? ????? ??? ???? ??? ??? ??? ???.

- 2026-09-23 구현: Journal Viewer·Document Editor/Viewer·직렬 자동 저장·게시·첨부·세션 수명·proxy를 구현했다. 239 unit, Journal 15, Dashboard 9, 신규 인증 경로 2건 및 disposable 실제 Vite/Nginx 통합을 통과했다. Production 배포와 Backend 변경은 수행하지 않았다.
- 2026-09-23 검증 범위: 기본 block/서식 JSON 복원·재저장과 핵심 입력은 통과했다. 모든 toolbar/drag/reorder/indent/type 변경의 개별 조작 증거는 남아 있어 해당 완료 기준을 미체크로 유지한다. 기존 auth suite 문구/fixture 불일치 19건과 과거 계획의 외부 링크 33건 실패는 신규 변경 검사와 구분한다. 세부 근거와 한계는 [구현·검증 기록](../reviews/plan0025-document-editor/readme.md)을 따른다. 전체 gate 충족 전까지 active를 유지한다.

- 2026-09-23: 사용자가 최종 보완 계획의 실행을 승인했다. active 전환 후 Session 1부터 실제 API 기반 구현·검증을 시작한다.

- 2026-09-22: Mock 기반 UI/UX 계획을 proposed로 등록했다. 구현은 시작하지 않았다.
- 2026-09-23: 사용자의 문서 수정 요청으로 실제 API 연동 계획으로 전환했다. live Swagger/OpenAPI의 9개 operation을 확인하고 확정 계약·Registry 복원 gate·multipart/proxy·실제 acceptance를 반영했다. 이는 계획 수정 승인이며 구현 활성화 승인이 아니다. Frontend 소스·패키지·Backend·업무 데이터는 변경하지 않았다.
- 2026-09-23 최종 검토 반영: 보완된 Swagger의 필수 attachments/AttachedSnapshot을 반영하고 별도 resolver 구상을 제거했다. Registry 검증·TEMP/Undo 병합·저장 A 중 업로드 B 회귀, 전체 JSON 1,114,112바이트 및 개별 용량 경계를 추가했다. 계약 확인 완료와 실제 통합 검증 대기를 구분하며 proposed 상태를 유지한다.
