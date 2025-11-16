# API Endpoint Implementation Plan: DELETE /api/reports/{id}

## 1. Endpoint Overview

**Purpose**: Soft-delete a report by ID for the authenticated user (owner only)

The DELETE `/api/reports/{id}` endpoint allows authenticated users to soft-delete their own reports. The operation marks the report as deleted by setting the `deleted_at` timestamp without physically removing it from the database, preserving data integrity and enabling audit trails.

**Security Model**:

- User authentication via JWT token (Bearer scheme)
- User ownership verification via user_id comparison
- Row-Level Security (RLS) enforcement by Supabase
- Defense-in-depth authorization checks

**Response Style**: RESTful, returns 204 No Content on success (empty response body)

---

## 2. Request Details

### HTTP Method & URL Structure

```
DELETE /api/reports/{id}
```

### Path Parameters

| Parameter | Type   | Required | Format  | Description                               |
| --------- | ------ | -------- | ------- | ----------------------------------------- |
| `id`      | string | Yes      | UUID v4 | Unique identifier of the report to delete |

### Headers

| Header        | Type   | Required | Format           | Description                 |
| ------------- | ------ | -------- | ---------------- | --------------------------- |
| Authorization | string | Yes      | Bearer {jwt}     | Valid Supabase JWT token    |
| Content-Type  | string | No       | application/json | Optional (no body expected) |

### Request Body

**None** - DELETE endpoint accepts no request body

### Validation Rules

1. **Path Parameter `id`**:
   - Must be valid UUID v4 format
   - Format: `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (case-insensitive)
   - Return 400 Bad Request if invalid

2. **Authentication**:
   - Authorization header must be present and properly formatted
   - Token must be a valid Supabase JWT
   - Token must not be expired
   - Return 401 Unauthorized if missing or invalid

3. **Authorization**:
   - Report must exist and belong to authenticated user
   - Report must not already be deleted (deleted_at IS NULL)
   - Verified via RLS policies + explicit user_id check in service layer
   - Return 404 Not Found if unauthorized or already deleted

---

## 3. Response Details

### Success Response (204 No Content)

**Status Code**: `204 No Content`

**Headers**:

```
Content-Type: application/json (may be empty)
```

**Body**: None (empty response)

**Meaning**: Report has been successfully soft-deleted. The `deleted_at` column is now set to the current timestamp.

---

### Error Responses

#### 400 Bad Request - Invalid UUID Format

**Status Code**: `400`

**Response Body**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid report ID format",
    "details": {
      "id": "Report ID must be a valid UUID"
    }
  }
}
```

**Trigger**: Report ID path parameter doesn't match UUID v4 format

---

#### 401 Unauthorized - Missing/Invalid Authentication

**Status Code**: `401`

**Response Body**:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

**Trigger**:

- Missing Authorization header
- Malformed Authorization header
- Invalid/expired JWT token
- User verification fails with Supabase

---

#### 404 Not Found - Report Not Found or Not Owned

**Status Code**: `404`

**Response Body**:

```json
{
  "error": {
    "code": "REPORT_NOT_FOUND",
    "message": "Report not found"
  }
}
```

**Trigger**:

- Report with given ID doesn't exist in database
- Report is already deleted (deleted_at IS NOT NULL)
- Report belongs to a different user
- User-scoped query returns no results

_Note: 404 is returned for both "not found" and "unauthorized" to prevent user enumeration attacks_

---

#### 500 Internal Server Error

**Status Code**: `500`

**Response Body**:

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

**Trigger**: Unexpected database errors, service failures, network issues

---

## 4. Data Flow

```
Request: DELETE /api/reports/{id}
  ↓
authMiddleware (validates JWT, extracts user_id)
  ├─ No Authorization header → 401 Unauthorized
  ├─ Invalid JWT format → 401 Unauthorized
  └─ Valid JWT → extract user_id and jwt, call next()
  ↓
Route Handler (reports.router.ts)
  ├─ Validate path parameter {id} is UUID format
  │  ├─ Invalid UUID → return 400 Bad Request
  │  └─ Valid UUID → continue
  ├─ Extract userId from req.auth
  └─ Create user-scoped Supabase client with user JWT
  ↓
Controller Handler (deleteReportHandler)
  ├─ Verify req.auth exists (ensure auth middleware ran)
  │  └─ Missing → return 401 Unauthorized
  ├─ Create user-scoped Supabase client (RLS enforcement)
  └─ Call reportsService.deleteReportById(userId, reportId)
  ↓
Service Layer (ReportsService.deleteReportById)
  ├─ Step 1: Verify report exists and user owns it
  │  └─ SELECT id, user_id FROM reports
  │      WHERE id = :reportId AND deleted_at IS NULL
  │      SINGLE ROW
  │  ├─ Error PGRST116 (no rows) → throw ReportNotFoundError
  │  ├─ User check fails → throw ReportNotFoundError
  │  └─ Report found and verified → continue
  ├─ Step 2: Soft-delete by updating deleted_at
  │  └─ UPDATE reports SET deleted_at = now()
  │      WHERE id = :reportId
  │  ├─ Error → throw generic error
  │  └─ Success → return void
  └─ RLS Policy enforces user_id = auth.uid()
  ↓
Supabase Database
  ├─ Execute RLS policy check (user_id = auth.uid())
  ├─ Execute SELECT for verification
  ├─ Execute UPDATE to set deleted_at
  └─ Return success
  ↓
Controller Error Handling
  ├─ Catch ReportNotFoundError → return 404 Not Found
  ├─ Catch other errors → log and return 500 Server Error
  └─ No error → return 204 No Content
  ↓
Response: 204 No Content (empty body) or error JSON
```

---

## 5. Security Considerations

### Authentication & Authorization

1. **JWT Validation**:
   - Validated by `authMiddleware` before controller receives request
   - Supabase JWT verified against SUPABASE_SERVICE_KEY
   - User ID extracted from verified JWT
   - Invalid tokens are rejected with 401

2. **User-Scoped Client**:
   - Supabase client created with user's JWT (not service role key)
   - All database queries automatically filtered by user_id via RLS policies
   - Prevents cross-user data access

3. **Defense-in-Depth**:
   - Service layer explicitly verifies `note.user_id === userId`
   - Secondary check ensures RLS policies work correctly
   - Explicit check catches any RLS policy misconfigurations

4. **Soft Delete Protection**:
   - Only non-deleted reports can be deleted (WHERE deleted_at IS NULL)
   - Prevents double-delete attempts
   - Already-deleted reports appear as 404 (consistent with "not found" behavior)

### Data Protection

1. **No Information Leakage**:
   - 404 returned for both "not found" and "unauthorized"
   - Prevents attackers from enumerating valid report IDs
   - Error message doesn't reveal whether report exists

2. **Atomic Operations**:
   - Soft delete is single UPDATE statement
   - No race conditions or partial updates
   - Database ensures atomicity

3. **Audit Trail**:
   - `deleted_at` timestamp preserved for audit purposes
   - Reports can be recovered if needed
   - Historical data remains available for compliance

### Input Validation

1. **UUID Format Validation**:
   - Path parameter validated with regex before service layer
   - Prevents invalid UUIDs from reaching database
   - Returns 400 for invalid format

2. **No Injection Risks**:
   - No user input in query strings
   - No request body to validate
   - Only path parameter, which is UUID-constrained

---

## 6. Error Handling

### Custom Error Classes

Use existing `ReportNotFoundError` from `src/services/reports.service.ts`:

```typescript
export class ReportNotFoundError extends Error {
  constructor(public reportId: UUID) {
    super(`Report ${reportId} not found`);
    this.name = 'ReportNotFoundError';
  }
}
```

### Error Handling Strategy

| Error Scenario                 | HTTP Status | Error Code       | Action                        |
| ------------------------------ | ----------- | ---------------- | ----------------------------- |
| Missing Authorization header   | 401         | UNAUTHORIZED     | Return error immediately      |
| Invalid JWT format             | 401         | UNAUTHORIZED     | Return error immediately      |
| JWT verification fails         | 401         | UNAUTHORIZED     | Return error immediately      |
| Invalid UUID format            | 400         | VALIDATION_ERROR | Return error with details     |
| Report doesn't exist           | 404         | REPORT_NOT_FOUND | Log as info, return 404       |
| Report already deleted         | 404         | REPORT_NOT_FOUND | Log as info, return 404       |
| Report owned by different user | 404         | REPORT_NOT_FOUND | Log as warn, return 404       |
| Database update fails          | 500         | SERVER_ERROR     | Log error, return generic 500 |
| Unexpected service error       | 500         | SERVER_ERROR     | Log error, return generic 500 |

### Logging

**Info Level** (expected scenarios):

```
[INFO] Report {reportId} not found for user {userId}
[INFO] Report {reportId} already deleted for user {userId}
```

**Warning Level** (security concerns):

```
[WARN] User {userId} attempted to delete report {reportId} owned by different user
[WARN] Authorization check failed for report deletion
```

**Error Level** (unexpected failures):

```
[ERROR] Failed to retrieve report: {errorMessage}
[ERROR] Failed to delete report: {errorMessage}
[ERROR] deleteReportHandler error: {errorMessage}
```

---

## 7. Performance Considerations

### Database Queries

1. **Verification Query** (SELECT):
   - Single row lookup by primary key
   - Indexed on: `id` (primary key), `user_id` (RLS)
   - Expected time: < 1ms

2. **Update Query** (UPDATE):
   - Single row update by primary key
   - No joins or complex logic
   - Expected time: < 1ms

3. **No N+1 Queries**:
   - Two queries total (verify + update)
   - Could be optimized to single query with RETURNING clause if needed

### Optimizations

**Current Implementation**:

- Two-step process (verify, then delete)
- Defensive against race conditions
- Clear separation of concerns

**Potential Future Optimizations**:

- Single query with RETURNING: `UPDATE reports SET deleted_at = now() WHERE id = :id RETURNING *`
  - Verify and delete in one round-trip
  - Trade-off: Less explicit error handling

**Recommended**: Keep two-step approach for clarity and maintainability

### Caching

- No caching layer needed for delete operations
- RLS policies prevent stale cache issues
- Frontend should invalidate cached report lists on deletion

---

## 8. Implementation Steps

### Phase 1: Service Layer (`src/services/reports.service.ts`)

**Objective**: Add `deleteReportById` method to handle soft delete logic

**Steps**:

1. Add method signature to ReportsService class:

   ```typescript
   async deleteReportById(userId: UUID, reportId: UUID): Promise<void>
   ```

2. Implement verification step:
   - Query database for report by ID
   - Check that `deleted_at IS NULL` (not already deleted)
   - Verify `user_id` matches authenticated user
   - Throw `ReportNotFoundError` if verification fails

3. Implement soft-delete step:
   - Update report setting `deleted_at = now()`
   - Where `id = reportId`
   - Handle database errors appropriately

4. Add JSDoc comments explaining:
   - Purpose and behavior
   - Parameters and return type
   - Exceptions thrown
   - Security considerations

5. Add logging:
   - Debug: method entry/exit
   - Info: successful deletion
   - Warn: authorization failures
   - Error: database errors

**Expected Changes**: ~30-40 lines of code

---

### Phase 2: Controller Handler (`src/controllers/reports.controller.ts`)

**Objective**: Create HTTP handler for DELETE endpoint

**Steps**:

1. Create `deleteReportHandler` function matching signature:

   ```typescript
   export const deleteReportHandler = async (
     req: Request,
     res: Response,
     _next: NextFunction
   ): Promise<void>
   ```

2. Implement authentication check:
   - Verify `req.auth` exists
   - Return 401 if missing

3. Implement path parameter validation:
   - Extract `req.params.id`
   - Validate UUID format with regex
   - Return 400 with error details if invalid

4. Implement service call:
   - Create user-scoped Supabase client
   - Initialize ReportsService
   - Call `deleteReportById(userId, reportId)`

5. Implement error handling:
   - Catch `ReportNotFoundError` → return 404
   - Catch generic errors → log and return 500
   - Success → return 204 No Content

6. Add JSDoc comments explaining:
   - Endpoint purpose and behavior
   - Parameter validation
   - Error responses and status codes

**Expected Changes**: ~50-60 lines of code

---

### Phase 3: Route Registration (`src/routes/reports.router.ts`)

**Objective**: Register DELETE endpoint in Express router

**Steps**:

1. Add route handler import:

   ```typescript
   import { deleteReportHandler, ... } from '../controllers/reports.controller.js';
   ```

2. Register DELETE route:

   ```typescript
   router.delete('/:id', authMiddleware, (req: Request, res: Response, _next: NextFunction) =>
     deleteReportHandler(req, res, _next)
   );
   ```

3. Add inline JSDoc comment documenting:
   - HTTP method and path
   - Authentication requirement
   - Response codes (204, 400, 401, 404, 500)

**Expected Changes**: ~8-10 lines of code

---

### Phase 4: Validation Schema (`src/validation/reports.ts`)

**Objective**: Add validation schema for DELETE path parameter (optional but recommended)

**Steps**:

1. Create Zod schema for delete request:

   ```typescript
   export const DeleteReportParamSchema = z.object({
     id: z.string().uuid({ message: 'Report ID must be a valid UUID' }),
   });

   export type DeleteReportParam = z.infer<typeof DeleteReportParamSchema>;
   ```

2. Use schema in controller:
   - Parse `req.params` with schema
   - Return 400 with error details if validation fails

**Alternative**: Continue using inline regex validation (current pattern in codebase)

**Expected Changes**: ~5-8 lines of code

---

### Phase 5: Testing & Documentation

**Objective**: Verify implementation and document behavior

**Testing Checklist**:

- [ ] Success case: 204 with valid report owned by user
- [ ] 400 Bad Request: Invalid UUID format
- [ ] 401 Unauthorized: Missing Authorization header
- [ ] 401 Unauthorized: Invalid/expired JWT
- [ ] 404 Not Found: Non-existent report ID
- [ ] 404 Not Found: Report already deleted
- [ ] 404 Not Found: Report owned by different user
- [ ] Verify `deleted_at` timestamp is set in database
- [ ] Verify report doesn't appear in GET /api/reports by default
- [ ] Verify report appears in GET /api/reports?include_deleted=true

**Documentation**:

- Update API documentation (if separate)
- Add example CURL request to CURL_QUICK_REFERENCE.md
- Add endpoint to README.md endpoint list
- Document soft-delete behavior and 404 semantics

**Expected Changes**: Test file additions, documentation updates

---

### Phase 6: Code Review Checklist

Before merging, verify:

- [ ] Code follows TypeScript best practices
- [ ] Error handling is comprehensive
- [ ] Security considerations addressed
- [ ] JWT/RLS properly enforced
- [ ] Console logging at appropriate levels
- [ ] No linting errors
- [ ] Consistent with existing code style
- [ ] JSDoc comments complete and accurate
- [ ] No N+1 queries
- [ ] Proper async/await usage
- [ ] Request/response types are correct
- [ ] Error responses use consistent format

---

## 9. Type Definitions

### Existing Types (Already Defined in `src/types.ts`)

```typescript
export type UUID = string;

export type ErrorResponseDto = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type ReportDto = Tables<'reports'>;
```

### Service Layer Types

```typescript
// Already defined in src/services/reports.service.ts
export class ReportNotFoundError extends Error {
  constructor(public reportId: UUID)
}
```

### No New Types Required

- DELETE operation has no request body (no command model needed)
- Response is empty on success (no response DTO needed)
- Path parameter is simple UUID string

---

## 10. Integration with Existing Code

### Middleware Chain

```
authMiddleware (extracts user_id and jwt)
  ↓
Route handler (validates path params)
  ↓
Controller handler (orchestrates response)
  ↓
Service layer (business logic)
  ↓
Supabase client (RLS-enforced DB operations)
```

### Error Handling Pattern

Follows the pattern established by DELETE /api/notes/{id}:

- Check authentication in controller
- Validate path parameters
- Call service method
- Catch specific errors and map to HTTP status codes
- Return consistent ErrorResponseDto format

### Service Layer Pattern

Follows existing pattern from NotesService.deleteNoteById():

- Two-step verification (fetch then check)
- Defense-in-depth user ownership check
- Explicit error handling with custom exception classes
- Comprehensive logging

---

## 11. Database Assumptions

### Reports Table Schema

```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  generated_by generated_by_type NOT NULL,
  html TEXT NOT NULL,
  text_version TEXT,
  pdf_path TEXT,
  llm_model TEXT,
  system_prompt_version TEXT,
  categories_snapshot JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ  -- Soft delete timestamp
);

-- RLS Policy: Users can only delete their own reports
CREATE POLICY "Users can delete their own reports" ON reports
  FOR UPDATE USING (auth.uid() = user_id);

-- Index on user_id for RLS enforcement
CREATE INDEX idx_reports_user_id ON reports(user_id);
```

### Assumptions

- `deleted_at` column exists and can be NULL
- RLS policies are properly configured
- Primary key index on `id` exists
- Foreign key to `auth.users` exists

---

## 12. Environment & Dependencies

### Required Environment Variables

- `SUPABASE_URL`: URL of Supabase instance
- `SUPABASE_SERVICE_KEY`: Service role key for admin operations
- `SUPABASE_ANON_KEY`: Anonymous key (used by client)

### Required Dependencies (Already Installed)

- `@supabase/supabase-js`: Supabase client SDK
- `express`: Web framework
- `zod`: TypeScript schema validation
- `typescript`: Type system

### No New Dependencies Required

---

## 13. Estimated Development Effort

| Phase     | Task                         | Effort       |
| --------- | ---------------------------- | ------------ |
| 1         | Service layer method         | 30 mins      |
| 2         | Controller handler           | 20 mins      |
| 3         | Route registration           | 5 mins       |
| 4         | Validation schema (optional) | 10 mins      |
| 5         | Testing & documentation      | 30 mins      |
| 6         | Code review & fixes          | 15 mins      |
| **Total** | **All phases**               | **~2 hours** |

---

## 14. Success Criteria

### Functional Requirements

- [ ] DELETE request to `/api/reports/{id}` returns 204 on success
- [ ] Report is soft-deleted (deleted_at is set)
- [ ] Report is no longer visible in GET /api/reports by default
- [ ] Report is visible in GET /api/reports?include_deleted=true
- [ ] User cannot delete another user's report (404)
- [ ] User cannot delete already-deleted report (404)
- [ ] Invalid UUID returns 400 Bad Request
- [ ] Missing auth returns 401 Unauthorized

### Code Quality Requirements

- [ ] No TypeScript errors or linting issues
- [ ] Consistent code style with existing codebase
- [ ] Comprehensive error handling
- [ ] Proper logging at all levels
- [ ] JSDoc comments on all public methods
- [ ] No console.log in production code

### Security Requirements

- [ ] JWT token properly validated
- [ ] User ownership verified
- [ ] RLS policies enforced
- [ ] Defense-in-depth checks in place
- [ ] No information leakage in error responses
- [ ] No SQL injection vulnerabilities
- [ ] No race condition vulnerabilities

### Performance Requirements

- [ ] Database queries use indexed columns
- [ ] No N+1 query patterns
- [ ] Response time < 100ms (typical)
- [ ] No memory leaks in error handling
