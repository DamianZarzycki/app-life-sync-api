# API Endpoint Implementation Plan: POST /api/feedback

## 1. Endpoint Overview

**Purpose**: Allow authenticated users to submit feedback for reports with an optional upsert capability. Since the feedback relationship is 1:1 with reports (one feedback per report per user), the endpoint must handle conflicts gracefully.

**Key Features**:

- Create new feedback for a report or update existing
- Return 409 Conflict if feedback exists and upsert mode is disabled (default)
- Return 201 Created on successful creation, 200 OK on successful update
- Enforce user ownership through RLS and explicit authorization checks
- Validate input constraints (rating values, comment length)

**HTTP Method**: POST  
**URL Pattern**: `/api/feedback`  
**Authentication**: Required (Bearer token)

---

## 2. Request Details

### HTTP Method

- **POST**

### URL Structure

- **Base**: `/api/feedback`
- **Full Path**: `POST /api/feedback?upsert=true`

### Query Parameters

| Parameter | Type    | Default | Description                                                                                                           |
| --------- | ------- | ------- | --------------------------------------------------------------------------------------------------------------------- |
| `upsert`  | boolean | `false` | If `true`, create feedback if missing or update existing. If `false` (default), return 409 if feedback already exists |

### Request Body

```json
{
  "report_id": "550e8400-e29b-41d4-a716-446655440000",
  "rating": -1,
  "comment": "This report was very helpful for my weekly review"
}
```

### Request Body Fields

| Field       | Type           | Required | Constraints                     | Example                                   |
| ----------- | -------------- | -------- | ------------------------------- | ----------------------------------------- |
| `report_id` | UUID string    | ✓ Yes    | Valid UUID v4 format            | `"550e8400-e29b-41d4-a716-446655440000"`  |
| `rating`    | integer        | ✓ Yes    | Must be -1, 0, or 1             | `-1` (dislike), `0` (neutral), `1` (like) |
| `comment`   | string \| null | ✗ No     | Max 300 characters, can be null | `"Great insights!"`                       |

### Header Requirements

```
Authorization: Bearer <jwt_token>
Content-Type: application/json
```

---

## 3. Response Details

### Success Response: 201 Created (New Feedback)

```json
{
  "id": "c7f7a1b9-8c2b-4d6e-a1f3-7b6c8d9e0f1a",
  "report_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "7c5b8f1d-3a2e-4b9c-8a1f-6e5d4c3b2a1f",
  "rating": -1,
  "comment": "This report was very helpful for my weekly review",
  "created_at": "2025-01-06T14:30:00Z",
  "updated_at": "2025-01-06T14:30:00Z"
}
```

### Success Response: 200 OK (Updated Feedback with upsert=true)

```json
{
  "id": "c7f7a1b9-8c2b-4d6e-a1f3-7b6c8d9e0f1a",
  "report_id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "7c5b8f1d-3a2e-4b9c-8a1f-6e5d4c3b2a1f",
  "rating": 1,
  "comment": "Actually, this was great!",
  "created_at": "2025-01-05T14:30:00Z",
  "updated_at": "2025-01-06T14:35:00Z"
}
```

### Error Responses

#### 400 Bad Request - Validation Error

**Occurs when**: Request body fails schema validation or query parameter is invalid

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body validation failed",
    "details": {
      "report_id": "report_id must be a valid UUID",
      "rating": "rating must be one of: -1, 0, 1",
      "comment": "comment must be a string with max 300 characters"
    }
  }
}
```

#### 401 Unauthorized - Authentication Missing or Invalid

**Occurs when**: No Authorization header, invalid JWT, or expired token

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

#### 404 Not Found - Report Not Found

**Occurs when**: Report ID doesn't exist or user doesn't own the report

```json
{
  "error": {
    "code": "REPORT_NOT_FOUND",
    "message": "Report not found"
  }
}
```

#### 409 Conflict - Feedback Already Exists

**Occurs when**: Feedback exists for this report_id and upsert=false

```json
{
  "error": {
    "code": "FEEDBACK_ALREADY_EXISTS",
    "message": "Feedback for this report already exists",
    "details": {
      "feedback_id": "c7f7a1b9-8c2b-4d6e-a1f3-7b6c8d9e0f1a",
      "existing_rating": -1,
      "hint": "Use ?upsert=true to update existing feedback"
    }
  }
}
```

#### 500 Internal Server Error

**Occurs when**: Unexpected server-side error

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

---

## 4. Used Types

### DTOs (from `src/types.ts`)

```typescript
export type ReportFeedbackDto = Tables<'report_feedback'>;
// Resolves to:
// {
//   id: UUID;
//   report_id: UUID;
//   user_id: UUID;
//   rating: number; // -1, 0, 1
//   comment: string | null;
//   created_at: string; // ISO datetime
//   updated_at: string; // ISO datetime
// }

export type SubmitFeedbackCommand = Pick<
  TablesInsert<'report_feedback'>,
  'report_id' | 'rating' | 'comment'
>;
// Resolves to:
// {
//   report_id: UUID;
//   rating: number;
//   comment: string | null;
// }
```

### Validation Schema (new file: `src/validation/feedback.ts`)

```typescript
export const SubmitFeedbackCommandSchema = z.object({
  report_id: z.string().uuid({ message: 'report_id must be a valid UUID' }),
  rating: z
    .number()
    .int({ message: 'rating must be an integer' })
    .refine((val) => [-1, 0, 1].includes(val), {
      message: 'rating must be one of: -1, 0, 1',
    }),
  comment: z
    .string()
    .max(300, { message: 'comment must be a string with max 300 characters' })
    .nullable()
    .optional(),
});

export type SubmitFeedbackCommand = z.infer<typeof SubmitFeedbackCommandSchema>;

export const SubmitFeedbackQuerySchema = z.object({
  upsert: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional()
    .default('false'),
});

export type SubmitFeedbackQuery = z.infer<typeof SubmitFeedbackQuerySchema>;
```

### Custom Error Classes (new file: `src/services/feedback.service.ts`)

```typescript
export class ReportNotFoundError extends Error {
  constructor(public reportId: UUID) {
    super(`Report ${reportId} not found`);
    this.name = 'ReportNotFoundError';
  }
}

export class FeedbackAlreadyExistsError extends Error {
  constructor(
    public reportId: UUID,
    public feedbackId: UUID,
    public existingRating: number
  ) {
    super(
      `Feedback for report ${reportId} already exists (ID: ${feedbackId}, rating: ${existingRating})`
    );
    this.name = 'FeedbackAlreadyExistsError';
  }
}
```

---

## 5. Data Flow

### High-Level Flow Diagram

```
Client Request (POST /api/feedback?upsert=true)
    ↓
[Auth Middleware]
    - Validate JWT token
    - Extract userId
    - Create user-scoped Supabase client with JWT
    ↓
[Request Body & Query Validation]
    - Parse JSON body and query params
    - Validate against SubmitFeedbackCommandSchema & SubmitFeedbackQuerySchema
    - Return 400 if validation fails
    ↓
[FeedbackService: submitFeedback()]
    - Check if report exists and user owns it
    - Query for existing feedback on this report
    - If exists and upsert=false: throw FeedbackAlreadyExistsError
    - If exists and upsert=true: UPDATE feedback record
    - If not exists: INSERT new feedback record
    - Return updated/created ReportFeedbackDto
    ↓
[Success Response]
    - Return 201 Created (new) or 200 OK (updated)
    - Include full ReportFeedbackDto in response body
```

### Detailed Step-by-Step Process

#### 1. Request Reception & Authentication

- Express receives POST request with Authorization header
- Auth middleware validates JWT, extracts userId, creates user-scoped Supabase client
- Request context: `req.auth = { userId, jwt }`

#### 2. Input Validation (Controller)

- Parse request body as SubmitFeedbackCommand
- Parse query parameters as SubmitFeedbackQuery (extract upsert flag)
- Use Zod schemas to validate structure and constraints
- Return 400 Bad Request with field-level errors if validation fails

#### 3. Service Layer: Verify Report Exists (FeedbackService)

- Query `reports` table by report_id (RLS ensures user-owned report only)
- If report doesn't exist or is soft-deleted, throw ReportNotFoundError
- If report belongs to different user (defense-in-depth), throw ReportNotFoundError

#### 4. Service Layer: Check for Existing Feedback

- Query `report_feedback` table for unique constraint (report_id + user_id)
- Check if row with this report_id exists for the authenticated user

#### 5. Service Layer: Conflict Resolution

- **If feedback exists AND upsert=false**:
  - Throw FeedbackAlreadyExistsError with current feedback details
  - Controller catches and returns 409 Conflict
- **If feedback exists AND upsert=true**:
  - Proceed to UPDATE step
- **If feedback doesn't exist**:
  - Proceed to INSERT step

#### 6. Service Layer: CREATE or UPDATE

- **INSERT (new feedback)**:
  - Insert into `report_feedback` with provided report_id, rating, comment
  - Database auto-sets user_id (from JWT), created_at, updated_at
  - Return 201 Created with full ReportFeedbackDto
- **UPDATE (upsert mode)**:
  - Update existing feedback with new rating and/or comment
  - Database auto-updates updated_at timestamp
  - Preserve created_at from original record
  - Return 200 OK with updated ReportFeedbackDto

#### 7. Response Construction

- Include full ReportFeedbackDto with all fields
- Set appropriate status code (201 for create, 200 for update)
- For 201, optionally set Location header: `/api/feedback/{id}`

---

## 6. Security Considerations

### Authentication & Authorization

1. **JWT Validation**: Auth middleware enforces valid Bearer token
   - Expired tokens rejected with 401 Unauthorized
   - Invalid signatures rejected with 401 Unauthorized
   - Missing header rejected with 401 Unauthorized

2. **User Ownership (via RLS)**:
   - User-scoped Supabase client created with JWT ensures Row-Level Security
   - All queries only see/modify user's own data
   - Defense-in-depth: Service explicitly verifies report ownership before allowing feedback

3. **Report Verification**:
   - Report must exist and not be soft-deleted
   - Service confirms user_id on report matches authenticated user
   - Prevents users from submitting feedback for other users' reports

### Input Validation

1. **UUID Format Validation**:
   - report_id validated as RFC 4122 compliant UUID via Zod
   - Prevents malformed IDs from reaching database

2. **Rating Value Validation**:
   - Restricted to enum: [-1, 0, 1]
   - Prevents invalid ratings (e.g., 2, 100, null without opt-in)

3. **Comment Length Validation**:
   - Max 300 characters enforced at API layer (before DB insert)
   - Prevents resource exhaustion from extremely large strings
   - Matches database constraint (TEXT column with check constraint)

4. **Parameterized Queries**:
   - Supabase client uses parameterized queries
   - No string concatenation in query construction
   - Prevents SQL injection attacks

### Data Privacy

1. **Response Filtering**:
   - Only return fields defined in ReportFeedbackDto
   - Never expose internal database columns or metadata
   - Never return other users' feedback

2. **No Logging of Sensitive Data**:
   - Log operation success/error codes only
   - Don't log full comment text in analytics
   - Avoid exposing rating/comment in error messages to other users

3. **HTTPS Enforcement**:
   - API gateway should enforce HTTPS-only
   - Comments may contain sensitive information

### Rate Limiting

- Suggested per-user rate limiting: 30 requests per minute for feedback endpoint
- Prevents abuse of feedback submission (e.g., spam feedback)
- Implement via Redis-backed rate limiter middleware at API gateway level

---

## 7. Error Handling

### Error Categorization & Handling Strategy

#### Validation Errors (400 Bad Request)

**Layer**: Controller (request parsing)

**Scenarios**:
| Error | Source | Resolution |
|-------|--------|-----------|
| Invalid UUID format in report_id | Zod validation | Return 400 with field-level error |
| rating not in [-1, 0, 1] | Zod validation | Return 400 with field-level error |
| comment exceeds 300 characters | Zod validation | Return 400 with field-level error |
| comment is not string/null | Zod validation | Return 400 with field-level error |
| Missing required field (report_id or rating) | Zod validation | Return 400 with field-level error |
| Invalid query parameter upsert value | Zod validation | Return 400 with field-level error |

**Controller Handling**:

```typescript
try {
  validatedBody = SubmitFeedbackCommandSchema.parse(req.body);
  validatedQuery = SubmitFeedbackQuerySchema.parse(req.query);
} catch (validationError) {
  if (validationError instanceof z.ZodError) {
    const details = Object.fromEntries(
      validationError.errors.map((err) => [err.path.join('.'), err.message])
    );
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request body validation failed',
        details,
      },
    });
  }
}
```

#### Authentication Errors (401 Unauthorized)

**Layer**: Auth Middleware

**Scenarios**:
| Error | Cause | Resolution |
|-------|-------|-----------|
| Missing Authorization header | Client didn't send Bearer token | Auth middleware rejects with 401 |
| Invalid JWT signature | Token tampered or signed by different key | Auth middleware rejects with 401 |
| Expired JWT token | Token issued more than expiration time ago | Auth middleware rejects with 401 |
| Malformed Authorization header | Format not "Bearer <token>" | Auth middleware rejects with 401 |

**No action needed in controller** - handled upstream by auth middleware

#### Authorization Errors (404 Not Found)

**Layer**: Service layer (FeedbackService)

**Scenarios**:
| Error | Cause | Resolution |
|-------|-------|-----------|
| Report doesn't exist | UUID provided, but no report with that ID | Service throws ReportNotFoundError → 404 |
| Report soft-deleted | Report was deleted by user | Service throws ReportNotFoundError → 404 |
| Report belongs to different user | RLS + defense-in-depth check fails | Service throws ReportNotFoundError → 404 |

**Controller Handling**:

```typescript
if (err instanceof ReportNotFoundError) {
  return res.status(404).json({
    error: {
      code: 'REPORT_NOT_FOUND',
      message: 'Report not found',
    },
  });
}
```

#### Conflict Errors (409 Conflict)

**Layer**: Service layer (FeedbackService)

**Scenarios**:
| Error | Cause | When Occurs |
|-------|-------|-----------|
| Feedback already exists for report | Existing row with same report_id | upsert=false (default) |

**Service Logic**:

```typescript
async submitFeedback(
  userId: UUID,
  command: SubmitFeedbackCommand,
  upsert: boolean
): Promise<ReportFeedbackDto> {
  // Check if report exists
  const report = await this.verifyReportExists(userId, command.report_id);

  // Check if feedback exists
  const existingFeedback = await this.findExistingFeedback(command.report_id);

  if (existingFeedback && !upsert) {
    throw new FeedbackAlreadyExistsError(
      command.report_id,
      existingFeedback.id,
      existingFeedback.rating
    );
  }

  // Either create or update
  if (existingFeedback && upsert) {
    return this.updateFeedback(existingFeedback.id, command);
  } else {
    return this.createFeedback(userId, command);
  }
}
```

**Controller Handling**:

```typescript
if (err instanceof FeedbackAlreadyExistsError) {
  return res.status(409).json({
    error: {
      code: 'FEEDBACK_ALREADY_EXISTS',
      message: 'Feedback for this report already exists',
      details: {
        feedback_id: err.feedbackId,
        existing_rating: err.existingRating,
        hint: 'Use ?upsert=true to update existing feedback',
      },
    },
  });
}
```

#### Server Errors (500 Internal Server Error)

**Layer**: Service layer or database layer

**Scenarios**:
| Error | Cause | Resolution |
|-------|-------|-----------|
| Database connection failure | Network issue with Supabase | Log error, return 500 |
| Unexpected database error | Bug, schema change, or Supabase outage | Log full error, return 500 |
| Unexpected runtime error | Uncaught exception in service | Log error, return 500 |

**Controller Handling** (Generic catch-all):

```typescript
catch (err) {
  console.error('submitFeedbackHandler error:', err);
  return res.status(500).json({
    error: {
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
```

---

## 8. Performance Considerations

### Database Query Optimization

1. **Unique Constraint on (report_id, user_id)**:
   - Database enforces 1:1 relationship via UNIQUE constraint
   - Prevents concurrent insert conflicts
   - Supabase efficiently checks constraint before insert

2. **Index Strategy**:
   - Primary index on report_feedback.id
   - Composite index on (report_id, user_id) for O(1) lookups
   - Index on report_feedback.user_id for potential future queries

3. **Query Count**:
   - 1 query to verify report exists
   - 1 query to check existing feedback
   - 1 query to insert/update feedback
   - **Total: 3 queries per request** (acceptable for small dataset)

### Potential Bottlenecks

1. **Large Comment Strings**:
   - Max 300 characters prevents large text from bloating database
   - Index on report_id remains efficient

2. **Concurrent Submissions**:
   - Database UNIQUE constraint handles race conditions
   - If two requests hit simultaneously, second request will fail (then retry with upsert=true)
   - Acceptable behavior for typical feedback use case

### Optimization Strategies

1. **Connection Pooling**: Supabase client auto-manages connection pooling
2. **Caching**: Not needed for 1:1 unique records; write-through semantics preferred
3. **Pagination**: Not applicable (single feedback record per report)
4. **Batch Operations**: Not applicable (single feedback record submission)

---

## 9. Implementation Steps

### Phase 1: Setup & Validation (30 minutes)

1. **Create validation schema** (`src/validation/feedback.ts`):
   - Define `SubmitFeedbackCommandSchema` with Zod
   - Define `SubmitFeedbackQuerySchema` for upsert query param
   - Export types from schema

2. **Define custom error classes** (in `src/services/feedback.service.ts`):
   - `ReportNotFoundError` (extends Error)
   - `FeedbackAlreadyExistsError` (extends Error with reportId, feedbackId, existingRating)

### Phase 2: Service Layer (45 minutes)

3. **Create FeedbackService** (`src/services/feedback.service.ts`):
   - Constructor accepts user-scoped Supabase client
   - Implement `submitFeedback()` method:
     - Verify report exists and user owns it
     - Check for existing feedback
     - Handle upsert flag logic
     - Insert or update based on condition
   - Implement private helper methods:
     - `verifyReportExists(userId, reportId)` - queries reports table
     - `findExistingFeedback(reportId)` - queries report_feedback table
     - `createFeedback(userId, command)` - inserts new feedback
     - `updateFeedback(feedbackId, command)` - updates existing feedback

### Phase 3: Controller Handler (30 minutes)

4. **Create controller handler** (`src/controllers/feedback.controller.ts`):
   - Implement `submitFeedbackHandler()`:
     - Check authentication (req.auth exists)
     - Parse and validate request body with SubmitFeedbackCommandSchema
     - Parse and validate query params with SubmitFeedbackQuerySchema
     - Call FeedbackService.submitFeedback()
     - Return 201/200 on success
     - Catch and handle specific error types:
       - ZodError → 400 Bad Request
       - ReportNotFoundError → 404 Not Found
       - FeedbackAlreadyExistsError → 409 Conflict
       - Generic Error → 500 Internal Server Error
     - Log errors appropriately

### Phase 4: Routes & Integration (20 minutes)

5. **Create feedback router** (`src/routes/feedback.router.ts`):
   - Import authMiddleware and submitFeedbackHandler
   - Define POST route: `router.post('/', authMiddleware, submitFeedbackHandler)`
   - Export router

6. **Register router in main app** (`src/index.ts`):
   - Import feedbackRouter
   - Add route: `app.use('/api/feedback', feedbackRouter)`

### Phase 5: Testing & Documentation (30 minutes)

7. **Write integration tests** (`src/controllers/feedback.controller.spec.ts`):
   - Test 201 Created: new feedback submission
   - Test 200 OK: upsert=true updates existing feedback
   - Test 400: validation errors (invalid UUID, rating out of range, comment too long)
   - Test 401: missing/invalid authentication
   - Test 404: report not found
   - Test 409: feedback exists with upsert=false
   - Test 500: database error handling

8. **Create CURL examples** (in `CURL_QUICK_REFERENCE.md`):
   - Create new feedback: `curl -X POST /api/feedback -H "Authorization: Bearer ..." -d '...'`
   - Upsert feedback: `curl -X POST /api/feedback?upsert=true -H "Authorization: Bearer ..." -d '...'`
   - Handle conflict: Show 409 response example

9. **Update API documentation**:
   - Add endpoint to `docs/ENDPOINT_TESTING_GUIDE.md`
   - Include success and error response examples
   - Document query parameters and request body fields

### Phase 6: Deployment Checklist (15 minutes)

10. **Pre-deployment verification**:
    - All tests pass (npm test)
    - TypeScript compilation succeeds (npm run build)
    - Linting passes (npm run lint)
    - No console.error logs in happy path
    - Error logging includes context (userId, reportId where applicable)
    - Rate limiting configured at API gateway

11. **Database readiness**:
    - Ensure report_feedback table exists with all constraints
    - Verify UNIQUE constraint on (report_id, user_id)
    - Confirm RLS policies allow user-scoped access
    - Verify indexes on report_id and user_id

12. **Environment variables**:
    - SUPABASE_URL set in deployment environment
    - SUPABASE_SERVICE_KEY set in deployment environment
    - No hardcoded secrets in code

---

## 10. Summary of Key Files to Create/Modify

### New Files

| File                                     | Purpose                                |
| ---------------------------------------- | -------------------------------------- |
| `src/validation/feedback.ts`             | Zod schemas for request validation     |
| `src/services/feedback.service.ts`       | Business logic for feedback operations |
| `src/controllers/feedback.controller.ts` | Express handler for POST /api/feedback |
| `src/routes/feedback.router.ts`          | Express router for feedback endpoints  |

### Modified Files

| File                             | Change                                                               |
| -------------------------------- | -------------------------------------------------------------------- |
| `src/index.ts`                   | Register feedback router: `app.use('/api/feedback', feedbackRouter)` |
| `CURL_QUICK_REFERENCE.md`        | Add POST /api/feedback examples                                      |
| `docs/ENDPOINT_TESTING_GUIDE.md` | Add feedback endpoint test cases                                     |

### No Changes Required

| File                                | Reason                                                      |
| ----------------------------------- | ----------------------------------------------------------- |
| `src/types.ts`                      | ReportFeedbackDto and SubmitFeedbackCommand already defined |
| `src/db/database.types.ts`          | Auto-generated from Supabase schema                         |
| `src/middleware/auth.middleware.ts` | Reuse existing auth middleware                              |

---

## Appendix: Error Code Reference

| HTTP Status | Error Code              | Meaning                                     | Recovery                           |
| ----------- | ----------------------- | ------------------------------------------- | ---------------------------------- |
| 201         | N/A                     | Feedback created successfully               | Display success message            |
| 200         | N/A                     | Feedback updated successfully (upsert)      | Display success message            |
| 400         | VALIDATION_ERROR        | Request failed schema validation            | Client fixes input, retries        |
| 401         | UNAUTHORIZED            | Missing or invalid authentication           | Client refreshes JWT, retries      |
| 404         | REPORT_NOT_FOUND        | Report doesn't exist or user doesn't own it | Client verifies report_id, retries |
| 409         | FEEDBACK_ALREADY_EXISTS | Feedback exists (only if upsert=false)      | Client uses ?upsert=true, retries  |
| 500         | SERVER_ERROR            | Unexpected server-side error                | Client retries after delay         |

---

## Appendix: Example Database Interaction

### Scenario 1: Create New Feedback

```sql
-- Check report exists
SELECT id, user_id FROM reports
WHERE id = '550e8400-e29b-41d4-a716-446655440000'
AND user_id = '7c5b8f1d-3a2e-4b9c-8a1f-6e5d4c3b2a1f'
AND deleted_at IS NULL;

-- Check existing feedback
SELECT id, rating FROM report_feedback
WHERE report_id = '550e8400-e29b-41d4-a716-446655440000';

-- Insert new feedback
INSERT INTO report_feedback (report_id, user_id, rating, comment)
VALUES (
  '550e8400-e29b-41d4-a716-446655440000',
  '7c5b8f1d-3a2e-4b9c-8a1f-6e5d4c3b2a1f',
  -1,
  'This report was very helpful for my weekly review'
);

-- Return full feedback
SELECT * FROM report_feedback WHERE id = '<newly-created-id>';
```

### Scenario 2: Upsert Feedback (update existing)

```sql
-- Check report exists
SELECT id, user_id FROM reports
WHERE id = '550e8400-e29b-41d4-a716-446655440000'
AND user_id = '7c5b8f1d-3a2e-4b9c-8a1f-6e5d4c3b2a1f'
AND deleted_at IS NULL;

-- Check existing feedback
SELECT id, rating FROM report_feedback
WHERE report_id = '550e8400-e29b-41d4-a716-446655440000';

-- Update existing feedback (if exists)
UPDATE report_feedback
SET rating = 1,
    comment = 'Actually, this was great!',
    updated_at = now()
WHERE report_id = '550e8400-e29b-41d4-a716-446655440000';

-- Return updated feedback
SELECT * FROM report_feedback WHERE report_id = '550e8400-e29b-41d4-a716-446655440000';
```

### Scenario 3: Conflict (existing feedback, upsert=false)

```sql
-- Check report exists
SELECT id, user_id FROM reports
WHERE id = '550e8400-e29b-41d4-a716-446655440000'
AND user_id = '7c5b8f1d-3a2e-4b9c-8a1f-6e5d4c3b2a1f'
AND deleted_at IS NULL;

-- Check existing feedback
SELECT id, rating FROM report_feedback
WHERE report_id = '550e8400-e29b-41d4-a716-446655440000';

-- Feedback exists → Return 409 Conflict with existing feedback details
```
