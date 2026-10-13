# PLAN-0030 구현 및 검증

Date: 2026-10-13
Baseline: `c58a0b3987ff93e056ee34c5ca7699c96acf707f`
Status: completed — 실제 모바일 가상 키보드 검증은 사용자 요청으로 제외

## 구현

- 인증 업무 화면에만 compact PageScaffold를 적용했다. 태스크/링크는 feature의 `renderLayout`으로 상단 생성 액션을 조합하며 편집기와 mutation 상태를 중복 생성하지 않는다.
- 태스크 생성 버튼의 실제 ref로 포커스를 복원한다. 항목 편집은 항목 제목으로, 항목 소멸 시 생성 버튼/목록 제목으로 복귀한다. 프로젝트는 지속적으로 마운트된 h1에 진입 시 한 번만 포커스하고 데이터 도착 때 사용자 포커스를 유지한다.
- TaskBoard는 컨테이너 760px 미만에서 세로로 배치한다. 빈 배지/메타 행과 빈 열의 과도한 높이를 줄이고 상태 select/drag/drop을 유지했다.
- 프로젝트 기본 정보를 압축하고 섹션 제목과 생성 액션을 묶었다. 첫 연결 섹션 접근이 앞당겨져 상단에 이동 버튼 4개를 추가하지 않았다. 최근 일지는 3개와 단일 생성 진입점을 유지한다.
- 자료실의 소개 중복을 없애고 항목 제목 아래에 분류를 배치했다. 순서 변경 제한은 표시하고 상세 안내만 접었다.
- 링크 필드 간격과 프로젝트 설명 높이를 조정했다. 390×600에서 스크롤로 저장/취소에 도달해 하단 고정 액션이나 shared Modal 구조 변경은 도입하지 않았다. 실제 가상 키보드 접근을 통과한 것으로 해석하지 않는다.
- 홈의 중복 추가 유도는 비어 있는 배치에만 남겼다. 미설정 위젯은 일반 안내로 표시하고 오류/재시도, 저장된 위젯과 배치 계약을 유지했다. 사이드바 홍보와 하단 슬로건을 제거하고 프로필/계정/로그아웃은 유지했다.

## 재현과 비교

실제 API seed와 캡처 절차는 [workspace-layout.mjs](../../../tests/real/workspace-layout.mjs)에 보관했다. [기존 runner](../../../tests/real/run.mjs)가 격리 PostgreSQL·백엔드·OIDC·Vite의 시작/정리를 담당한다. 로그인은 로컬 OIDC 테스트 계정이며 운영 계정이나 성공 응답 mock을 사용하지 않는다.

```powershell
$env:BACKEND_ROOT = 'C:\Users\USER\lib\devspace\devspace-back'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'
$env:LAYOUT_STAGE = 'after' # 변경 전 앱 코드에서는 before
node tests/real/run.mjs --workspace-layout
node tests/real/run.mjs --journal-search --documents
```

변경 전 앱은 기준 커밋에서 비교 모듈과 runner 연결만 추가하여 실행했다. 동일 생성 순서·문자열·날짜·연결·기본 위젯 6개를 사용한다. 생성 결과 UUID/시각은 실행마다 달라지며 [before fixture](before/fixture.json)와 [after fixture](after/fixture.json)의 생성 순서로 대응한다. 일지 작성일은 고정이며 서버 생성 시각은 실행 시각이다. 각 페이지의 네트워크 안정화 후 캡처한다. 기존 최초 점검 이미지와 이번 재현 비교 이미지를 혼용하지 않는다.

7개 경로 × 1440/1280/1024/768/390/320px, 프로젝트/링크/태스크 모달 390×600을 확인했다. 전후 전체 위치 측정은 [before](before/observations.json) / [after](after/observations.json)에 있으며 대표 1440/390px와 모달 캡처를 같은 디렉터리에 남겼다. 문서 Viewer/Editor·Journal 상세/검색은 기존 실제 API 검증에서 별도로 확인했다.

| 390px 기준                   | 변경 전 Y | 변경 후 Y |
| ---------------------------- | --------: | --------: |
| 작업 보드 첫 카드            |       676 |       524 |
| 자료실 첫 링크 행            |       798 |       477 |
| 프로젝트 상세 마일스톤 제목  |       859 |       653 |
| 프로젝트 상세 연결 작업 제목 |      1203 |       916 |

native 200%는 Chromium 설정으로 실제 확대하고 `devicePixelRatio >= 2`, `innerWidth <= 720`, 문서 가로 overflow 없음을 검사했다. [작업](after/zoom-200-tasks.png), [자료실](after/zoom-200-library.png), [프로젝트](after/zoom-200-projects.png), [홈](after/zoom-200-home.png)은 실제 확대 상태의 상단 캡처다. 전체 스크롤 영역을 시각 검증한 이미지로 주장하지 않는다. 좁은 보드의 세로 배치/상태 조작은 별도 컨테이너 테스트와 320/390px 캡처로 확인했다.

## 정적·회귀 검증

- build, Query policy, 소스 경계, 변경 파일 Prettier, diff 공백 검사 통과. 단위 테스트 239개 통과.
- 새 포커스/컨테이너 테스트를 포함한 현재 계약의 회귀: Projects 32, Tasks 20, Links 14, Dashboard 9, Journals 34, Milestones 11개 통과(총 120개).
- 기존 전체 suite도 실행했으며 아래 실패는 기준 커밋의 별도 worktree에서 재현했다. 오래된 실패를 통과로 기록하거나 앱 코드를 그 테스트에 맞춰 되돌리지 않았다.

| suite      | 남은 기존 실패 | 원인/범위                                             |
| ---------- | -------------: | ----------------------------------------------------- |
| Projects   |              3 | 이전 Home fixture, 이전 인증 문구                     |
| Tasks      |              3 | 이전 Home fixture, 이전 인증 문구                     |
| Links      |              2 | 이전 Home fixture, 이전 인증 문구                     |
| Milestones |              2 | 이전 Home fixture, 이전 인증 문구                     |
| Auth       |             19 | 이전 인증 화면/문구 및 손상된 프로필 버튼 selector 등 |
| Shell      |             11 | 이전 Home fixture·글꼴·legacy 시각 비교 전제 등       |

Tasks의 옛 색상 JSON 비교는 현재 카드의 편집/포커스/44px 조작 검증으로 유지하면서 제거했다. 새 배치의 시각 근거는 실제 캡처로 대체했다. Links는 생성 버튼 위치를 page heading으로 갱신하고 오래된 Home fixture 부분은 별도 기존 Home 테스트에 남겼다. Journals는 의도적으로 제거한 빈 상태의 중복 생성 버튼 기대값만 1개로 수정했다. 제외 대상과 변경 전후 전체 suite 결과는 [회귀 요약](regression-results.json)에 기록한다.

`check:docs`는 기존 PLAN-0006~0008의 `../../../backend` 외부 경로 오류를 보고한다. 이번 PLAN/검증 자료의 링크는 별도 확인한다.

## 실제 인증 검증과 제한

실제 검색·정렬(조건 6개/취소/초기화/이력/200%), Journal 상세, 문서 생성·직렬 저장·응답 유실 복구·발행·첨부·Viewer가 통과했다. 결과: [검색](journal-search-result.json), [문서](documents-result.json).

후속 인증 smoke에서 테스트 도구의 일회성 로그아웃 장애 route 해제와 재시도가 경합했다. 장애 주입을 `{ times: 1 }`로 제한하여 재시도 요청을 다시 가로채지 않도록 정리했다. 최종 `--journal-search --documents` 전체 실행은 exit 0이며 callback·PKCE·reload·CSRF·Origin·logout·장애 재시도·계정 전환·proxy smoke까지 통과했다.

실제 모바일 기기의 가상 키보드는 검증 환경이 없어 수행하지 않았다. 2026-10-13 사용자가 해당 검증이 필요 없으므로 제외하고 나머지 작업이 완료됐다면 완료 처리하도록 명시적으로 요청했다. 이를 검증 범위와 완료 조건에 반영하고 나머지 구현·검증 결과를 확인하여 PLAN을 `completed`로 전환했다. viewport 축소/물리 키보드 결과를 실제 가상 키보드 검증 통과로 간주하지 않으며 위 기존 실패 기록도 유지한다.

최종 `--workspace-layout`도 exit 0으로 종료했다. 최종 소스에서 42개 페이지 캡처·추가 모달 3개·native 200% 4개를 갱신하고 인증 smoke까지 통과했다. 비교용 worktree 정리 중 Vite가 설정 변경을 감지해 중단된 중간 실행은 폐기하고, 정리 후 재실행한 결과만 after 근거로 보관했다.
