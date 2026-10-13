# PLAN-0029 검증 기록

Date: 2026-10-13

## 구현

- 상세 전용 헤더에 목록 복귀, 단일 작성 액션, 제목·프로젝트·기록일과 연결 글 이동을 배치했다.
- 1200px 이상은 본문과 300px 연결 글 영역의 두 열, 미만은 한 열이다. 본문은 16px/1.85와 원문 공백·줄바꿈을 유지한다.
- 연결 글은 조회 건수, 생성일 최신순 안내, 제목·상태·수정 일시로 구성한다. 하단 이동 버튼은 상단 작성 버튼 또는 비활성 작성 안내 영역으로 포커스·스크롤만 옮긴다.
- 상세 상태가 ready이며 ID가 일치할 때만 생성할 수 있다. 캐시가 남은 오류에서는 작성 액션을 숨기지만 같은 생성 컴포넌트의 상태와 탐색 보호를 유지한다.
- API·query 정책·문서 생성 및 복귀 계약을 바꾸지 않았다. Document 스타일 변경은 기존 Journal margin 제거뿐이다.

## 검증

- `npm run build`: TypeScript, query 검사, Vite 통과. 기존 500KB 청크 안내는 남아 있다.
- `node tools/check-boundaries.mjs`: 230개 파일, 841개 로컬 import 통과.
- `node node_modules/@playwright/test/cli.js test --config playwright.journals.config.ts --reporter=line`: 34개 통과. 기존 32개에 초기 상세 로딩·404/500·재시도·문서 목록 단독 실패·포커스 사례를 추가했다.
- `node tests/real/run.mjs --documents`: 실제 백엔드, 일회용 PostgreSQL, 로컬 OIDC 테스트 세션을 사용한다. Google 운영 계정을 사용한 검증은 아니다. 성공한 업무 응답은 실제 API이며 지연·오류 응답만 제어한다.
- 추가 실제 검증은 기존 Document runner에서 [journal-detail.mjs](../../../tests/real/journal-detail.mjs)를 호출한다. 별도 서버나 runner를 만들지 않았다.
- 생성 진행·오류 중 동일 일지 재조회는 실제 store 메서드를 일시적으로 관찰한 뒤 원복하고 기존 invalidate 메서드를 실행한다. 앱에 테스트용 전역이나 분기 코드는 추가하지 않았다.
- 최초 기존 Document 검증은 이전 검색 UI를 찾다가 중단됐다. 검색 모달을 열고 입력·적용하는 현재 UI에 맞춰 테스트를 수정했다. 이후 전체 재실행에서 편집기 중앙 클릭 후 Control+End가 코드 블록 안에 머무는 간헐적 테스트 실패를 확인해 파일 업로드 테스트가 마지막 일반 문단을 명시적으로 선택하도록 고쳤다. 앱의 Editor 구현은 변경하지 않았다.
- `npm run check:docs`는 기존 PLAN-0006~0008의 `../../../backend/` 상대 링크에서 실패한다. 실제 형제 backend 디렉터리는 `devspace-back`이며 이번 변경과 무관한 기존 링크는 수정하지 않았다.

## 화면 검토

- [이전 데스크톱](before-desktop.png), [이전 모바일](before-mobile.png): 상세 본문을 읽은 직후 문서 목록 로딩 중 캡처.
- 최종 실제 인증 검증의 캡처와 결과를 이 디렉터리에 보관한다.
- 긴 한글 제목과 공백 없는 문자열이 줄바꿈되고, 좁은 화면에서 메타정보·액션이 겹치지 않는 것을 직접 확인했다. 연결 글 영역에는 별도 높이 제한·내부 스크롤·sticky가 없다.

## 실행 환경

PowerShell에서 `BACKEND_ROOT`를 형제 `devspace-back` 경로로, `JAVA_HOME`을 설치된 Eclipse Adoptium Java 21 경로로 지정했다. 기존 `bootTestRun`과 runner의 소유 프로세스 정리 경로를 사용하며 backend 소스나 다른 서비스는 변경하지 않았다.

### 확대 캡처 도구의 제한

Chromium에서 native 200%와 큰 스크롤 위치를 함께 사용하면 surface screenshot이 빈 이미지로 저장되는 현상을 앱 없는 최소 HTML에서도 재현했다. DOM의 제목 위치·포커스·viewport 검증은 통과한다. 긴 본문의 확대 이동 검증을 유지하면서, 짧은 실제 일지를 1440×1800px 브라우저 viewport(native 200%, CSS 너비 720px)에서 상단부터 캡처해 헤더·본문·연결 글의 디자인을 직접 검토한다. CSS zoom, 가짜 업무 응답, 캡처용 앱 DOM 수정은 사용하지 않았다.

## 최종 결과

최종 `--documents` 실행이 exit 0으로 종료했다. 상세 전용 시나리오, 생성 단일 POST와 재조회 중 보호 유지, 실제 Editor 저장·게시·첨부·Viewer 복귀, 21개 문서 cursor 실패 후 복구와 API 순서 일치, 세션 callback·PKCE·CSRF·Origin·logout 검증이 통과했다. 브라우저 오류는 없었다. PLAN과 registry를 `completed`로 갱신했다.

- [상세 결과](detail-result.json), [Document 통합 결과](documents-result.json), [인증 결과](auth-result.json)
- [이후 데스크톱](after-desktop.png), [이후 모바일](after-mobile.png)
- [긴 콘텐츠 1440px](long-1440.png), [1280px](long-1280.png), [1024px](long-1024.png), [390px](long-390.png), [320px](long-320.png)
- [21개 문서 데스크톱](many-1440.png), [21개 문서 모바일](many-390.png), [native 200% 전체 상세](native-zoom200.png)
