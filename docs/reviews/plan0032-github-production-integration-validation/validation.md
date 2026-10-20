# PLAN-0032 배포·실제 통합 검증

검증일: 2026-10-20. [PLAN-0032](../../plans/PLAN-0032-github-production-integration-validation.md)는 active다.
아래는 현재까지 관측한 결과이며 전체 Webhook 검증 완료를 뜻하지 않는다.

## 배포와 기준

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

## 공개 서비스 관측

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

## 접근 제약과 남은 검증

GitHub App 설정 페이지를 브라우저로 열 때 origin 보안 승인에서 사용자 거절이 반환됐다.
사용자가 재허용 의사를 표시한 뒤 재시도했으나 저장된 origin 권한 설정 차단이 반환됐다.
사용자가 허용 목록을 추가했고 새 세션이 필요할 수 있다고 알려, 이번 세션의 독립 검증과
복원을 마친 뒤 새 세션에서 GitHub 화면 검증을 재개하기로 했다.
동일 설정 조회를 API/다른 브라우저로 우회하지 않았다.

## 새 세션 재개 순서

1. workflow와 active PLAN-0032를 읽고 main/배포 SHA를 확인한다.
   현재 배포와 코드가 같으면 테스트를 위해 빈 push나 재빌드를 하지 않는다.
   변경을 배포하면 해당 SHA의 자동 배포 완료를 다시 확인한다.
2. Chrome에서 공개 시험 프로젝트
   `https://devspace.nellucia.dev/projects/d3e8e7ea-7bc0-47bb-8046-5fcfb737a471`를 연다.
   기존 세션을 재사용할 수 있으나 별도의 새 서비스 로그인 왕복은 아직 미검증임을 구분한다.
3. `https://github.com/settings/apps/kopite-test-app`의 사이트 권한이 적용됐는지 확인한다.
   정상 접근 시 현재 이벤트 구독·Webhook 활성 상태·수신 URL·설치 범위를 읽는다.
   다시 거절되면 우회하지 않고 실제 권한 적용 상태를 사용자에게 알린다.
4. 이 시험 저장소의 원격 편집이 다른 설치/로컬 연결에 미치는 영향을 확인한 뒤,
   실행별 표식이 있는 새 시험 Issue/라벨로 조건 전환·중지 중 변경·재개를 검증한다.
   기존 #1/#2의 상태·본문을 임의로 시험용 덮어쓰기하지 않는다.
5. 실제 delivery→inbox→job/Task→프론트의 근거를 연결한다.
   정상 서명 전달·중복 재전달·접수 전 실패 복구는 아직 미검증이다.
   App 관리자 조회/재전달 권한과 전용 실패 시험 자원이 필요하다.
6. 별도 조직·철회·대량 정리 자원이 없으면 그 근거를 기록하고 추가 항목으로 인계한다.
   필수 실제 이벤트·복구 시험이 미완료인 동안 PLAN-0032는 active로 유지한다.
