# PLAN-0027 공통 프로필 메뉴와 Document footer 제거

Date: 2026-09-23

## 결과

- 모든 인증 페이지의 우측 상단 avatar를 프로필 버튼으로 전환했다. 클릭하면 사용자 이름과 기존 로그아웃 action이 표시된다.
- Home·Projects·Tasks·Journals·Library·Document의 본문 하단 로그아웃을 제거했다. Sidebar 프로필 창에는 계정 action을 추가하지 않았다.
- Document 편집·보기에서는 공통 footer를 렌더링하지 않는다. 같은 경로의 로딩·오류도 동일한 레이아웃 정책을 사용한다. 다른 페이지의 footer는 기존 브랜드 안내만 유지한다.
- 메뉴는 Escape·바깥 클릭·외부 포커스 이동·경로 변경으로 닫힌다. Escape는 트리거로 포커스를 복원한다. 로그아웃 실패 후 인증 화면이 복원되면 메뉴를 자동으로 열어 오류와 재시도를 표시한다.
- 기존 로그아웃 처리 중 전용 화면, 세션 요청·차단·복구 정책은 유지한다. 신규 서버 요청·의존성을 추가하지 않았다.

## 검증

| 항목                           | 결과                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| Build / TypeScript / 조회 정책 | 통과. 기존 bundle 크기 경고 유지                                                                           |
| Unit                           | 39 files / 239 tests 통과                                                                                  |
| 코드 경계                      | 228 files / 836 imports 통과                                                                               |
| 산출물 격리                    | 14 files 통과                                                                                              |
| 실제 API                       | `node tests/real/run.mjs --documents` 종료 코드 0                                                          |
| 메뉴                           | Home·Projects·Tasks·Journals·Library·Document의 단일 로그아웃, Tab·Escape·바깥 클릭 검증                   |
| Footer                         | 일반 페이지 footer 유지 및 main 하단 sessionControls 부재, Document Editor/Viewer footer 부재 확인         |
| 로그아웃                       | 실제 OIDC 세션에서 요청 실패 주입 → 메뉴의 Retry logout 표시 → 재시도 204 → 인증 종료 확인                 |
| 화면                           | 1440·1280·390·320px 및 가로 화면 메뉴 캡처, 문서 200% 확대·overflow 검사, 데스크톱·320px·빈 문서 직접 검토 |

실패 주입은 실제 로그아웃 요청을 한 번 차단하며 성공 DTO를 만들지 않는다. 8080 업무 환경은 수정하지 않고 disposable Backend·PostgreSQL·파일 저장소·OIDC를 사용했다. 초기 실패 주입 handler의 정리 순서 오류를 수정한 뒤 최종 실행을 통과했다.

기존 auth 및 legacy Dashboard 테스트의 로그아웃 진입 selector는 새 메뉴에 맞췄다. 과거 영문 문구·v2 fixture 불일치는 [PLAN-0025 기록](../plan0025-document-editor/readme.md)에 남아 있으며 이번에 전체 legacy suite를 재검증했다고 기록하지 않는다. 문서 전체의 과거 외부 backend 링크 오류도 별도 항목이다. 이번 변경 문서는 상대 링크·포맷을 검사한다.

## 화면과 결과

- [변경 전](before-desktop.png) / [변경 후 문서](after-desktop.png)
- [빈 문서](empty.png)
- [데스크톱 프로필 메뉴](account-desktop.png) / [320px 메뉴](account-small.png)
- [실제 Document 결과](documents-result.json) / [세션 결과](session-result.json)

PLAN-0025의 미검증 항목은 이 작업에서 완료 처리하지 않는다. PLAN-0027의 범위는 공통 계정 UI 배치와 Document footer 제거다.
