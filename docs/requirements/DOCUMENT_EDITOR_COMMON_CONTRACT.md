# Document Editor — Common Domain & API Contract

## 1. 문서 목적

본 문서는 Document Editor 구현을 위한 Frontend / Backend 공통 Domain 및 API 계약이다.

Frontend와 Backend는 구현 PLAN을 작성하기 전에 본 계약을 기준으로 삼는다.

한쪽에서 임의로 계약을 변경하지 않는다.

2026-09-23 로컬 Swagger/OpenAPI에서 Document 6개·Attachment 3개 operation과 DTO를 확인했다. `DocumentSnapshot.attachments` 필수 배열로 Registry metadata 복원 계약이 확정되었다. [Backend 보완 결과](document-editor-backend-followup.md)를 기준으로 구현하며 실제 CRUD/파일 복원은 별도 통합 검증으로 확인한다.

JournalId·DocumentId·AttachmentId·documentSpaceId·authorId 및 createdBy는 wire에서 UUID 문자열을 기준으로 한다. Frontend는 이 식별자를 opaque string으로 다루고 숫자로 변환하거나 값의 구조로 관계를 추론하지 않는다. 아래 UUID는 설명용 예시다.

---

# 2. 현재 Domain 구조

1차 구현:

```text
Journal
   ↓
DocumentSpace
   ↓
Document
   ↓
Attachment
```

Cardinality:

```text
Journal 1 : 1 DocumentSpace

DocumentSpace 1 : N Document

Document 1 : N Attachment
```

---

# 3. DocumentSpace의 역할

`DocumentSpace`는 범용 Document Collection이다.

현재는 Journal이 사용한다.

향후 다른 Domain도 같은 방식으로 연결할 수 있다.

예:

```text
Project
   ↓
DocumentSpace

Milestone
   ↓
DocumentSpace
```

현재는 해당 연동을 구현하지 않는다.

---

# 4. 의존성 방향

허용:

```text
Journal → DocumentSpace

Document → DocumentSpace

Attachment → Document
```

금지:

```text
DocumentSpace → Journal

Document → Journal
```

Document/DocumentSpace는 자신을 사용하는 상위 Domain의 종류를 알지 않는다.

---

# 5. DocumentSpace Model

```text
DocumentSpace
────────────────
id
createdAt
updatedAt
```

1차에서는 다음 Generic Owner 필드를 사용하지 않는다.

```text
ownerType
ownerId
```

상위 Domain이 `documentSpaceId`를 참조한다.

---

# 6. Journal Model 연동

기존 Journal Domain에 DocumentSpace 참조가 추가된다.

논리적 구조:

```text
Journal
────────────────
id
...
documentSpaceId
```

정확한 Entity Mapping은 기존 Backend Architecture를 따른다.

위 구조는 내부 관계 설명이다. 현재 공개 JournalResponse에는 documentSpaceId가 없으며 Frontend Journal parser의 필수 필드로 추가하지 않는다.

---

# 7. Document Model

```text
Document
────────────────
id
documentSpaceId
title
content
status
authorId
createdAt
updatedAt
publishedAt
```

`documentSpaceId NOT NULL`.

---

# 8. Attachment Model

```text
Attachment
────────────────
id
documentId
originalFilename
objectKey
contentType
size
status
createdBy
createdAt
updatedAt
```

`documentId NOT NULL`.

---

# 9. Document Status

```text
DRAFT
PUBLISHED
```

전이:

```text
Create
 ↓
DRAFT
 ↓
Publish
 ↓
PUBLISHED
```

1차에서는 Unpublish 기능을 정의하지 않는다.

---

# 10. Attachment Status

```text
TEMP
ATTACHED
```

전이:

```text
Upload
 ↓
TEMP
 ↓
Document Save attachmentIds 포함
 ↓
ATTACHED
```

제거:

```text
ATTACHED
 ↓
Document Save attachmentIds에서 제외
 ↓
TEMP
 ↓
Grace Period
 ↓
Cleanup
```

---

# 11. Document Content

`content`는 BlockNote의 Document JSON을 그대로 사용한다.

예:

```json
[
  {
    "id": "block-id",
    "type": "paragraph",
    "props": {},
    "content": [
      {
        "type": "text",
        "text": "Hello",
        "styles": {}
      }
    ],
    "children": []
  }
]
```

실제 Schema는 설치된 BlockNote 버전의 `editor.document`를 기준으로 한다.

Backend는 자체 Block Schema를 정의하지 않는다.

---

# 12. Journal Document Collection API

Document 생성 및 목록은 Journal Context에서 수행한다.

API:

```http
POST /api/v2/journals/{journalId}/documents

GET /api/v2/journals/{journalId}/documents?limit=20&cursor={cursor}
```

위 경로는 live OpenAPI에 등록되어 있다. 생성 201은 DRAFT 상세, 목록 200은 items/total/nextCursor를 반환한다.

---

# 13. Generic Document 생성 API

1차 Public API는 다음 전역 생성 Endpoint를 제공하지 않는다.

```http
POST /api/v2/documents
```

Document 생성은 Journal의 DocumentSpace를 통해 수행한다.

---

# 14. Generic Document 목록 API

1차 Public API는 다음 전역 목록 Endpoint를 제공하지 않는다.

```http
GET /api/v2/documents
```

Document 목록은 Journal Context에서 조회한다.

---

# 15. Document Detail API

Document 생성 이후에는 `documentId`로 공용 Editor API를 사용할 수 있다.

```http
GET    /api/v2/documents/{documentId}

PUT    /api/v2/documents/{documentId}

DELETE /api/v2/documents/{documentId}

POST   /api/v2/documents/{documentId}/publish
```

---

# 16. Create Document Request

예시:

```json
{
  "title": "",
  "content": [...]
}
```

Client가 다음 값을 직접 지정하지 않는다.

```text
documentSpaceId
authorId
status
createdAt
updatedAt
publishedAt
```

Backend가 `journalId`로 Journal의 DocumentSpace를 Resolve한다. 제목은 빈 문자열 허용·최대 200, content는 빈 JSON 배열 허용·UTF-8 직렬화 최대 1MiB다. 생성에는 replay 보장이 없으므로 timeout 후 자동 재시도하지 않는다.

---

# 17. Create Document Response

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440123",
  "documentSpaceId": "550e8400-e29b-41d4-a716-446655440100",
  "title": "",
  "content": [...],
  "attachmentIds": [],
  "attachments": [],
  "status": "DRAFT",
  "authorId": "550e8400-e29b-41d4-a716-446655440010",
  "createdAt": "2026-09-22T16:30:00+09:00",
  "updatedAt": "2026-09-22T16:30:00+09:00",
  "publishedAt": null
}
```

`documentSpaceId`는 읽기 정보다.

Client가 변경하지 않는다.

---

# 18. Document Detail Response

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440123",
  "documentSpaceId": "550e8400-e29b-41d4-a716-446655440100",
  "title": "오늘의 개발 기록",
  "content": [...],
  "attachmentIds": ["550e8400-e29b-41d4-a716-446655440501", "550e8400-e29b-41d4-a716-446655440502"],
  "attachments": [...],
  "status": "DRAFT",
  "authorId": "550e8400-e29b-41d4-a716-446655440010",
  "createdAt": "2026-09-22T16:30:00+09:00",
  "updatedAt": "2026-09-22T16:40:00+09:00",
  "publishedAt": null
}
```

`attachmentIds`는 Document Table 컬럼이 아니다.

Attachment Relation에서 파생되는 API DTO 값이다.

위 상세 예시에는 추가 필수 필드인 `attachments`가 포함되어야 한다. `AttachedSnapshot[]`는 `id, documentId, originalFilename, contentType, size, status, contentUrl, createdAt`을 모두 제공하며 status는 ATTACHED다. attachmentIds와 같은 snapshot·UUID 순서이고 최대 100개 전체를 반환하며 TEMP는 제외한다. 일부 누락·소속 불일치·중복·길이 불일치는 오류로 처리한다. filename·URL parsing으로 소유 관계를 추론하거나 실패를 빈 Registry로 대체하지 않는다. 서버 ATTACHED 응답을 병합할 때 저장 중 새로 업로드한 TEMP 및 detach 후 Undo용 metadata를 보존한다.

---

# 19. Update Document

```http
PUT /api/v2/documents/{documentId}
```

Request:

```json
{
  "title": "오늘의 개발 기록",
  "content": [...],
  "attachmentIds": ["550e8400-e29b-41d4-a716-446655440501", "550e8400-e29b-41d4-a716-446655440502"]
}
```

Client가 다음 값은 변경하지 않는다.

```text
documentSpaceId
status
authorId
createdAt
publishedAt
```

---

# 20. content와 attachmentIds

## content

문서의 화면 구조를 의미한다.

```text
Heading
Paragraph
Table
Image 위치
File 위치
...
```

## attachmentIds

현재 Document가 실제 사용하는 Backend Attachment 집합이다.

Attachment Lifecycle 관리의 Source of Truth다.

---

# 21. Attachment 일관성

Frontend:

> 서비스 Attachment를 사용하는 Block이 현재 Document에 존재하면 해당 ID를 `attachmentIds`에 포함한다.

Backend:

> 전달받은 모든 Attachment가 실제 존재하며 해당 Document에 소속되고 사용자에게 접근 권한이 있는지 검증한다.

Backend는 BlockNote JSON 안을 분석하여 Attachment 관계를 판단하지 않는다.

---

# 22. Autosave

Frontend:

```text
Editor Change
 ↓
Debounce
 ↓
PUT Document
```

동일 Document에 대한 Save Request는 직렬화한다.

Backend는 각 PUT을 해당 시점 Document 전체 상태로 취급한다. title/content/attachmentIds가 필수이며 attachmentIds는 중복 없는 UUID 배열 최대 100개다. []는 모든 연결을 해제한다. PUT 성공은 200 문서 상세다.

문서 revision/ETag 계약은 없으며 session 내 직렬화가 다중 탭 lost update를 방지하지는 않는다. X-Workspace-Data-Revision은 10진 문자열 freshness 관측 값이며 편집 잠금/revision이 아니다.

---

# 23. Publish

```http
POST /api/v2/documents/{documentId}/publish
```

Frontend는 최신 PUT이 성공한 이후 본문 없는 Publish를 수행한다. 성공은 200 문서 상세다. PUBLISHED도 PUT으로 수정할 수 있고 반복 게시 시 최초 publishedAt을 유지한다. 저장된 수정은 재게시 전 비공개 초안이 아니다.

```text
Latest Editor State
 ↓
Save Success
 ↓
Publish
```

---

# 24. Journal Document List

예시:

```http
GET /api/v2/journals/{journalId}/documents?limit=20&cursor={cursor}
```

목록은 상세에서 documentSpaceId/content/attachmentIds/attachments를 제외한 요약을 반환한다.

예:

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440123",
      "title": "오늘의 개발 기록",
      "status": "PUBLISHED",
      "authorId": "550e8400-e29b-41d4-a716-446655440010",
      "createdAt": "2026-09-22T16:30:00+09:00",
      "updatedAt": "2026-09-22T16:40:00+09:00",
      "publishedAt": "2026-09-22T16:40:00+09:00"
    }
  ],
  "total": 1,
  "nextCursor": null
}
```

limit은 기본 20, 범위 1–100이며 createdAt/id 내림차순이다. 검색·상태 필터는 제공하지 않는다. 첫 요청에는 cursor를 생략하고 opaque nextCursor를 그대로 전달하며 null은 마지막 페이지다. 한 응답의 total/page는 동일 snapshot이나 여러 페이지는 단일 snapshot이 아니다.

---

# 25. Attachment Upload

```http
POST /api/v2/attachments
Content-Type: multipart/form-data
```

Form:

```text
documentId = 550e8400-e29b-41d4-a716-446655440123
file       = <binary>
```

Document가 존재하기 전에 Attachment를 Upload할 수 없다. documentId 텍스트와 file 1개를 전송하며 성공은 201 TEMP 첨부 정보다. PNG/JPEG/PDF/UTF-8 TXT만 허용하고 빈 파일은 거부하며 기본 파일당 10MiB다. 업로드 timeout 재시도는 중복을 만들 수 있으므로 자동 replay하지 않는다. multipart 11MiB 등 실제 설정 경계는 Frontend Requirements와 대조·검증한다.

---

# 26. Attachment Upload Response

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440501",
  "documentId": "550e8400-e29b-41d4-a716-446655440123",
  "originalFilename": "architecture.png",
  "contentType": "image/png",
  "size": 245813,
  "status": "TEMP",
  "contentUrl": "/api/v2/attachments/550e8400-e29b-41d4-a716-446655440501/content",
  "createdAt": "2026-09-22T16:42:00+09:00"
}
```

Frontend는 최소 다음 값을 추적한다.

```text
id
contentUrl
```

---

# 27. Attachment Content

```http
GET /api/v2/attachments/{attachmentId}/content
```

이 Endpoint는 안정적인 Application URL이다.

현재 구현은 인증된 binary streaming이다. TEMP/ATTACHED 모두 조회할 수 있고 삭제 claim 이후에는 404가 될 수 있다. PNG/JPEG는 inline, PDF/TXT는 다운로드한다. Content-Type/Length/Disposition과 no-store 응답을 따르며 range/cache 지원을 가정하지 않는다. Presigned redirect는 현재 계약에 포함하지 않는다.

---

# 28. Document에 저장하지 않는 Storage 정보

다음 값은 Document JSON에 영구 저장하지 않는다.

```text
MinIO Internal URL
Bucket URL
Object Key
Expiring Presigned URL
```

---

# 29. Attachment Delete

```http
DELETE /api/v2/attachments/{attachmentId}
```

TEMP:

```text
삭제 허용
```

ATTACHED:

```text
409 Conflict
ATTACHMENT_IN_USE
```

먼저 Document에서 제거하고 Save하여 TEMP로 전환한다. TEMP DELETE 성공 200 {deletedId}는 파일과 metadata 삭제 완료를 뜻한다. 저장소 장애 503에서는 durable retry claim이 유지될 수 있으며 삭제 진행 중 재연결/중복 삭제는 409로 처리한다.

---

# 30. Attachment Reconciliation

기존 상태:

```text
550e8400-e29b-41d4-a716-446655440501 ATTACHED
550e8400-e29b-41d4-a716-446655440502 ATTACHED
550e8400-e29b-41d4-a716-446655440503 TEMP
```

Document Save:

```json
{
  "attachmentIds": ["550e8400-e29b-41d4-a716-446655440501", "550e8400-e29b-41d4-a716-446655440503"]
}
```

결과:

```text
550e8400-e29b-41d4-a716-446655440501 ATTACHED
550e8400-e29b-41d4-a716-446655440502 TEMP
550e8400-e29b-41d4-a716-446655440503 ATTACHED
```

MinIO Object는 이동하지 않는다.

---

# 31. Document 삭제

```http
DELETE /api/v2/documents/{documentId}
```

삭제 시:

```text
Document
 ↓
Attachments
 ↓
MinIO Objects
```

정리는 Backend 책임이다. DELETE 200 {deletedId}는 DB 삭제와 파일 정리 작업 영속화를 뜻하며 실제 물리 파일 삭제는 장애 시 지연될 수 있다. Frontend가 파일별 삭제를 연쇄 호출하지 않는다.

---

# 32. Journal 삭제

Journal이 DocumentSpace를 독점 소유한다.

따라서 Journal 삭제 Lifecycle은 다음 관계를 고려한다.

```text
Journal
 ↓
DocumentSpace
 ↓
Documents
 ↓
Attachments
 ↓
MinIO Objects
```

실제 Soft Delete/Hard Delete 여부는 기존 Journal 정책을 따른다.

---

# 33. DocumentSpace 직접 API

현재 Public API로 다음 기능을 제공하지 않는다.

```text
DocumentSpace 생성
DocumentSpace 삭제
DocumentSpace 수정
DocumentSpace 목록
```

DocumentSpace Lifecycle은 상위 Domain 및 Backend Application Service에서 관리한다.

---

# 34. 현재 구현 대상

포함:

```text
DocumentSpace
Journal ↔ DocumentSpace
Document
Attachment
BlockNote JSON
MinIO
Autosave
DRAFT / PUBLISHED
Journal Document 목록
공용 Document Editor / Viewer
```

---

# 35. 현재 제외 대상

```text
Project ↔ DocumentSpace
Milestone ↔ DocumentSpace
Resource ↔ DocumentSpace

Collaboration
Comment
Mention
Template
History
Revision
Share Link
Kanban
Calendar
AI
Custom Widget
GitHub Integration
Server Integration
Kubernetes Integration
```

현재 필요하지 않은 연결과 기능을 미리 구현하지 않는다.

---

# 36. 향후 Domain 연결 원칙

향후 새로운 Domain에 Document 기능이 필요하면:

```text
NewDomain
   ↓
DocumentSpace
   ↓
Document
   ↓
Attachment
```

구조를 재사용한다.

Document에 `journalId`, `projectId` 등 Domain 전용 FK를 추가하지 않는다.

---

# 37. Environment Contract

환경 의존 설정:

```text
PostgreSQL Endpoint
MinIO Endpoint
MinIO Credentials
MinIO Bucket
Profile
```

은 외부 설정으로 관리한다.

Local과 Mini PC 서버에서 동일한 Application Artifact를 사용한다.

---

# 38. Local 개발 환경

```text
React
→ Local

Spring Boot
→ Local

PostgreSQL
→ Local 또는 Docker Compose

MinIO
→ Docker Compose
```

Frontend는 MinIO와 직접 통신하지 않는다.

---

# 39. 1차 통합 성공 시나리오

최소 다음 흐름이 성공해야 한다.

```text
1. Journal 조회

2. 해당 Journal의 Document 목록 조회

3. 새 Document 생성

4. Journal의 DocumentSpace에 DRAFT Document 저장

5. 공용 Editor 진입

6. 제목 / BlockNote Content 작성

7. Attachment Upload
   → TEMP
   → MinIO 저장

8. Autosave
   → attachmentIds 포함
   → ATTACHED

9. 새로고침

10. 동일한 Content 및 Attachment 복원

11. Publish

12. Journal Document 목록에서 게시글 확인

13. Read-only Viewer 조회

14. Attachment Block 제거

15. Save
    → ATTACHED → TEMP

16. Grace Period 후 Cleanup

17. Document 삭제
    → Attachment/MinIO 정리

18. Journal 삭제 시
    → DocumentSpace Lifecycle 정상 처리
```

Frontend와 Backend의 구현 PLAN은 이 계약을 기준으로 작성한다.

## 공통 보안·오류 및 검증 근거

세션 인증과 변경 요청의 X-CSRF-Token·Origin 정책을 유지한다. 오류 응답은 {code,message,fieldErrors,requestId}; 400/401/403/404/409/413/415/500/503을 구분한다. 문서 입력·생성·업로드 제한의 상세 UX는 [Frontend Requirements](DOCUMENT_EDITOR_FRONTEND_REQUIREMENTS.md), 구현·실제 검증 범위는 [PLAN-0025](../plans/PLAN-0025-journal-document-editor.md)를 따른다.
