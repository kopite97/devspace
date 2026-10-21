# PLAN-0033 디자인 구현 검증

Date: 2026-10-21

[PLAN](../../plans/PLAN-0033-design-consistency-and-readability.md)의 디자인 구현과 관련 검증을 완료했다. 기준 소스는 `aaeaaa1`이며 커밋·배포하지 않았다. 5173 직접 검토와 격리 검증에서 일지 모달 간격 및 GitHub 오류 안내의 버튼 줄바꿈을 추가 수정했다. PLAN은 `completed`다. 전체 문서 API 통합 검사의 통과를 뜻하지 않으며, 아래에 범위 외 실패를 보존한다.

## 잔여 실행 결과

사용자가 PLAN을 마저 진행하도록 요청하여 자동 검증을 재개했다. 실제 사용자 브라우저는 5173만 사용했다. 별도 격리 API 검증은 기존 `tests/real/` 도구를 사용했다. 기본 4175는 다른 프로젝트가 사용 중이어서 종료하거나 재사용하지 않았다. `REAL_FRONTEND_PORT`로 4186을 지정하고 테스트 OIDC callback도 정확히 그 loopback origin에 맞췄다. 사용자 8080/5173과 Docker Compose 이름·설정은 변경하지 않았다.

### 추가 디자인 수정

GitHub 요청 제한 오류에서 긴 안내문과 재시도 countdown이 버튼 폭을 밀어내어 `다시 확인`이 한 글자씩 줄바꿈됐다. `.github-workspace .notice`에 줄바꿈과 간격, 문단의 유연한 폭, 버튼의 축소 방지를 적용했다. 문구·시간·재시도 handler·disabled 조건은 유지했다. [390px 오류 안내](after/remaining/rate-limit-390.png), [320px](after/remaining/rate-limit-320.png), [실제 5173 최종 GitHub 화면](after/local-github-final.jpg).

### 보완한 검증

| 항목                            | 결과·근거                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 최종 빌드                       | 통과. query policy/TypeScript/Vite 포함. 기존 chunk 크기 경고 유지                                                                                                                                                                                                                                                                                                                                                                                |
| 마지막 일지 모달 수정 후 회귀   | 36/36 통과                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 마지막 GitHub 안내 수정 후 회귀 | 37/37 단일 실행 통과                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 구조 경계                       | 248개 파일, 924개 import 통과                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 연결 글 페이지 경계             | 임시 DB에 실제 21건 생성. 첫 20건/로딩/500 오류/재시도 후 21건, 버튼 유무·목록 유지·가로 overflow를 1440/390/320에서 확인. [결과](after/remaining/journal-detail-result.json), [로딩 320](after/remaining/journal-more-pending-320.png), [오류 320](after/remaining/journal-more-error-320.png), [마지막 행→footer 320](after/remaining/journal-more-complete-320.png)                                                                            |
| GitHub 시각 상태                | 기존 fixture로 미리보기/부분 결과/요청 제한/접근 상실/연결 결과를 desktop/390/320/native 200%에서 검증. 4개 모드 통과. [미리보기 200%](after/remaining/preview-zoom200.png), [부분 결과 320](after/remaining/partial-result-320.png), [접근 상실 320](after/remaining/access-denied-320.png)                                                                                                                                                      |
| 모달 native 200%                | 프로젝트/카테고리/태스크/마일스톤/저장소/링크/일지 검색/일지 작성/일지 선택/새 글 확인/위젯 11종. 가로 overflow 없음, 마지막 버튼까지 내부 스크롤 가능, Tab이 모달 안에 있고 닫기 가능. [태스크 하단](after/remaining/modal-task-zoom200-bottom.png), [새 글 확인](after/remaining/modal-create-confirm-zoom200.png), [저장소](after/remaining/modal-repository-zoom200-bottom.png), [위젯 하단](after/remaining/modal-widget-zoom200-bottom.png) |
| 실제 문서 UI                    | `REAL_FRONTEND_PORT=4186 node tests/real/run.mjs --document-ui` 통과. 생성/직렬 저장/응답 유실 복구/발행/블록 복원/업로드·다운로드/접근 제한/이동 보호/삭제 확인/21건 페이지 이동 및 오류 복구. [결과](after/remaining/documents-ui-result.json)                                                                                                                                                                                                  |
| 실제 인증·proxy                 | callback/PKCE/reload/CSRF/Origin/logout 및 인증에 의한 업무 데이터 생성 없음 통과. [결과](after/remaining/session-proxy-result.json)                                                                                                                                                                                                                                                                                                              |

native zoom은 새 격리 Chromium 프로필의 실제 200% 설정이며 CSS zoom으로 대체하지 않았다. 긴 페이지를 스크롤한 뒤의 native zoom 캡처가 비거나 잘리는 Chromium 캡처 문제가 있어, 확대 배율은 유지한 채 높이를 늘리고 맨 위에서 재촬영했다. 모달 캡처는 1440×1000 브라우저의 내부 스크롤 전후다. 실패했던 임시 모달 검사는 빈 fixture에 선택할 일지가 없었던 것과 닫기 버튼의 중복 locator 때문이었으며, 대표 일지를 넣고 모달 범위 locator로 최종 재실행하여 통과했다. 이 임시 캡처 파일은 실행 디렉터리에서 제거하여 `.auth-validation/design-remaining.completed.txt`에 보관했다.

### 완료 판정과 범위 외 실패

최종 변경 파일의 Prettier와 `git diff --check`를 통과했고, 변경 문서의 상대 링크 106개가 모두 존재함을 확인했다. 마지막 JSX 변경은 형식 정리이며 handler/조건/필드/키보드 순서 diff를 다시 확인했다.

디자인 검증은 변경된 경계 구조별 대표 상태와 기존 상태 회귀를 결합했다. 같은 템플릿의 모든 오류 문자열·데이터 개수·viewport의 전체 곱을 촬영한 것은 아니다. 통계 없는 프로젝트 위젯처럼 현 컴포넌트에서 생성되지 않는 조합은 새 기능/데이터로 만들지 않았다. 기존 동일 fixture 전후 근거와 5173/격리 환경의 변경 후 근거를 구분했다.

전체 `--documents`는 1,114,156-byte raw PUT 요청에서 `ECONNRESET`로 다시 실패했다. 이 요청은 에디터를 거치지 않는 서버 용량 경계 검사다. 전체 검사의 413 기대를 완화하지 않았고, `--document-ui`는 그 raw JSON/파일 경계 블록만 제외한 별도 실행으로 결과에 `apiBoundaries: false`를 기록한다. 이후의 문서 접근 제한·삭제·페이지 이동 검사는 그대로 수행했다. 백엔드 용량 정책이나 문서 기능을 변경하지 않았다.

`--documents --nginx`도 시도했으나 기존 harness가 배포 번들에 없는 `/src/features/journal/documentCollection.ts`를 동적 import하는 단계에서 실패했다. Nginx 전체 통합 통과로 기록하지 않는다. 이 두 제한과 아래에 기록한 기존 회귀 실패 10개, PLAN-0006–0008 링크 오류는 디자인 범위 밖이다. PLAN-0025와 서버 설정을 변경하지 않고 이번 디자인 작업을 완료한다.

## 5173 후속 검토

이 절과 아래 기존 실행 결과는 잔여 실행 요청 전의 기록이다. 최종 판정은 위의 잔여 실행 결과를 따른다.

사용자는 별도 5183 대신 이미 열린 5173 화면에서 진행하도록 지시했다. 이 후속 검토에서는 다른 서버나 자동 테스트를 실행하지 않았다. 기존 검사 결과는 아래에 보존하되, 추가 수정 이후 재실행한 결과로 간주하지 않는다.

확인한 화면은 프로젝트 현재/보관 목록, 카테고리/프로젝트/마일스톤 모달, GitHub 계정·저장소 선택·Issue 5건·선택 미리보기·동기화 설정·작업 결과, 작업 보드·빈 휴지통·태스크 모달, 자료실·링크 모달, 일지 검색·일지 선택·생성 확인, 홈 위젯 추가·배치 편집·설정, 계정 메뉴다. 문서 Viewer/Editor는 앞선 동일 5173 검토 결과를 유지한다. 모바일 메뉴와 모달 닫기/취소 복귀, 320×600에서 내부 스크롤로 하단 버튼에 도달하는 것도 확인했다. 브라우저의 임시 viewport 설정은 검토 후 해제했다.

### 추가 수정

일지 선택창은 설명과 선택 버튼이 붙어 있었고, 새 글 확인창은 제목·일지명·날짜·안내 문장이 간격 없이 이어졌다. 다음 변경만 추가했다.

- `ApiJournalWorkspace.tsx`: 기존 안내에 `modal-intro`, 선택 버튼과 작성 버튼에 표현용 class 추가.
- `CreateDocumentDialog.tsx`: 기존 문단에 제목·메타·설명 class 추가. 생성/취소 handler 및 오류 표시 조건 유지.
- `journal/styles.css`: 선택 버튼 전체 폭/왼쪽 정렬/8px 간격, 작성 버튼 상단 16px, 확인 문단의 13–15px 글자·1.6 행간·여백.

| 동일 5173 데이터·320×600 비교 | 변경 전                                   | 변경 후                                  |
| ----------------------------- | ----------------------------------------- | ---------------------------------------- |
| 일지 선택                     | [전](before/local-journal-picker-320.jpg) | [후](after/local-journal-picker-320.jpg) |
| 새 글 확인                    | [전](before/local-create-confirm-320.jpg) | [후](after/local-create-confirm-320.jpg) |

수정 후 desktop/320×600에서 직접 열어 확인했다. 문구·일지 순서·버튼 수가 유지되고, 가로 overflow와 버튼 잘림이 없었다. 확인창의 취소로 원래 목록에 복귀했다. 초안 생성, Issue 가져오기, 설정 저장, 위젯 배치 저장은 실행하지 않았다.

### 보완한 경계 검증

- GitHub 선택 미리보기: [desktop](after/local-github-preview-desktop.jpg), [320px](after/local-github-preview-320.jpg). 선택 막대 위 선과 미리보기 위 선 사이에는 실제 선택 조작부가 있어 서로 다른 경계다. 추가 선 삭제는 하지 않았다.
- GitHub 작업 결과: [320px](after/local-github-result-320.jpg). 실제 완료 상태와 긴 작업 ID 줄바꿈 확인. 설정/결과 탭의 선택 상태와 저장소 다음 섹션 경계 유지.
- [태스크 모달 320×600 하단](after/local-task-modal-320.jpg): 내부 스크롤 후 상세 입력과 취소/저장 버튼이 표시되며 취소 복귀 확인.
- 마일스톤 입력은 320px에서 computed 16px 및 최소 44px 높이, 가로 overflow 없음. 카테고리·링크·저장소 선택 모달도 좁은 화면에서 확인했다.

현재 연결 글은 2건으로 `더 불러오기` 상태는 재현되지 않았다. 검토를 위해 실사용 데이터를 추가하지 않았다. 전체 하위 화면의 native 200%와 대용량 문서 기능 검증은 이번 5173 검토에서 수행하지 않았으며, 이러한 제한 때문에 검토 가능한 다른 화면을 중단하지 않았다.

## 변경 범위

변경은 CSS 17개와 표현용 JSX 5개다. JSX는 프로젝트 컨테이너 class, 기존 GitHub 상태 필터 label의 class, GitHub 페이지의 비상호작용 wrapper, 위 후속 검토에서 추가한 일지 모달 class다. API/store/controller/model/route, 이벤트 handler, 조건부 표시, 필드 속성, DOM 내 조작부 순서, 의존성은 변경하지 않았다. GitHub 헤더는 기존 eyebrow와 blueprint 동작을 보존하기 위해 `compact` prop 대신 전용 CSS를 사용했다.

| 항목         | 반영 내용                                                                       | 확인 근거                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D01–D03      | 입력 14px/모바일 16px, 버튼·항목명 14px, GitHub 상태 필터 규격 통일             | 태스크 입력의 [변경 전 측정](before/measurements.json), [변경 후 측정](after/measurements.json), 실제 일지 입력 16px/47.2px                                                                      |
| D04–D06, D14 | GitHub 제목·배지·입력·버튼 폭, 선택 탭, Issue/출처 위계, 잘못된 muted 토큰 정리 | [GitHub 전](before/github-390.png) / [후](after/github-390.png), [설정 전](before/settings-1440.png) / [후](after/settings-1440.png), 기존 GitHub 회귀                                           |
| D07, D09     | 일지 fieldset 기본 외곽선 제거, 긴 textarea 전체 열, 모달 스크롤·여백           | 실제 일지 모달 확인, [태스크 전](before/task-modal-1440.png) / [후](after/task-modal-1440.png), [모바일](after/task-modal-390.png)                                                               |
| D08          | 프로젝트 본문 시작선, 집계 레이블·숫자 행 정렬                                  | [320px 전](before/projects-320.png) / [후](after/projects-320.png)                                                                                                                               |
| D10          | 초기·빈 홈과 빈 자료실의 왼쪽 정렬 및 안내 폭                                   | [초기 홈](after/home-initial-1440.png), [빈 홈](after/home-empty-1440.png), [채워진 홈](after/home-390.png), [채워진 자료실](after/library-390.png)                                              |
| D11          | 일지 제목 아래 중복선 제거, 모바일 액션 행 gap 0                                | [실제 로컬 일지 390px](after/journals-390.jpg), 일지 회귀 36개                                                                                                                                   |
| D12          | 연결 글 사이 선과 footer 선 역할 분리, 문서 toolbar를 본문 폭에 정렬            | [실제 연결 글 2건](after/journal-detail-desktop.jpg), [390px](after/journal-detail-390.jpg), [문서 편집 desktop](after/document-editor-desktop.png) / [mobile](after/document-editor-mobile.png) |
| D13          | 로그인 workflow와 기술 그룹 세로 간격 축소                                      | [1440px, IDE 선택](after/login-1440.png); 기존 선택·애니메이션 로직 유지                                                                                                                         |
| D15–D16      | 프로젝트 제목→소개, 마지막 저장소 행→다음 섹션 중복선 제거                      | [프로젝트 상세 전](before/detail-1440.png) / [후](after/detail-1440.png), 실제 로컬 상세 및 격리 저장소 관리 화면                                                                                |

`before/`와 대응하는 `after/` PNG 여섯 쌍은 기존 GitHub/Task fixture의 동일 데이터·동일 viewport로 비교했다. `after/`의 홈·자료실·확대 캡처는 별도 실제 백엔드의 대표 데이터다. JPG는 사용자가 로그인한 5173/8080 환경의 읽기 전용 관찰이다. 이 서로 다른 환경의 이미지를 동일 데이터 전후 비교로 간주하지 않는다. 10월 13일에 생성된 과거 캡처는 이번 결과에 포함하지 않았다.

## 구분선 경계

| 경계                           | 유지한 선                                  | 제거/판정                                                             | 검증 범위                                                     |
| ------------------------------ | ------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------- |
| 일지 목록 제목→본문            | `.page-heading` 아래                       | `.journal-page-content` 위 선 제거                                    | 실제 목록 desktop/390, 격리 목록 6개 폭, 로딩·빈·오류 회귀    |
| 프로젝트 제목→소개             | `.page-heading` 아래                       | 인접 `.project-summary` 위 선 제거                                    | 동일 조건 전후, 실제 로컬 상세, 격리 6개 폭                   |
| 필터/집계→목록                 | 각 영역 경계                               | 사이에 실제 내용이 있으므로 유지                                      | 프로젝트·작업·자료실 6개 폭                                   |
| 연결 글 행→행/마지막 행→footer | 인접 행의 위 선, footer 위 선              | scoped `.journal-document-row.document-row` 아래 선 제거              | 실제 2건 desktop/390, 실제 격리 0/1건·긴 내용·404/500·200%    |
| 저장소 행→관리/다음 섹션       | 인접 행의 위 선, 관리 패널/다음 섹션 위 선 | `.github-row` 아래 선 제거                                            | 닫힘/Issue/설정 화면 desktop/390/320, 기존 상태 회귀          |
| Issue→선택 막대                | 인접 Issue 위 선, sticky 막대 위 선        | Issue 아래 선 제거                                                    | 격리 Issue 화면·선택 100개/페이지 이동 회귀; sticky 동작 유지 |
| 홈 위젯 제목→목록              | 제목 아래 및 집계 다음 목록 선             | 현재 프로젝트 위젯에는 집계가 있어 서로 다른 경계. 추가 제거하지 않음 | 실제 채워진 홈, Dashboard v3 회귀                             |
| 일지 작성 fieldset→footer      | 입력 외곽·modal footer 위 선               | fieldset 기본 장식선 제거                                             | 실제 모바일 폼·focus 순환·취소 복귀, 모달 회귀                |

문서 본문 구분선, 카드 외곽, 입력 경계, 탭 선택, 포커스, 드래그 대상은 정리 대상에서 제외했다. 후속 검토에서 실제 GitHub 결과/선택 미리보기 캡처를 보완했다. 연결 문서가 20건을 넘는 `더 불러오기`와 모든 GitHub 오류/결과 조합까지 확인한 것은 아니다.

## 실행 결과

| 검사                                    | 결과                                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                         | 통과. query policy 및 TypeScript 포함. 기존 500kB 초과 chunk 경고 유지                                                |
| `npm test`                              | 42개 파일, 261개 테스트 통과                                                                                          |
| `npm run check:boundaries`              | 248개 파일, 924개 로컬 import 통과                                                                                    |
| 변경 파일 Prettier / `git diff --check` | 통과                                                                                                                  |
| Projects                                | 32 통과, 기존 실패 3                                                                                                  |
| Tasks                                   | 20 통과, 기존 실패 3                                                                                                  |
| Journals                                | 최종 변경 후 전체 36 통과                                                                                             |
| Links                                   | 14 통과, 기존 실패 2                                                                                                  |
| Milestones                              | 격리 upstream 실행에서 11 통과, 기존 실패 2                                                                           |
| Dashboard `v3.spec.ts`                  | 9 통과                                                                                                                |
| GitHub `integration.spec.ts`            | 37개 모두 통과한 실행 근거 확보; 최초 36 통과 + 선택 100개 테스트 단독 재실행 통과                                    |
| Auth `documents.spec.ts`                | 2 통과                                                                                                                |
| 동일 fixture 디자인 캡처                | 변경 전/후 각각 통과. 5개 페이지 × 6개 폭에서 가로 overflow 없음                                                      |
| 실제 백엔드 `--workspace-layout`        | 통과. 7개 화면 × 6개 폭 = 42개 관찰, 390×600 모달 3종 취소/포커스 복귀, native 200% 4개 화면, 인증/proxy smoke        |
| 실제 백엔드 `--documents`               | 부분 수행 후 실패. 일지 상세 검증과 문서 편집·반응형 캡처 이후 대용량 PUT에서 `ECONNRESET`. 전체 통과로 기록하지 않음 |

Playwright는 해당 `playwright.<영역>.config.ts`, `--workers=1`, `--reporter=line`으로 실행했다. 초기에 여러 suite를 동시에 실행할 때 Projects CSRF, Journals description, GitHub 선택 100개와 임시 캡처가 시간 초과/타이밍 실패했다. 개별 재실행에서 모두 통과했다. 최초 Milestones 실행은 fixture에 없는 GitHub 읽기가 8080으로 전달되면서 인증 화면으로 이동했다. 중단 후 `BACKEND_UPSTREAM=http://127.0.0.1:1`로 격리해 다시 실행했다. 실제 사용자 데이터에 테스트 mutation을 실행하지 않았다.

기존 실패 10개는 변경 전 `aaeaaa1` 소스를 임시 archive로 분리하여 같은 테스트를 다시 실행했고 동일하게 재현됐다. Projects 3, Tasks 3, Links 2, Milestones 2다. 원인은 오래된 영문 인증 문구 기대와 Dashboard v2 fixture다. 테스트나 앱 기능을 변경하여 이를 숨기지 않았다. Milestones의 오래된 Home 테스트에는 13px 위젯 제목 기대도 있으나, 현재는 해당 Home fixture 단계부터 실패한다.

실제 백엔드 검증은 기존 harness가 소유한 임시 PostgreSQL/OIDC/backend 18080/frontend 4175를 사용했다. `BACKEND_ROOT`만 현재 형제 저장소 경로로 지정했다. 사용자 8080의 DB/설정과 Docker Compose container/network 이름은 변경하지 않았다.

`npm run check:docs`의 전역 실패는 사용자가 유지하도록 지시한 PLAN-0006–0008의 기존 backend 상대 링크 33개다. 새 PLAN/검증 문서의 상대 링크는 별도로 확인한다.

## 화면·키보드·대비

- [fixture 측정](after/measurements.json): 1440/1280/1024/768/390/320px. 태스크 입력은 desktop 14px, 390/320px 16px, 모바일 높이 약 47.6px로 44px 이상이다.
- [실제 API 측정](after/real-layout-measurements.json): 홈·프로젝트 목록/상세·작업·일지 목록/상세·자료실 42개 관찰에서 문서 전체 가로 overflow 없음. [native 200% 프로젝트](after/zoom-200-projects.png).
- [일지 상세 결과](after/journal-detail-result.json): 2만 자 설명, 120자 제목, 5개 폭, native 200%, cached 404/500, 이동 버튼의 focus/요청/이력 보존. [320px](after/journal-detail-long-320.png), [200%](after/journal-detail-zoom200-complete.png).
- 실제 Chrome에서 홈, 프로젝트 목록/상세, 일지 목록/상세, 문서 Viewer/Editor를 확인했다. 일지 폼은 입력 없이 열고 닫아 focus 순환·트리거 복귀를 확인했다. 문서 내용·발행 상태는 수정하지 않았다.
- [320×600 위젯 모달](after/widget-modal-320.png)은 내부 스크롤을 유지한다. 390×600 프로젝트/링크/태스크 모달은 기존 실제 API harness에서 footer 취소 도달 및 복귀를 확인했다. 물리적 휴대폰·가상 키보드 검증은 하지 않았다.
- [색 대비 측정](after/contrast.json): 본문 14.75:1, muted 기본 배경 5.05:1, hover 배경 4.56:1, raised 배경 5.19:1, 선택 탭 4.69:1, primary 버튼 5.41:1, 사이드바 8.02:1, focus 5.05:1, 입력 경계 3.56:1. 실제 computed sRGB control-border 합성값을 사용했다. 기존 의미 색 전체나 disabled 텍스트 모두가 이 수치를 만족한다는 주장은 아니다.

## 잔여 실행 전의 미완료 기록

다음 항목 때문에 앞선 턴에서는 PLAN을 `active`로 유지했다. 이번 잔여 실행에서 1번의 구조별 대표 상태를 보완하고, 2번은 전체 API 검사와 문서 UI 회귀를 분리하여 후자를 통과했다. 3번의 5183 접근은 재시도하지 않았다.

1. 연결 글 `더 불러오기`, GitHub의 모든 오류/결과 조합, 모든 하위 모달의 실제 200% 화면까지는 미검증이다. 실제 선택 미리보기와 완료 결과는 위 5173 후속 검토에서 확인했다.
2. 문서 전체 통합 검사의 대용량 요청 연결 종료를 해결/분리해 나머지 기능 보존 검증을 마쳐야 한다. 이번 변경에서는 문서 API나 용량 정책을 수정하지 않았다.
3. 실제 로컬 일지·문서 등의 동일 데이터 변경 전 캡처를 추가하려던 5183 접근은 브라우저 자동 승인 검토가 origin 접근 권한을 부여하지 않아 거부됐다. 우회하지 않고 중단했다. 기존 fixture 전후 캡처와 승인된 5173의 변경 후 관찰만 보존했다.

앞선 임시 캡처 test는 테스트 디렉터리에서 제외해 Git이 무시하는 `.auth-validation/design-audit.completed.txt`로 보관했고, baseline 서버는 종료했다. baseline archive의 재귀 삭제 명령은 당시 자동 실행 정책에서 거부되어 무시 디렉터리에 그대로 남겼다. 검토를 위한 5173 프런트엔드는 유지한다. registry는 최종 결과에 따라 `completed`로 갱신했다.
