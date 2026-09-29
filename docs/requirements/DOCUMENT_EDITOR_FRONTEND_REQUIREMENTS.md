# Document Editor — Frontend Requirements

## 1. 문서 목적

2026-09-23 갱신: 사용자 제공 Backend 계약과 live Swagger/OpenAPI를 기준으로 실제 API 연동을 목표로 한다. 기존 작성 내용은 유지하며 종전 Mock 우선 단계만 실제 통합 기준으로 대체했다.

본 문서는 공용 Document Editor의 Frontend 1차 요구사항 및 구현 PLAN 수립 기준을 정의한다.

본 문서 자체는 구현 PLAN이 아니다.

Document Editor의 Domain/API 계약은 `DOCUMENT_EDITOR_COMMON_CONTRACT.md`를 따른다. 공통 계약과 본 문서가 충돌하는 경우 공통 계약을 우선하며, 공통 계약의 최종 기준은 Backend `PLAN-0015`다.

Frontend 작업자는 현재 코드베이스의 Router, API Client, QueryManager, 인증, 상태관리, UI Component 및 `journals` 관련 구현을 확인한 뒤 본 요구사항을 만족하는 PLAN을 작성한다.

---

# 2. 핵심 구조

1차 Document 기능은 다음 구조를 전제로 한다.

```text
Journal
   ↓
DocumentSpace
   ↓
Document
   ↓
Attachment
```

관계:

```text
Journal 1 : 1 DocumentSpace

DocumentSpace 1 : N Document

Document 1 : N Attachment
```

Frontend가 직접 관리하는 것은 Journal Context, Document, Attachment다.

`DocumentSpace`는 Backend 내부의 범용 Document Collection 개념이며 Frontend에서 생성·선택·수정·삭제하는 UI를 제공하지 않는다.

---

# 3. 현재 실제 적용 범위

1차 실제 연동 대상은 다음 하나다.

```text
journals
```

현재 다음 Domain에는 Document 기능을 연결하지 않는다.

```text
Project
Milestone
Resource
```

향후 다른 Domain이 Document 기능을 사용할 수 있으므로 공용 Document Editor/Viewer 자체를 `journals` 전용 Component로 만들지 않는다.

---

# 4. 사용자 UX 목표

일반 textarea 또는 Markdown Editor가 아니라 BlockNote 기반의 Notion 스타일 Block Editor를 제공한다.

대표 흐름:

```text
Journals
   ↓
Journal 선택
   ↓
Journal Viewer
   ↓
Documents
   ↓
Document Viewer
```

작성 흐름:

```text
Journals / Journal Viewer
   ↓
새 글 작성
   ↓
Journal Context 확인
   ↓
DRAFT Document 생성
   ↓
Document Editor
   ↓
작성 / 첨부
   ↓
Autosave
   ↓
Publish
   ↓
Document Viewer
```

---

# 5. 기준 기술

- React
- TypeScript
- BlockNote
- 기존 Router 구조
- 기존 QueryManager
- 기존 API/HTTP Client
- 기존 인증/인가 구조
- 기존 디자인 시스템

Document 기능만을 위해 별도의 전역 상태관리 체계를 추가하지 않는다.

---

# 6. Journals Home

현재 `/journals` 화면에 Document 작성 진입점을 제공한다.

기존 Page/Header 구조에 맞춰 명확한 `새 글 작성` Action을 제공한다.

현재 존재하는 Journal 자체의 생성 기능과 Document 작성 기능을 사용자 입장에서 구분할 수 있어야 한다.

새 Document 작성 시 Journal Context가 필요하므로 `/journals`에서 직접 작성하는 경우 사용자가 대상 Journal을 명시적으로 선택하거나 확인하도록 한다.

첫 번째 Journal을 자동 선택하지 않는다.

Journal이 하나도 없다면 Document를 자동 생성하지 않고 기존 Journal 생성 흐름으로 안내한다.

---

# 7. Journal 상세 Modal → Viewer Page

현재 Journal 상세 내용을 Modal로 표시하는 구조는 독립적인 Page Navigation으로 변경한다.

기존:

```text
/journals
   ↓
Journal 클릭
   ↓
Detail Modal
```

목표:

```text
/journals
   ↓
Journal 클릭
   ↓
/journals/:journalId
```

Journal 상세 Page에서는 최소 다음 구조를 제공한다.

```text
Journal Viewer

├─ Journal 기본 정보
├─ 기존 Journal body
└─ Documents
    ├─ Document A
    ├─ Document B
    └─ Document C
```

기존 Journal의 `body`와 새 Document Content는 서로 다른 데이터다.

기존 body를 Document로 변환하거나 동기화하지 않는다.

---

# 8. 기존 Journal Modal 제거

Journal Viewer Page가 읽기 상세 기능을 대체하면 인증 앱의 기존 읽기용 Journal Modal은 제거한다.

검토 대상:

```text
Journal 목록 Detail Modal
Project Recent Journals Detail Modal
Home Journal Widget Detail Modal
```

Journal 삭제 확인 Modal 등 다른 목적의 Modal은 유지한다.

다른 기능에서 재사용되는 Component/Style은 사용처를 조사한 뒤 제거 여부를 결정한다.

Viewer Page와 기존 읽기 Modal을 특별한 이유 없이 동시에 유지하지 않는다.

---

# 9. Journal Document 생성

Document 생성은 반드시 Journal Context에서 수행한다.

API:

```http
POST /api/v2/journals/{journalId}/documents
```

Request:

```json
{
  "title": "",
  "content": []
}
```

Frontend는 다음 서버 관리 값을 전송하지 않는다.

```text
id
documentSpaceId
authorId
status
createdAt
updatedAt
publishedAt
```

성공 응답은 `201 Created`이며 DRAFT Document가 반환된다.

반환된 `documentId`로 공용 Editor Route에 이동한다.

개념:

```text
POST Journal Document
   ↓
201 DocumentResponse
   ↓
documentId
   ↓
/documents/:documentId/edit
```

---

# 10. ID 타입

다음 식별자는 모두 UUID 문자열로 취급한다.

```text
journalId
documentSpaceId
documentId
attachmentId
authorId
createdBy
deletedId
```

Frontend Type은 숫자가 아닌 string을 사용한다.

예:

```ts
type DocumentId = string;
type AttachmentId = string;
```

UUID를 Number로 변환하거나 숫자 증가·범위 비교·산술 연산에 사용하지 않는다.

실제 API의 UUID 문자열을 그대로 사용하며 fixture 전용 ID를 제품 데이터로 사용하지 않는다.

---

# 11. Journal Document 목록

Journal별 목록 API:

```http
GET /api/v2/journals/{journalId}/documents
```

Query:

```text
limit
cursor
```

`limit`:

```text
기본값: 20
허용 범위: 1..100
```

`cursor`는 선택 사항이며 opaque string으로 취급한다.

Frontend에서 cursor 내용을 분석하거나 생성하지 않는다.

Response:

```json
{
  "items": [],
  "total": 0,
  "nextCursor": null
}
```

Document Summary에는 전체 `content`와 `attachmentIds`가 포함되지 않는다.

목록에는 DRAFT와 PUBLISHED가 모두 포함된다.

정렬은 Backend의:

```text
createdAt DESC
id DESC
```

를 그대로 사용하며 Frontend가 임의로 재정렬하지 않는다.

`nextCursor === null`이면 추가 조회를 종료한다.

추가 Page 조회 실패 시 기존 목록을 제거하지 않고 현재 항목을 유지하면서 재시도를 제공한다.

검색 및 Status Filter는 1차 범위에 포함하지 않는다.

---

# 12. Document Detail API

생성 이후 Document는 `documentId` 기준 공용 API를 사용한다.

```http
GET /api/v2/documents/{documentId}
```

Document Detail:

```text
id
documentSpaceId
title
content
attachmentIds
status
authorId
createdAt
updatedAt
publishedAt
```

`documentSpaceId`는 읽기 전용 정보다.

Frontend에서 변경하거나 DocumentSpace 선택 UI에 사용하지 않는다.

`publishedAt`은 항상 Response에 존재하며:

```text
DRAFT       → null
PUBLISHED   → UTC ISO-8601
```

이다.

---

# 13. Document Editor Route

공용 Editor Route를 제공한다.

개념:

```text
/documents/:documentId/edit
```

Editor는 `journalId`를 필수 입력으로 요구하지 않는다.

Journal은 Document 생성 및 목록 Context를 제공할 뿐이고, 생성 이후 Document Editor는 `documentId`만으로 동작할 수 있어야 한다.

---

# 14. Document Viewer Route

공용 Read-only Viewer를 제공한다.

개념:

```text
/documents/:documentId
```

Viewer와 Editor는 동일한 BlockNote JSON을 사용한다.

Viewer에서는 다음 편집 UI를 표시하지 않는다.

```text
Slash Menu
Formatting Toolbar
Block Side Menu
Drag Handle
File Upload UI
Editable Cursor
```

일반 텍스트 선택·복사, Link 이동, Attachment 열기, 읽기용 Toggle 동작은 유지한다.

Viewer Interaction으로 PUT 또는 다른 Mutation이 발생해서는 안 된다.

---

# 15. BlockNote Content

Document 본문의 Source of Truth:

```ts
editor.document;
```

`content`는 JSON 문자열이 아니라 JSON Array다.

저장 전에 다음 Format으로 변환하지 않는다.

```text
Markdown
HTML
Frontend 자체 Document Schema
```

Backend에서 받은 BlockNote JSON을 그대로 초기 Content로 사용한다.

JSON Object key의 순서나 공백의 byte 단위 동일성을 가정하지 않는다.

Block 배열 순서와 의미상 JSON 값이 보존되는 것을 기준으로 한다.

---

# 16. 기본 Block 기능

1차 Editor에서는 현재 사용하는 BlockNote 버전에서 지원되는 다음 기능을 제공한다.

```text
Paragraph
Heading
Bullet List
Numbered List
Checklist
Toggle Heading
Toggle List
Quote
Code Block
Table
Image
File
```

BlockNote 기본 제공 기능을 우선 사용한다.

기본 기능이 없는 경우 임의의 Custom Block으로 우회하지 않는다.

---

# 17. Formatting

최소 다음 Formatting을 제공한다.

```text
Bold
Italic
Underline
Strike
Link
Text Color
Background Color
```

BlockNote 기본 Toolbar/Menu를 우선 사용한다.

---

# 18. Slash Command 및 Block UX

사용자는 `/` 입력을 통해 Block을 추가할 수 있어야 한다.

다음을 지원한다.

```text
Block 추가
Block 삭제
Drag & Drop
Block 순서 변경
Indent
Outdent
지원되는 Block Type 변경
```

현재 서비스 전용 Custom Slash Command는 추가하지 않는다.

향후 `/server`, `/github-issue` 등의 기능을 추가할 수 있도록 BlockNote 구조를 불필요하게 제한하지 않는다.

---

# 19. 제목

Document 제목은 BlockNote Content와 분리한다.

```text
DocumentEditor
├─ TitleInput
└─ BlockNoteEditor
```

Title과 Content는 동일한 Autosave Snapshot에 포함한다.

Backend 계약:

```text
title
→ non-null String
→ 0..200 UTF-16 units
→ 빈 문자열 허용
```

Frontend에서도 UX 목적으로 동일 제한을 안내할 수 있으나 Backend Validation이 최종 기준이다.

---

# 20. Content 제한

Backend 계약:

```text
content
→ 필수
→ non-null JSON array
→ 빈 배열 허용
→ UTF-8 직렬화 최대 1 MiB
→ nesting depth 최대 100
```

Frontend는 일반 작성 중 임의로 Block을 제거하거나 Content를 변형하여 이 제한을 맞추지 않는다.

제한 초과 시 저장 오류를 명확하게 표현하고 현재 Editor 입력을 유지한다.

---

# 21. Autosave

Document Update API:

```http
PUT /api/v2/documents/{documentId}
```

Request:

```json
{
  "title": "...",
  "content": [],
  "attachmentIds": []
}
```

세 필드는 전체 현재 상태이며 모두 전송한다.

Autosave 흐름:

```text
Editor 변경
   ↓
DIRTY
   ↓
Debounce
   ↓
PUT
   ↓
SAVED
```

초기 Debounce 기준은 약 1~2초이며 구현 PLAN에서 조정할 수 있다.

---

# 22. attachmentIds 제한

PUT의 `attachmentIds`는 필수다.

```text
non-null 배열
UUID string
null 원소 금지
중복 금지
최대 100개
```

생략은 오류다.

```json
"attachmentIds": []
```

는 현재 Document에서 모든 Attachment를 detach한다는 의미다.

---

# 23. Autosave 직렬화

동일 Document에서 PUT 요청을 동시에 여러 개 실행하지 않는다.

예:

```text
Save A 실행
   ↓
사용자 추가 입력 B
   ↓
B는 pending
   ↓
A 완료
   ↓
최신 B snapshot 저장
```

최대 동시 PUT은 1개다.

오래된 Save Response가 최신 Editor 상태를 덮어써서는 안 된다.

Document는 revision/ETag 기반 optimistic locking을 사용하지 않는다.

다른 Browser/Tab과 동시에 수정하면 마지막 Backend commit이 이길 수 있다는 계약을 Frontend가 별도 History 기능으로 해결하려 하지 않는다.

---

# 24. 저장 상태 UX

최소 다음 상태를 표시한다.

```text
저장 중...
저장됨
저장 실패
```

내부적으로 필요하면:

```text
IDLE
DIRTY
SAVING
SAVED
ERROR
```

상태를 사용할 수 있다.

Save 실패 시 현재 title/content/attachment registry를 제거하거나 이전 서버 값으로 강제 Rollback하지 않는다.

---

# 25. Publish

API:

```http
POST /api/v2/documents/{documentId}/publish
```

Request Body 없음.

Publish 전에 최신 PUT이 성공해야 한다.

```text
Publish 클릭
   ↓
진행 중 Upload 확인
   ↓
최신 Save Flush
   ↓
PUT 성공
   ↓
Publish
```

최신 Save가 실패하면 Publish 요청은 보내지 않는다.

Publish 성공은 `200 DocumentResponse`다.

---

# 26. PUBLISHED 문서 수정

PUBLISHED Document도 PUT으로 수정할 수 있다.

수정 이후에도:

```text
status = PUBLISHED
```

를 유지하며 최초 `publishedAt`을 유지한다.

Publish API 재호출은:

```text
200
동일 PUBLISHED 상태
추가 상태 변경 없음
```

이다.

Frontend는 별도의 Unpublish 기능을 제공하지 않는다.

게시 이후에도 권한이 있는 사용자는 Editor에서 수정할 수 있어야 한다.

---

# 27. Attachment Upload

API:

```http
POST /api/v2/attachments
Content-Type: multipart/form-data
```

Form:

```text
documentId=<UUID>
file=<binary>
```

Document가 생성된 이후에만 Upload할 수 있다.

성공:

```text
201 Created
```

Response:

```text
id
documentId
originalFilename
contentType
size
status
contentUrl
createdAt
```

Upload 직후:

```text
status = TEMP
```

이다.

---

# 28. File Validation UX

Backend 최종 기준:

```text
파일 크기:
0 byte 거부
최대 10 MiB

Multipart 전체:
최대 11 MiB

허용:
PNG
JPEG
PDF
UTF-8 TXT

거부:
SVG
HTML
JavaScript
실행 파일
Archive
기타 allowlist 밖 형식
```

Frontend에서도 선택 시 빠른 사용자 피드백을 제공할 수 있지만 최종 판정은 Backend가 한다.

Frontend 검증을 통과했다고 Upload 성공을 가정하지 않는다.

Filename은 최대 255 UTF-16 units이며 Backend가 최종 안전성 검증을 수행한다.

---

# 29. Attachment Registry

Frontend는 Upload한 서비스 Attachment를 추적한다.

최소 Metadata:

```text
attachmentId
contentUrl
originalFilename
contentType
```

Document Save 시 현재 BlockNote Content에서 실제로 사용 중인 서비스 Attachment만 `attachmentIds`에 포함한다.

동일 Attachment를 여러 Block이 사용할 경우 마지막 Reference가 사라질 때까지 `attachmentIds`에서 제거하지 않는다.

Undo/Redo에 의해 Reference가 다시 나타나면 기존 Registry를 재사용할 수 있어야 한다.

외부 URL을 서비스 Attachment로 추정하지 않는다.

---

# 30. Attachment Registry 복원 Integration Gate

현재 Document Detail에는 다음 필수 배열이 포함된다:

```text
attachmentIds
```

뿐 아니라 `attachments` 전체 metadata 배열이 포함된다. 두 배열은 같은 snapshot·UUID 순서이며 최대 100개 ATTACHED를 제공하고 TEMP는 제외한다.

새로고침 후 Registry를 완전히 복원하려면 다음 Metadata가 추가로 필요하다.

```text
attachmentId
originalFilename
contentType
contentUrl
```

2026-09-23 보완된 live OpenAPI의 AttachedSnapshot은 id, documentId, originalFilename, contentType, size, status, contentUrl, createdAt을 필수로 제공한다. 별도 metadata API나 임시 Mock Metadata Resolver를 구현하지 않는다.

[Backend 보완 결과](document-editor-backend-followup.md)로 계약 gate는 해결되었다. 실제 복원은 별도로 검증한다. 배열 길이·순서·중복·문서 소속·ATTACHED 상태를 검증하고 실패 시 저장을 차단한다. 저장 도중 업로드한 TEMP와 detach 이후 Undo용 metadata는 유지한다.

첫 번째 방식으로 확정했다. 아래는 이전 검토 대안이며 추가 구현 범위가 아니다.

```text
Document Detail에서 Attachment Metadata 제공
또는
Attachment Metadata 조회 API
또는
Backend에서 승인한 다른 조회 방식
```

Filename, URL parsing, 확장자 등을 이용해 Metadata나 소유권을 임의 추론하지 않는다.

---

# 31. Attachment Content

안정적인 Application URL:

```http
GET /api/v2/attachments/{attachmentId}/content
```

Frontend가 저장하고 사용하는 URL은 Backend Application URL이다.

다음 Storage 내부 정보에는 의존하지 않는다.

```text
Storage Root
절대 파일 경로
objectKey
Storage 직접 접근 URL
Presigned URL
```

현재 Backend 구현체가 LocalFileStorage인지 향후 다른 Storage인지 Frontend Runtime 설계에는 영향을 주지 않는다.

---

# 32. Content 표시 방식

Backend 계약:

```text
PNG / JPEG
→ inline

PDF / TXT
→ attachment download
```

Frontend가 PDF/TXT를 이미지처럼 inline preview해야 한다고 가정하지 않는다.

Attachment Content 조회 실패는 해당 파일 단위 오류로 표현한다.

파일 하나의 오류 때문에 전체 Document Content를 빈 상태로 바꾸지 않는다.

---

# 33. Attachment 상태 전이

기본 Lifecycle:

```text
Upload
 ↓
TEMP
 ↓
Document Save attachmentIds에 포함
 ↓
ATTACHED
```

Block 제거 후 Save:

```text
ATTACHED
 ↓
attachmentIds에서 제외
 ↓
TEMP
```

TEMP는 Backend Grace Period 동안 다시 ATTACHED로 연결될 수 있다.

Frontend는 Block 제거 즉시 Binary Hard Delete를 수행하지 않는다.

---

# 34. Attachment 직접 삭제

API:

```http
DELETE /api/v2/attachments/{attachmentId}
```

ATTACHED 직접 삭제:

```text
409 ATTACHMENT_IN_USE
```

먼저 Editor에서 해당 Reference를 제거하고 Save를 성공시켜 TEMP 상태로 만들어야 한다.

TEMP 직접 삭제 성공:

```http
200 OK
```

```json
{
  "deletedId": "<attachment UUID>"
}
```

이 성공은 Backend 기준으로 파일 제거와 Attachment Metadata 삭제가 완료되었음을 뜻한다.

Frontend는 해당 Attachment를 Registry에서 제거할 수 있다.

---

# 35. Attachment 삭제 진행 중 / Storage 오류

삭제 claim이 있는 Attachment의 재연결 또는 중복 삭제:

```text
409 ATTACHMENT_DELETION_PENDING
```

Storage 실패:

```text
503 STORAGE_UNAVAILABLE
```

503 이후 Backend 내부 재시도가 계속될 수 있으므로 Frontend는 실패 응답을 성공으로 간주하지 않는다.

사용자에게 오류 상태를 표시하고 임의로 같은 Mutation을 무한 자동 재시도하지 않는다.

삭제 claim 이후 Attachment Content는 404가 될 수 있다.

---

# 36. Document 삭제

API:

```http
DELETE /api/v2/documents/{documentId}
```

성공:

```http
200 OK
```

```json
{
  "deletedId": "<document UUID>"
}
```

이 성공의 의미:

> Document와 Attachment Metadata의 DB Hard Delete 및 관련 Binary 삭제 작업의 영속화가 완료되었다.

이 응답은 모든 Binary 파일의 물리 삭제가 이미 완료됐다는 의미는 아니다.

Frontend는 200 이후:

```text
Document 목록에서 제거
Editor 종료
안전한 이전 화면으로 이동
```

할 수 있다.

사용자 UI에서 이를 `모든 파일 물리 삭제 완료`로 표현하지 않는다.

반복 조회/삭제는 404가 될 수 있다.

---

# 37. Journal 삭제와 Frontend

Journal 삭제 이후 Backend가 다음 Lifecycle을 관리한다.

```text
Journal
 ↓
DocumentSpace
 ↓
Documents
 ↓
Attachments
```

Frontend가 Attachment를 개별적으로 연쇄 DELETE하지 않는다.

기존 Journal 삭제 성공 계약을 따른다.

Journal 삭제 후 열린 Document Page는 재조회 시 404를 적절하게 처리하고 Journals 화면으로 돌아갈 수 있는 경로를 제공한다.

---

# 38. API Error Contract

공통 오류 구조:

```json
{
  "code": "...",
  "message": "...",
  "fieldErrors": [],
  "requestId": "..."
}
```

주요 오류:

```text
400 VALIDATION_ERROR
400 INVALID_CURSOR

401 AUTH_REQUIRED

403 ACCOUNT_DISABLED
403 CSRF_INVALID

404 RESOURCE_NOT_FOUND

409 ATTACHMENT_IN_USE
409 ATTACHMENT_DELETION_PENDING

413 PAYLOAD_TOO_LARGE

415 UNSUPPORTED_MEDIA_TYPE

503 STORAGE_UNAVAILABLE

500 INTERNAL_ERROR
```

타인 Resource와 존재하지 않는 Resource는 모두 404로 처리될 수 있으므로 Frontend가 두 경우를 구별한다고 가정하지 않는다.

---

# 39. 인증 / 보안

기존 Session 인증 및 CSRF/Origin 정책을 사용한다.

Frontend가 다음 값을 임의 생성하거나 신뢰 가능한 서버 데이터처럼 보내지 않는다.

```text
authorId
createdBy
documentSpaceId
status
objectKey
audit timestamps
```

Archived Project 아래 기존 Journal에 대해서는 Document 작성·편집·게시·삭제가 허용되므로 Frontend가 Project Archived 상태만으로 해당 기능을 임의 비활성화하지 않는다.

---

# 40. 실제 API 연동 원칙

2026-09-23 계획 수정에 따라 PLAN-0025는 실제 API를 사용한다. 개발용 Mock 서버·preview mode·임시 metadata resolver·운영 fallback을 새로 만들지 않는다. 기존 Journal 상세와 신규 Document/Attachment API를 같은 session/transport 경계에서 사용한다.

Swagger 확인은 API 명세 가용성 확인이며 인증된 실제 통합 성공을 뜻하지 않는다. 사용자 업무 데이터가 아닌 disposable 환경에서 검증한다. 기존 타 기능 fixtures는 유지하며 순수 controller 단위 테스트의 시간·Promise 제어는 API 서버 대체 구현과 구분한다.

---

# 41. 실제 API 및 HTTP 검증

9개 API 경로와 성공 응답은 [공용 계약](DOCUMENT_EDITOR_COMMON_CONTRACT.md)을 기준으로 한다. FormData 전송은 브라우저 boundary와 기존 CSRF/Origin/session generation을 유지한다. 현재 JSON 전용 client 확장, 15초 timeout의 업로드 적합성, 프론트 Nginx 요청 용량/timeout을 검토한다.

기존 disposable real harness에서 정상·실패·응답 유실·reload·파일 표시/다운로드를 확인한다. 실제 생성·업로드에 재시도 보장이 없으므로 자동 POST replay를 하지 않는다. X-Workspace-Data-Revision은 문자열 freshness 관측 값이며 문서 편집 revision으로 쓰지 않는다. 순차 PUT은 다중 탭의 lost update 방지를 보장하지 않는다.

---

# 42. 검증 격리·완료 증거

실제 DB/파일 저장소·Vite·fresh Nginx를 검증한다. 사용자 port-8080 업무 데이터에 검증용 mutation을 보내지 않는다. 소유한 테스트 프로세스·데이터만 정리하고 쿠키·토큰·비밀정보는 기록하지 않는다.

이번 기능의 개발용 Mock dataset/adapter/handler/upload asset/metadata resolver/오류 서버/seed/preview config/fallback을 추가하지 않는다. 잔여 구현이 발견되면 실제 adapter 연결과 함께 제거한다. 장애는 순수 단위 제어 또는 실제 요청의 지연/응답 차단으로 검증하고 가짜 응답을 실제 통합 증거로 보고하지 않는다. Production artifact에 개발 fixture/secret이 없어야 한다.

---

# 43. Navigation Guard

Editor가 다음 상태일 경우 Page 이탈을 고려한다.

```text
DIRTY
SAVING
ERROR
Upload Pending
```

기존 Navigation Guard/Unsaved Changes 구조를 재사용한다.

브라우저 종료 시 비동기 저장 완료를 보장한다고 가정하지 않는다.

취소된 HTTP 요청이 Backend에서 Rollback됐다고 간주하지 않는다.

---

# 44. Loading / Empty / Error 상태

Journal:

```text
Detail Loading
Detail Error
Document List Loading
Document List Empty
Document List Error
Additional Page Error
```

Document:

```text
Loading
Not Found
Access Denied
Invalid Content
Save Error
Publish Error
Delete Error
```

Attachment:

```text
Uploading
Upload Error
Content Load Error
Deletion Pending
Storage Error
```

각 상태를 독립적으로 표현한다.

Document List 오류가 Journal 기본정보를 제거해서는 안 된다.

Attachment 하나의 오류가 전체 Editor 장애로 이어져서는 안 된다.

---

# 45. Journal 기존 기능 보존

기존 Journal 기능:

```text
Journal 생성
Journal 수정
Journal 삭제
Journal body
Project 관계
Entry Date
Revision
검색/필터
```

를 유지한다.

Document 기능 때문에 기존 Journal Editor를 공용 Document Editor로 교체하지 않는다.

Journal과 Document는 1차에서 서로 다른 Content Model이다.

---

# 46. 제외 범위

현재 구현하지 않는다.

```text
Project ↔ DocumentSpace
Milestone ↔ DocumentSpace
Resource ↔ DocumentSpace

Realtime Collaboration
Comment
Mention
Template
History / Revision
Share Link
Relation
Database View
Kanban
Calendar
AI

Custom Block
GitHub Integration
Server Integration
Kubernetes Integration
```

향후 필요할 수 있다는 이유로 관련 Frontend Store/API/Component를 선행 구현하지 않는다.

---

# 47. 향후 확장성

향후 다른 Domain에서 Document를 사용할 경우에도 공용 Editor/Viewer를 재사용한다.

예:

```text
Project
   ↓
DocumentSpace
   ↓
Document Editor
```

Frontend의 공용 Editor가 JournalStore 또는 `journalId`에 의존하지 않아야 한다.

새 Domain은 Document 생성/목록 Context만 제공한다.

---

# 48. Frontend PLAN 작성 전 확인사항

Frontend PLAN 작성 전 실제 코드에서 다음을 확인한다.

```text
React / TypeScript 버전
BlockNote 설치 여부 및 호환 버전
Router 구조
safeReturnTo
API Client
QueryManager
Authentication
CSRF
Error Handling
Journal Page 구조
Journal Modal 사용처
Journal Existing CRUD
Home / Project Journal 진입점
Navigation Guard
Upload/FormData 지원 여부
Mock/Test 구조
Build/Test/Boundary/Query/Docs/Format 명령
```

새로운 Repository-wide Tooling은 Document 기능 PLAN에 포함하지 않는다.

---

# 49. Frontend 1차 완료 기준

다음 사용자 흐름을 실제 Backend API와 파일 저장소에서 검증해야 한다.

```text
1. Journals 목록 표시

2. Journal 클릭
   → 기존 읽기 Modal 대신 Journal Viewer Page

3. Journal Viewer
   → 기존 Journal 정보/body 표시
   → Document 목록 표시

4. Journals 또는 Viewer에서 새 글 작성

5. Journal Context 확인

6. 201 DRAFT Document 생성

7. UUID documentId 기반 Editor 진입

8. Title / BlockNote Content 작성

9. Slash / Formatting / Drag & Drop 사용

10. Attachment Upload
    → TEMP

11. Autosave
    → attachmentIds
    → ATTACHED

12. 새로고침
    → Document 및 Attachment 관계 복원

13. Publish
    → 최신 Save 성공 이후
    → PUBLISHED

14. PUBLISHED Document 재편집 및 Save

15. Read-only Viewer 조회

16. Attachment Block 제거
    → Save
    → TEMP

17. TEMP 직접 삭제 또는 Backend Cleanup

18. Document DELETE 200
    → 목록에서 제거
    → 물리 Binary 삭제 완료로 오해하지 않음

19. Journal 삭제 이후 열린 Document 404 처리
```

첨부 metadata 복원 gate를 포함한 실제 Vite/Nginx 검증을 통과해야 Frontend 통합 완료로 판단한다. Production 배포 완료를 뜻하지 않는다.

---

# 50. 실제 Backend Integration 전 필수 Gate

실제 API 연결 전 다음을 확인한다.

```text
Backend PLAN/API 구현 완료 여부
/v3/api-docs

UUID DTO
/api/v2 Endpoint
Cursor Contract
Validation Limit
Error Code
PUBLISHED PUT/Publish 동작
DELETE 성공 의미

Attachment Registry Metadata 복원 방법
Multipart/FormData
Attachment Content 인증/응답
```

공용 계약과 실제 OpenAPI가 다르면 응답을 임의 보정하지 않고 계약을 재검토한다. 2026-09-23 명세에서 ID/endpoint/cursor/게시/삭제와 attachments 복원 계약을 확인했다. 용량 등 설정 의존 제한과 실제 복원은 통합 검증으로 확인한다.

[PLAN-0025](../plans/PLAN-0025-journal-document-editor.md)는 실제 API 연동 범위로 수정됐으며 구현 승인은 별도다.
