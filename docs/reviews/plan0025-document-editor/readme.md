# PLAN-0025 구현·검증 기록

Date: 2026-09-23

## 구현

- Journal 목록·프로젝트 최근 일지·Home 위젯의 읽기 Modal을 `/journals/:journalId`로 전환했다. 기존 Journal CRUD와 본문 textarea는 유지한다.
- Journal 선택/확인 뒤 실제 DRAFT를 만들고 `/documents/:documentId/edit`에서 편집한다. `/documents/:documentId`는 같은 BlockNote JSON의 읽기 전용 화면이다. 문서 DTO에 Journal FK를 추가하지 않았다.
- 1.5초 자동 저장, 동시 PUT 1개, 최신 대기 입력 병합, 입력을 덮어쓰지 않는 응답 처리, 명시적 오류 복구, 최종 PUT 성공 후 게시, 삭제 확인과 화면 이동 보호를 구현했다.
- uploadFile·picker·clipboard·drop, 인증된 이미지와 다운로드, ATTACHED 서버 metadata와 TEMP/Undo metadata 병합을 구현했다. 불확실한 생성·업로드는 자동 재시도하지 않는다.
- 기존 QueryManager를 주입하며 신규 조회는 fresh 0초/미사용 60초/포커스 재조회 없음 정책이다. 빈 조회가 회수 후 0ms GC timer를 계속 예약하던 문제도 회귀 테스트와 함께 수정했다.
- BlockNote 0.55.0, Mantine 8.3.11을 고정하고 편집기 코드/CSS를 lazy load한다. Nginx 12MiB 요청 한도, 업로드 60초 timeout을 적용했다.

## 검증 근거

| 검증                   | 결과                                                                                                                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit                   | 39 files / 239 tests 통과: 저장 직렬화·debounce·실패 보존·publish 차단·TEMP 병합·Undo metadata·세션 격리·DTO·UTF-8 크기·multipart/binary HTTP·GC |
| Journal browser        | 15/15 통과. 현재 Dashboard v3 fixture를 재사용하고 신규 Document 성공 Mock은 만들지 않음                                                         |
| Dashboard browser      | 9/9 통과                                                                                                                                         |
| 신규 인증 경로 browser | 기존 auth config의 `documents.spec.ts` 2/2 통과: Journal/Document 로그인 returnTo                                                                |
| Build/TypeScript       | 통과. 편집기 lazy chunk 크기 경고는 남으며 API/fixture 격리 검사는 통과                                                                          |
| 경계·조회 정책         | `check:boundaries`, `check:queries` 통과                                                                                                         |
| 실제 API               | 기존 `tests/real/run.mjs --documents`, `--documents --nginx`로 disposable PostgreSQL/OIDC/임시 파일 저장소 검증                                  |
| 화면                   | 1440×1000, 1280×800, 390×844, 320px, landscape, 200% 확대의 overflow 확인 및 스크린샷 직접 검토                                                  |

실제 API 검증은 생성 → 한글 입력 → 저장 → 게시 → 재조회/재편집 → 첨부 → 다운로드 → 삭제를 수행한다. 실제 PUT 응답만 지연/차단해 오래된 응답과 유실 복구를 확인한다. 기본 block 종류·중첩 children·서식·table·stable contentUrl을 API 저장 후 BlockNote에서 복원하고 다시 저장한다. 응답을 가짜 성공 DTO로 바꾸지 않는다. 원시 실행 로그와 추가 스크린샷은 `.auth-validation/vite`, `.auth-validation/nginx`에 생성한다.

최종 Vite·Nginx 실행 모두 종료 코드 0이다. 저장 A 중 첨부 B 업로드, 게시 후 Viewer 이동과 반복 게시, 다른 사용자 접근 404, 목록 추가 페이지, filename/JSON 깊이/바이트 경계를 포함한다. 중단된 저장의 재진입 시 서버 확인 요구는 controller 단위 테스트로 검증한다.

- 실행 결과: [Vite](vite-result.json), [Nginx](nginx-result.json)
- 화면 근거: [Editor desktop](editor-desktop.png), [Editor mobile](editor-mobile.png), [Viewer mobile](viewer-mobile.png)

## 남은 계획 검증

BlockNote 기본 기능으로 모든 필수 block과 formatting/menu/handle을 제공한다. 이번 브라우저 검증은 JSON 복원·재저장, 한글 IME, slash/file picker, paste/drop, 읽기 전용 제한을 확인했다. 모든 toolbar 서식 버튼과 block drag/reorder·indent/outdent·type 변경을 각각 직접 조작한 증거는 아직 없다. 해당 PLAN 완료 항목은 미체크로 유지하며, 구현 및 핵심 실제 연동 통과를 계획 전체 검증 완료와 구분한다.

## 기존 검사 실패와 제한

- 전체 `playwright.auth.config.ts`의 기존 20건 중 19건은 이전 영문 문구(`Checking your session…`, `Sign in to your workspace`, `Devspace`) 및 `/api/v2/dashboards/home` fixture와 현재 UI/v3 계약의 불일치로 실패한다. 해당 기대값·로그인 문구는 이번 작업에서 바꾸지 않았다. 이를 신규 문서 인증 테스트와 실제 OIDC/session 검증의 성공으로 대체해 전체 suite 성공이라고 기록하지 않는다.
- `check:docs`는 PLAN-0006~0008의 사라진 `../../../backend/...` 외부 체크아웃 링크 33개 때문에 실패한다. 이번에 변경/추가한 문서의 링크는 별도로 검사한다. 과거 계획의 링크를 새 환경 경로로 일괄 변경하지 않았다.
- 전체 multipart 한도 초과 요청은 Vite 직결 경로에서 413 대신 연결 종료(ECONNRESET)가 관측될 수 있다. 초과 파일이 DB에 생성되지 않았는지 별도 확인하며 클라이언트는 네트워크 실패로 보존·수동 복구한다. 정상 10MiB 업로드와 파일 한도 초과 413은 별도로 확인한다.
- 문서 revision/ETag가 없어 다중 탭의 덮어쓰기를 막지 못한다. 재로그인/계정 변경 시 확정되지 않은 mutation을 자동 재전송하지 않는다. 새로고침으로 인메모리 부모 문맥이 사라지면 `/journals`로 복귀한다.
- 게시 버튼은 업로드가 남아 있거나 실패했을 때 비활성화한다. 업로드가 끝나면 현재 저장 큐를 flush하고 최종 PUT을 확인한 뒤 게시한다.

## 재실행

```powershell
npm test
npm run build
node tools/check-auth-artifact.mjs
npx playwright test --config playwright.journals.config.ts
npx playwright test --config playwright.dashboard.config.ts
npx playwright test --config playwright.auth.config.ts tests/auth/documents.spec.ts
node tests/real/run.mjs --documents
node tests/real/run.mjs --documents --nginx
```

8080 작업실은 Swagger/OpenAPI 조회에만 사용했다. Backend 소스와 실제 업무 데이터는 수정하지 않았다.
