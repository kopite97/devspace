# PLAN-0026 Document 디자인 검증

Date: 2026-09-23

## 변경

- Document 카드의 surface 배경·테두리·둥근 모서리를 제거했다. 제목과 본문은 페이지 배경 위에 이어지고 코드·표·파일 등의 기능별 표시는 유지한다.
- 실제 본문은 최대 800px이며 제목·본문·첨부의 시작선을 맞췄다. 모바일은 앱 기본 여백에 블록 핸들 공간을 추가한다.
- 본문은 자연스러운 높이와 페이지 스크롤을 유지한다. 본문 최소 입력 높이는 300px이며 별도 카드 최소 높이는 없다.
- 제목의 키보드 focus-visible 표시를 유지하고 로딩·오류 화면의 content-panel 클래스도 제거했다.
- 런타임 변경은 Document CSS와 로딩 wrapper에 한정했다. API·controller·저장 정책·BlockNote 초기화는 변경하지 않았다.

## 검증

최종 `node tests/real/run.mjs --documents`는 종료 코드 0으로 완료했다. [실제 API 결과](result.json)를 함께 보관한다.

- 프로덕션 Build/TypeScript, 조회 정책, 코드 경계(227 files / 835 imports), 산출물 격리(14 files), 변경 코드 포맷과 diff 검사를 통과했다. 기존 bundle 크기 경고는 유지된다.
- 기존 disposable 실제 API harness에서 빈 문서·한 문단·35문단 입력의 외곽 너비와 위치가 같고 제목/본문 시작점이 일치함을 확인했다. 배경은 transparent, border는 0px이다. 긴 본문의 마지막 입력 커서가 화면 안에 유지된다.
- 한글 IME, 선택 시 formatting toolbar, 블록 메뉴, slash/file chooser·paste/drop, 저장 경합·복구·게시·다운로드·미리 보기 및 인증 격리를 검증했다. 성공 응답 Mock은 추가하지 않았다.
- 블록 드래그는 브라우저의 DragEvent/DataTransfer를 실제 handle과 drop 위치에 전달하고 본문 순서 변경을 확인했다. 헤드리스 마우스 dragTo는 대기에 머물러 중단했으며 물리 마우스 조작 통과로 기록하지 않는다.
- 1440px·1280px·390px·320px·가로 화면·200% 확대에서 전체 페이지 가로 overflow 검사를 통과했다. 데스크톱·모바일·긴 문서 스크린샷을 직접 검토했다.
- 문서 전체 링크 검사에는 이전 PLAN-0006~0008의 외부 backend 경로 33개 오류가 남아 있다. 이번 문서의 상대 링크는 별도로 검사한다.

## 화면 비교

같은 제목과 block fixture, 같은 viewport의 전후 화면을 비교한다. 실행별 UUID·저장 시각은 달라진다.

- 데스크톱: [변경 전](before-desktop.png) / [변경 후](after-desktop.png)
- 모바일: [변경 전](before-mobile.png) / [변경 후](after-mobile.png)
- 작성 길이: [빈 문서](empty.png) / [한 문단](short.png) / [긴 문서](long.png)
- [320px 보기 화면](viewer-small.png)

## 실행

```powershell
npm run build
npm run check:boundaries
node tools/check-auth-artifact.mjs
node tests/real/run.mjs --documents
```

8080 업무 환경의 데이터는 수정하지 않는다. 기존 harness의 격리 PostgreSQL·임시 파일 저장소·OIDC를 사용하며 종료 시 자체 정리한다. PLAN-0025의 남은 전체 편집 조작 검증은 별도 후속 항목이다.
