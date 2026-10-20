# PLAN-0032 배포·실제 통합 검증

검증일: 2026-10-20. [PLAN-0032](../../plans/PLAN-0032-github-production-integration-validation.md)의 필수 배포·실제 통합 검증을 완료했다.
1차 세션의 기록을 보존하며, 아래 2차 검증이 당시의 접근 제약과 미실행 항목을 갱신한다.
별도 자원이 필요한 추가 시험과 브라우저 제어 제약은 필수 통과와 구분한다.

## 1차 배포와 기준

- 프론트: `9bdc2e1d7ca991dba41a939e6a84938ec15aa3cc`, main push 성공.
- [Actions 실행](https://github.com/kopite97/devspace/actions/runs/39384967497):
  07:12:04 UTC 시작, 07:12:38 UTC 완료, success.
- 프론트 컨테이너 생성: 07:12:29 UTC. image ID:
  `sha256:acd1e951640397351ec2dcff3d3f30b5a456b8a2b6e865bd4c13382bcb56caac`.
- 공개 HTML 자산 `index-C5B451Sg.js`, `index-kDtl6hm-.css` 확인 후
  `https://devspace.nellucia.dev/github`를 reload해 새 계정 UI를 확인했다.
- 백엔드 기준 SHA `d15f646510e7c94f05f2034cab37ba4e5960e153`의 기존 배포를 사용한다.
  기존 미커밋 PEM 마운트/배포 문서 변경을 다른 변경과 함께 push하지 않았다.
- 배포 APP_ORIGIN·GitHub callback/return은 공개 HTTPS origin이며 Secure cookie,
  GitHub 기능과 worker가 활성화되어 있다. 비밀 값은 저장하지 않았다.
- 실행 전 단위 261개, GitHub 브라우저 37개, 빌드·경계·쿼리·변경 파일 형식 검사 통과.
  기존 현재 회귀/Vite/Nginx 근거는 PLAN-0031 기록을 참고한다.

## 1차 공개 서비스 관측

- 기존 서비스 세션에서 GitHub 연결 시작→공개 결과 경로 `github=connected` 복귀→
  account 재조회 connected와 @kopite97 표시를 확인했다.
  이번 왕복을 새 Google 로그인 검증으로 계산하지 않는다.
- `PLAN-0032 production validation` 프로젝트 생성 및 개인 설치의 공개 시험 저장소 연결 성공.
  projectId: `d3e8e7ea-7bc0-47bb-8046-5fcfb737a471`.
  linkId: `53c6670f-9056-46c8-9c7b-61576b3ff96b`.
  repositoryId: `1424977371`, installationId: `172869880`.
- 초기 collect job `b9ff479d-a69c-489b-819b-a580b3e4e12d`는 completed,
  후속 mapping `8a075187-0b8f-4b1b-86b4-8863bb8d080f`도 completed로 관측됐다.
- Issue #2의 preview 후 import job `5c0c8874-609e-47f3-a222-e7eb56f32c27` 완료,
  성공 1·실패 0을 UI에서 확인했다. Task `2c742e1d-3940-4fd9-b50c-a950b78d7f92`가
  생성됐고 보드 todo=1, 프로젝트 전체=1로 갱신됐다.
- Task 편집기의 제목/본문·프로젝트/상태는 잠겨 있고 priority/tag는 수정 가능했다.
  high/plan0032 저장 뒤 DB 메타데이터로 revision=2, source_type=github를 확인했다.
- 자동 가져오기 enabled=true, Backlog 라벨 ID `12747631888` 저장 뒤 baseline_ready=true.
  기존 일치 Issue #1은 새 Task로 생성되지 않았고 source Task는 #2 한 건만 유지됐다.
- 중지와 재개 요청이 반영됐고 사용자 중지 안내와 재개 동선을 확인했다.
  재개 뒤 baseline도 완료됐다. 원격 변경을 동반한 시험은 아직 수행하지 않았다.
- 시험 종료 설정: revision=5, generation=5, enabled=false, paused=false,
  baselineReady=true, labelIds/assigneeIds=[], 매핑 3개 null. 새 시험 연결의 원래 의미로 복원했다.
  프로젝트·Task는 검토와 후속 시험을 위해 유지한다. 원격 Issue/라벨은 변경하지 않았다.
- 공개 프로젝트 직접 경로 reload 뒤 source Task·high/plan0032가 유지됐다.
  [배포 화면 증거](production-project.png)를 저장했다.

## Webhook 서명 음성 검증

비민감 payload `{}`와 새 delivery ID로 공개 수신 경로에 요청했다.

| 요청                | delivery ID                            | 응답                         | requestId                              |
| ------------------- | -------------------------------------- | ---------------------------- | -------------------------------------- |
| 서명 누락           | `6d6bb13a-47d3-4fed-8497-a906113a835b` | 401 GITHUB_INVALID_SIGNATURE | `ed9c265d-85ef-4e49-8f81-02d8b89e99f3` |
| 잘못된 SHA-256 서명 | `25c10455-138a-45c7-9281-384430b62ec6` | 401 GITHUB_INVALID_SIGNATURE | `67420602-ab93-4b29-ad72-d3f3c8c29d22` |

배포 DB의 읽기 전용 조회에서 두 delivery의 inbox 행 수는 0이었다.
기존 04:30 UTC의 ping·installation delivery completed는 관측됐으나 이번 Issue 전달 성공의 근거로 쓰지 않는다.

## 1차 세션의 접근 제약

GitHub App 설정 페이지를 브라우저로 열 때 origin 보안 승인에서 사용자 거절이 반환됐다.
사용자가 재허용 의사를 표시한 뒤 재시도했으나 저장된 origin 권한 설정 차단이 반환됐다.
사용자가 허용 목록을 추가했고 새 세션이 필요할 수 있다고 알려, 이번 세션의 독립 검증과
복원을 마친 뒤 새 세션에서 GitHub 화면 검증을 재개하기로 했다.
동일 설정 조회를 API/다른 브라우저로 우회하지 않았다.

## 2차 실행 기준과 격리

- 원격 main은 `8342fc0955b7d422fae83f046e8227bd463a4773`이었다.
  [문서 인계 커밋 배포](https://github.com/kopite97/devspace/actions/runs/39386456568)는
  07:25:53–07:26:25 UTC에 success였다. 런타임은 `9bdc2e1`과 동일하다.
  workflow의 실제 실행 컨테이너와 SSH inspect 모두 07:12:29 생성,
  기존 `acd1e951…` image ID를 가리켰다. 공개 결과 경로의 HTML도 같은 두 자산을 제공했다.
- 백엔드 컨테이너 생성은 04:30:06 UTC, image ID는
  `sha256:8be617c1365f67212301c803bceae0f1702871eea82f3da280b4a55d28de2029`였다.
  이번 실행에서는 프론트·백엔드 런타임 코드를 수정하거나 재배포하지 않았다.
- 사이트 허용 설정이 적용돼 App 페이지 접근에 성공했다. GitHub의 Confirm access는
  사용자가 직접 비밀번호로 완료했다. 자격 증명을 읽거나 저장하지 않았다.
- App `5374777`은 개인 계정에서만 설치 가능한 시험 App이었다.
  설치는 `172869880` 한 건, 선택 저장소는 공개 `kopite97/Test-Repo` 하나,
  권한은 Issues/Metadata read-only였다. 설치·쓰기 권한을 확대하지 않았다.
- 운영 DB의 해당 저장소 연결은 위 시험 프로젝트 한 건이었다. 로컬 DB의 두 연결은
  자동 가져오기 disabled였다. 시험에는 새 표식 라벨과 Issue #3–#5만 사용했고
  기존 #1/#2는 편집하지 않았다.
- 기존 Webhook URL과 secret 설정, SSL 검증을 확인한 뒤 Active를 켜고
  Issues/Label 이벤트를 구독했다. 원문 payload를 내려받지 않았으며,
  운영 DB는 `BEGIN READ ONLY` 안에서 필요한 메타데이터만 조회했다.

## 실제 조건 전환·상태 변경·중지와 재개

시험 라벨은 `plan0032-20261020-import` (`12763289580`)와
`plan0032-20261020-doing` (`12763289670`)다.
자동 조건에는 import 라벨만, Doing 매핑에는 doing 라벨만 지정했다.
관측 종료 기준은 작업 종결 및 Task/UI 일치로 두었고, source freshness 계약의
최대 15분 범위에서 기다렸다. 아래 시각은 UTC다. 수동 sync/번호 수집은 사용하지 않았다.

| 시나리오                | 관측 결과                                                                                                                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 기존 일치 baseline      | #3을 먼저 일치 상태로 수집한 뒤 조건 활성화. baseline `378076aa-4d34-4bd5-af75-78725c4fe9ec`가 08:04:05.807 완료. #3의 Task는 생성되지 않음                                                                                                                              |
| 새 비일치→일치          | #4 라벨 추가 delivery `1b1c9980-cc5d-11f1-993f-1535f514a3a2`를 08:06:09.720 접수. Issue job `69921ee0-721f-4159-92e0-06cd245056f5`, apply `69b4d229-d4f7-4ef2-8471-0f34e2640100` 완료. 08:06:10.649 Task 생성, revision 1, todo                                          |
| 제목·본문·Doing 라벨    | labeled `a36ef9e0-cc5d-11f1-9855-1a08d4d98c35`, edited `a3f84e20-cc5d-11f1-9626-be0d022dcfb3` 접수. 08:10:01.230까지 같은 Task의 제목·본문 갱신, revision 2, doing. 프로젝트 집계도 진행 중 1                                                                            |
| completed로 닫기        | `c03d3e60-cc5d-11f1-8ed4-5ed51e9df4dc` 접수 후 08:10:47.803 반영. revision 3, done, source_state_reason=completed. 편집기와 완료 집계 1 확인                                                                                                                             |
| 재개방                  | `dd2413f0-cc5d-11f1-80dd-071baaa82a2b` 접수 후 08:11:36.764 반영. revision 4, doing, source_state_reason=reopened                                                                                                                                                        |
| 중지 중 기존 Issue 변경 | revision 8에서 paused=true. #4 제목·본문 변경과 Doing 라벨 제거 delivery `0ed04b80-cc5e-11f1-80b9-02e6fa4565c5` / `0f095ce0-cc5e-11f1-89a2-d83b6d3f129a` 수집 완료. snapshot은 갱신됐지만 Task는 이전 제목·doing·revision 4 유지                                         |
| 중지 중 신규 일치 후보  | #5 opened `1117c79c-cc5e-11f1-9fbb-9389f2976b00`, labeled `1165c370-cc5e-11f1-9a35-6aec7cc17756` 수집 완료. Task 미생성                                                                                                                                                  |
| 재개                    | revision 9, baseline `12746490-8046-4d98-8d77-a355bd43191c` 08:13:20.377 완료, mapping `ecb36fae-a514-4d8a-9584-d62152009f9b` 08:13:21.399 완료. 기존 #4만 새 제목·todo·revision 5로 갱신. #5는 Task 미생성이며 후보 미리보기에 명시적 선택 대상으로 표시                |
| 재개 후 새 전환         | #5 라벨 제거 `318fb610-cc5e-11f1-9760-b7ed46312337` 수집 및 Task 부재 확인 후 다시 추가. `3f2d94e0-cc5e-11f1-87c6-5c4749f3ef6a` → Issue job `433d6e38-aaca-4c23-a93d-559e9b55607f` → apply `7d2019c7-2ce6-499e-893f-200f5b4138ee`. 08:14:21.138 새 Task 생성, revision 1 |

#4의 Task ID는 `1a5e6062-7be3-4978-9cf0-78eb41a3ea6b`,
#5는 `6f2fe3b3-c57c-425c-86ed-05c8083a0665`다.
새 source Task의 제목·본문·프로젝트·상태는 편집 불가이고 priority/tag는 편집 가능했다.
[source 편집기](webhook-source-editor.png)와 [본문·완료 매핑](webhook-closed-task.png)을 확인했다.
UI는 기존 상태 새로고침·직접 reload로 확인했으며 push UI/SSE를 가정하지 않았다.

## 중복 재전달과 접수 전 실패 복구

### 중복 재전달

완료된 `1b1c9980-cc5d-11f1-993f-1535f514a3a2`를 GitHub 화면에서
08:08:38에 재전달했다. [GitHub 응답은 202](webhook-duplicate-response.png)였다.
08:08:56 읽기 전용 관측에서 inbox의 received/completed 시각은 원래 값이고,
새 Issue/apply job은 없으며 #4의 Task ID·revision 1·todo가 유지됐다.
이후 운영 회수기의 별도 재전달도 관측됐지만 이를 신규 작업이나 접수 후 실패 복구로 계산하지 않았다.

### 영속 접수되지 않은 실제 delivery

단일 설치·선택 저장소만 있는 시험 App에서 수신 URL을 잠시
`/api/integrations/github/plan0032-unreceived`로 변경해 #4 edited 이벤트 한 건을 보냈다.
바로 정상 `/api/integrations/github/webhooks`로 복원했다. 서비스·DB·worker를 중단하거나
secret/SSL 설정을 변경하지 않았다.

- delivery `5370a780-cc5e-11f1-9951-d6a123290d56`, 최초 전달 08:14:53 UTC.
  [GitHub는 401](webhook-unreceived-401.png), 오류는 AUTH_REQUIRED였다.
  이는 잘못된 수신 경로의 인증 거부이며 앞선 서명 음성 시험과 구별한다.
- 08:16:01 운영 inbox 조회의 가장 최근 접수는 08:14:19였고 이 delivery는 없었다.
  #4 snapshot/Task도 이전 제목과 revision 5였다. 따라서 접수 후 응답 유실 사례가 아니다.
- GitHub 재전달 확인창에서 정상 수신 URL을 대조하고 같은 delivery를 08:16:32 재전달했다.
  [응답은 202](webhook-recovered-202.png). inbox 최초 received_at=08:16:32.100,
  completed_at=08:16:32.555로 새 접수가 확인됐다.
- Issue job `3f9015cc-c113-4f68-ba7e-b45ecb703d5a` 완료 08:16:46.980,
  apply `20d133b5-07fd-4c82-a864-c01560b21cd4` 완료 08:16:46.992.
  같은 #4 Task가 복구 시험 제목·본문으로 바뀌고 revision 6이 됐다.
  공개 편집기에서도 새 내용과 source 편집 제한을 확인했다.

202만으로 통과하지 않고 신규 inbox 접수→수집→apply→Task/UI를 확인했다.
앞서 접수됐던 delivery의 중복 202와 위 미접수 delivery의 신규 접수를 구분했다.

## 공개 로그인·세션과 일반 Task 회귀

실제 공개 서비스에서 Log out 후 로그인 전용 화면과 보호 데이터 제거를 확인했다.
Google로 계속하기를 눌러 기존 Google provider 세션으로 새 서비스 로그인을 완료했고,
원래 공개 프로젝트 경로로 돌아와 프로젝트와 source Task를 재조회했다.
새 비밀번호 입력은 필요하지 않았다. 로컬 5173 callback 문제의 해결로 계산하지 않는다.

이 새 서비스 세션에서 GitHub 다시 인증을 수행해
`/github/connection-result?github=connected`로 복귀했다.
account 재조회, 결과 reload, 쿼리 없는 `/github/connection-result` 직접 접근에서도
연결됨과 @kopite97이 유지됐다. [최종 연결 화면](oauth-result-reloaded.png).

일반 Task `03c7a7e7-2245-4833-811c-b2c5cfafbc95`를 공개 UI에서 생성해
제목·본문·태그 입력과 doing 저장을 확인했다. #4 원문 복원 Webhook 뒤에도
source_type=local, revision 1, doing, tag=plan0032-control로 보존됐다.
기존 #2는 high/plan0032/revision 2를 유지했다. 일반 Task의 제목·본문·프로젝트·상태가
계속 편집 가능함도 [최종 편집기](ordinary-task-control.png)에서 확인했다.

## 최종 복원과 보존 자원

- 설정: revision 11, enabled=false, paused=false, generation 9, baseline_ready=true,
  labelIds/assigneeIds=[], todo/doing/done 매핑 null. revision은 되돌리지 않았다.
  [복원된 설정 화면](settings-restored.png)과 CSV를 함께 보존한다.
- #4 제목·본문·라벨은 생성 직후 의미로 복원했고 open 상태다.
  복원 delivery `8a87a1a0-cc5f-11f1-988f-bb4e1b968e2f` /
  `8af27160-cc5f-11f1-9c2c-fc9b64dea049` 후 Task revision 7과 원문 일치를 확인했다.
- 기존 원격 #1/#2는 그대로다. 새 #3/#5와 표식 라벨 두 개는 검토·재개를 위해 보존했다.
  시험 프로젝트에는 GitHub Task 3개와 일반 control Task 1개가 남는다. 영구 삭제하지 않았다.
- Webhook은 정상 공개 URL, Active=true, Issues/Label 구독, SSL 검증 활성으로 유지한다.
  시험 종료만을 이유로 필요한 전달 기능을 끄지 않았다.

최종 읽기 전용 메타데이터: [delivery 20건](deliveries.csv), [작업 30건](jobs.csv),
[Task 4건](tasks.csv), [복원 설정](settings.csv).
CSV에는 원문 payload·토큰·secret·쿠키가 없다. job과 delivery의 대응은
동일 Issue·서버 enqueue/완료 시각을 대조한 것이며, API가 별도 상관 ID를 제공한다고 주장하지 않는다.

## 추가 시험과 인계

| 항목                                     | 결과와 재개 조건                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 조직 승인·보조 계정 권한 철회·계정 교체  | 미실행. 현재 owner-only 개인 App과 단일 개인 설치만 확인했다. 별도 조직/보조 신원과 그 자원에 대한 철회·교체 범위가 준비된 뒤 재개                                                                                                                                                              |
| 별도 설치의 저장소 제외·재추가·중단·복구 | 미실행. 현재 검증 연결을 유지했으며 별도 수명주기 시험 설치를 확보하지 않았다. 원격 접근 재검증/가림·복원까지 관측 가능한 별도 설치에서 재개                                                                                                                                                    |
| 일반 Task 전환                           | 확인창 자동화 제약으로 결과 미확인. 브라우저 confirm 수락 경로가 Emulation.setFocusEmulationEnabled 시간 초과를 반환했고, 운영 Task는 source_type=github, exclusions=0으로 유지됐다. 성공이나 서버 결함으로 단정하지 않는다. #5에서 사용자 직접 확인창 조작 또는 정상 확인창 제어 수단으로 재개 |
| convert/purge·50개 초과 부분 해제·재개   | 미실행. 파괴 시험용 별도 대량 데이터/부분 실패 자원이 없다. 폐기 대상·일반 사본 보존 범위와 복원 불가 범위를 특정한 뒤 재개                                                                                                                                                                     |
| 접수 후 inbox/job 실패 주입              | 미실행. 안전한 별도 실패 주입 자원이 없다. 실제 종결 실패가 생기면 원래 작업과 새 sync 결과를 분리해 backoff/운영 복구를 확인. 중복 delivery 재전달을 재처리 강제로 쓰지 않음                                                                                                                   |

필수 시나리오에서 수용을 막는 앱/데이터 결함은 관측되지 않았다.
백엔드 런타임 수정이나 PLAN-0017 상태 변경은 하지 않았다. 위 추가 실제 시험과 기존 계약상
담당자 검색·전체 작업 이력·취소 등의 인계는 후속 범위로 유지한다.

## 검사 범위

이번 후속 실행은 실서비스 검증·증거 문서만 추가했다. 런타임 코드·의존성·세션/프록시 설정을
수정하지 않아 같은 코드의 1차 단위 261개/GitHub Playwright 37개/빌드·경계·쿼리와
PLAN-0031 현재 회귀·격리 Vite/Nginx 결과를 재사용한다. 새 실서비스 통과와 과거 모의 통과는 구분했다.
변경 Markdown Prettier, 변경 문서 상대 링크, `git diff --check`를 통과했다.
`npm.cmd run check:docs`는 PLAN-0006~0008의 기존 `../../../backend/` 링크 33건에서 실패했다.
이번 변경의 새 링크 오류는 없으며 전체 docs 검사를 통과했다고 기록하지 않는다.
