# Document Editor Backend 보완 요청

Date: 2026-09-23
Status: 보완 계약 확인 및 Frontend 실제 API 통합 검증 완료

## 2026-09-23 보완 결과

아래 요청안은 이력으로 보존한다. 사용자 전달 후 live OpenAPI를 재확인했고 다음 계약이 확정되어 metadata 계약 gate를 해소했다.

- DocumentSnapshot의 필수 `attachments`가 전체 ATTACHED metadata를 제공한다. 별도 metadata endpoint는 추가하지 않는다.
- AttachedSnapshot의 id, documentId, originalFilename, contentType, size, status, contentUrl, createdAt은 필수이며 attachmentIds와 같은 snapshot·UUID 순서다. 최대 100개 전체를 반환하고 TEMP는 제외한다. 저장 metadata 불일치는 500 INTERNAL_ERROR다.
- 본문 기본 1,048,576바이트, 전체 JSON 1,114,112바이트, 깊이 100, 파일 기본 10MiB, multipart 전체 11MiB를 명시했다. 바이트 초과는 413, 입력/파일 내용 오류는 400, HTTP media type 오류는 415다.
- deletedId는 필수 UUID다. ATTACHMENT_IN_USE / ATTACHMENT_DELETION_PENDING은 409, STORAGE_UNAVAILABLE은 503이며 삭제 claim 이후 조회·재연결 제한을 명시했다.
- 문서 생성과 첨부 업로드는 replay를 보장하지 않는다. 자동 재시도하지 않는다.

Frontend는 서버 metadata를 검증해 Registry를 복원하며 저장 중 업로드한 TEMP와 detach 후 Undo metadata를 보존한다. Nginx 요청 한도 12MiB와 업로드 timeout 60초를 적용했다. 기존 disposable harness의 PostgreSQL·Backend 임시 파일 저장소로 Vite/fresh Nginx 통합과 filename 255 UTF-16 경계를 검증했다. 8080 업무 환경에는 조회만 수행했다. [검증 근거와 남은 UI 검증](../reviews/plan0025-document-editor/readme.md)을 참고한다.

## 최초 요청 이력

## 배경

[PLAN-0025](../plans/PLAN-0025-journal-document-editor.md)는 실제 API 연동을 목표로 수정했다. 로컬 Swagger/OpenAPI에서 Document 6개·Attachment 3개 operation을 확인했다. 현재 Document detail은 `attachmentIds`만 반환하고 첨부 조회는 binary content만 제공한다. 따라서 새로고침 후 Attachment Registry의 metadata를 서버 근거로 복원할 경로가 없다.

이 문서는 Backend에 전달할 요청안이며 현재 API를 확장하거나 Backend 작업을 승인한 기록이 아니다. 아직 요청을 외부로 전송하지 않았다.

## 필수 요청: 첨부 metadata 복원

문서의 첨부를 서버에서 검증하여 일괄 조회하는 방식을 제공해 달라고 요청한다. 별도 Document-scoped metadata 조회를 우선 제안하되 Document detail에 metadata를 포함하는 방식도 가능하다. 경로와 wrapper는 Backend가 기존 convention에 맞게 제안·확정한다. Frontend가 임의 endpoint를 먼저 구현하지 않는다.

필요한 정보는 기존 업로드 응답과 동일한 다음 필드다.

```text
id, documentId, originalFilename, contentType, size,
status, contentUrl, createdAt
```

수용 기준:

- 세션 소유권·Document 소속을 서버에서 검증한다. 타 사용자/타 Document 첨부를 임의 조회하거나 연결할 수 없어야 한다.
- 저장된 `attachmentIds` 전체를 일괄 복원할 수 있어야 한다. 최대 100개에 대한 wrapper·상한·필요 시 pagination을 명시하고 조용한 잘림을 허용하지 않는다.
- 누락·삭제됨·삭제 진행 중 ID의 처리 방식과 HTTP/code를 문서화한다. Frontend가 일부 응답 누락을 정상 빈 집합으로 해석해 detach하지 않도록 한다.
- TEMP/ATTACHED 조회 범위를 명시한다. 저장된 ATTACHED 복원은 필수이며, 같은 세션의 성공 업로드 TEMP metadata는 Frontend 메모리로 보존한다. 응답 유실 업로드의 검색·복구 API까지 이번 필수 범위에 포함하지 않는다.
- stable same-origin contentUrl을 반환하고 MinIO objectKey·내부 URL·자격정보·만료 presigned URL을 노출하지 않는다.
- Document detail과 별도 metadata 응답 사이에 detach/delete가 발생했을 때의 정합성·재조회 정책을 설명한다. 기존 cache/freshness 헤더 적용 여부도 명시한다.
- OpenAPI DTO/권한/오류 설명과 회귀 테스트를 추가한다. 실제 upload → save → reload → metadata 복원 → 편집/save, 타 사용자 접근 차단, 누락·삭제 중 처리까지 검증한다.

Frontend는 확정 전 임시 resolver·파일명/확장자/URL parsing으로 소유권·metadata를 추정하지 않는다. 복원 실패 시 기존 본문을 유지하고 저장을 차단한다. 전체 통합 완료는 이 gate 해결 이후다.

## 계약 명세 보완 요청

기존 구현을 변경하라는 요청이 아니라 다음 설정·제약을 OpenAPI 설명과 운영 설정 기준으로 확인해 달라는 요청이다.

- 본문 UTF-8 직렬화 1MiB, nesting depth 100, filename 255 UTF-16 units, 파일 기본 10MiB, multipart 전체 11MiB의 실제 값과 재설정 가능 여부.
- 허용 PNG/JPEG/PDF/UTF-8 TXT의 검증 방식 및 400/413/415 오류 구분.
- `ATTACHMENT_IN_USE`, `ATTACHMENT_DELETION_PENDING`, `STORAGE_UNAVAILABLE` 등 정확한 code와 삭제 claim 이후 조회/재연결 정책.
- `DeletedDocument`/`DeletedAttachment`의 `deletedId`는 실제 성공 응답의 필수 UUID라면 OpenAPI `required`에도 반영. 현재 읽은 schema는 property만 표시하고 required를 명시하지 않는다.
- 일반 응답 헤더의 creation replay 설명이 새 Document/Attachment에도 공통 노출되지만 이 두 생성 operation은 replay 보장이 없다는 점을 명확히 구분한다.

Nginx 업로드 용량과 Frontend timeout 조정은 Frontend 구현 범위다. Backend 설정 확인을 근거로 multipart 여유를 포함해 정하고 실제 Vite/Nginx 전송으로 검증한다.

## 이번 필수 요청이 아닌 항목

생성·업로드 idempotency, Document revision/ETag, 전역 목록·생성, Unpublish, DocumentSpace CRUD는 추가 요구하지 않는다. Frontend는 현재 계약에 따라 순차 PUT과 명시적 재시도/결과 확인을 구현하고 다중 탭 lost update 및 timeout 후 중복 생성 위험의 한계를 유지한다.
