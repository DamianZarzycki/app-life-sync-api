# API Endpoint Implementation Plan: POST /api/reports/generate

## 1. Endpoint Overview

### Purpose

Generate a new on-demand weekly report for the authenticated user. This endpoint orchestrates:

1. Validation of input categories
2. Enforcement of the 3 reports/week limit per user (on-demand only)
3. Idempotency support via `Idempotency-Key` header to prevent duplicate generations
4. Report creation with LLM-generated content (HTML + optional text/PDF)
5. Automatic in-app delivery entry creation

### Key Characteristics

- **Operation Type**: Creation (POST)
- **Idempotency**: Supported via `Idempotency-Key` header
- **Response**: Full `ReportDto` matching GET response shape
- **Success Status**: 201 Created (with Location header)
- **Authorization**: Requires valid JWT token
- **Rate Limiting**: Tighter per-user rate limit recommended (e.g., 5 requests/minute)
- **Weekly Quota**: Max 3 on-demand reports per user per local week (includes soft-deleted)

---

## 2. Request Details

### HTTP Method

POST

### URL Structure

```
/api/reports/generate
```

### Request Headers

| Header            | Required | Format               | Description                                       |
| ----------------- | -------- | -------------------- | ------------------------------------------------- |
| `Authorization`   | Yes      | `Bearer <JWT_TOKEN>` | Supabase authentication token                     |
| `Content-Type`    | Yes      | `application/json`   | Must be set to application/json                   |
| `Idempotency-Key` | No       | UUID or string       | Unique key to prevent duplicate report generation |

### Request Body

```json
{
  "include_categories": ["uuid", "uuid", "..."]
}
```

| Field                | Type   | Required | Constraints                                              | Description                                    |
| -------------------- | ------ | -------- | -------------------------------------------------------- | ---------------------------------------------- |
| `include_categories` | UUID[] | Yes      | Non-empty array; all must be valid UUIDs; max 3 elements | Categories to include in the report generation |

### Request Body Validation Rules

1. **include_categories**:
   - Type: Array of strings (UUIDs)
   - Required: Yes
   - Min items: 1 (at least one category must be specified)
   - Max items: 3 (matches `active_categories` max)
   - Each element: Valid UUID v4 format (RFC 4122)
   - No duplicates within array
   - All UUIDs must correspond to categories that exist and are marked `active`
   - All categories must be in user's `preferences.active_categories` (authorization check)

### Example Request

```bash
curl -X POST https://api.example.com/api/reports/generate \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "include_categories": ["uuid1", "uuid2"]
  }'
```

---

## 3. Response Details

### Success Response (201 Created)

**Status Code**: 201 Created

**Headers**:

```
Location: /api/reports/{id}
Content-Type: application/json
```

**Response Body** (ReportDto):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "00000000-0000-0000-0000-000000000001",
  "generated_by": "on_demand",
  "html": "<html><body>...</body></html>",
  "text_version": "Weekly Report for Jan 6-12, 2025\n...",
  "pdf_path": "s3://bucket/reports/550e8400-e29b-41d4-a716-446655440000.pdf",
  "llm_model": "gpt-4",
  "system_prompt_version": "v1.0",
  "categories_snapshot": [
    { "id": "uuid1", "name": "Health" },
    { "id": "uuid2", "name": "Work" }
  ],
  "created_at": "2025-01-06T10:30:45.123Z",
  "updated_at": "2025-01-06T10:30:45.123Z",
  "deleted_at": null
}
```

### Error Responses

#### 400 Bad Request - Validation Error

**When**: Request body validation fails (invalid UUIDs, empty array, missing field, etc.)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body validation failed",
    "details": {
      "include_categories": "Array must contain at least 1 element",
      "include_categories[0]": "Invalid UUID format"
    }
  }
}
```

#### 401 Unauthorized - Missing/Invalid Authentication

**When**: Authorization header missing, invalid, or JWT expired

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

#### 409 Conflict - Weekly On-Demand Limit Exceeded

**When**: User has already created 3 on-demand reports this local week

```json
{
  "error": {
    "code": "WEEKLY_LIMIT_REACHED",
    "message": "Maximum 3 on-demand reports allowed per week",
    "details": {
      "limit": 3,
      "count_this_week": 3,
      "week_start": "2025-01-06",
      "week_end": "2025-01-12"
    }
  }
}
```

#### 409 Conflict - Invalid Categories

**When**: One or more categories don't exist, are inactive, or not in user's active preferences

```json
{
  "error": {
    "code": "INVALID_CATEGORIES",
    "message": "One or more categories are invalid or not active",
    "details": {
      "invalid_ids": ["uuid-invalid-1", "uuid-inactive-2"],
      "reason": "Categories must exist, be active, and be in your active preferences"
    }
  }
}
```

#### 409 Conflict - Idempotency: Duplicate Key Within Window

**When**: Idempotency-Key matches a recent request (if idempotency storage is used)

```json
{
  "error": {
    "code": "DUPLICATE_REQUEST",
    "message": "Request with this Idempotency-Key is already being processed",
    "details": {
      "idempotency_key": "550e8400-e29b-41d4-a716-446655440000",
      "original_request_id": "req-xyz"
    }
  }
}
```

#### 422 Unprocessable Entity - Category Authorization

**When**: All categories are invalid or user not authorized for them

```json
{
  "error": {
    "code": "CATEGORY_NOT_AUTHORIZED",
    "message": "Not authorized to generate report with specified categories",
    "details": {
      "unauthorized_ids": ["uuid1", "uuid2"]
    }
  }
}
```

#### 500 Server Error

**When**: Unexpected server-side error (database, LLM service, etc.)

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

### Request Validation Schema

**File**: `src/validation/reports.ts`

```typescript
export const GenerateReportCommandSchema = z.object({
  include_categories: z
    .array(z.string().uuid({ message: 'Each category ID must be a valid UUID' }))
    .min(1, { message: 'At least one category must be specified' })
    .max(3, { message: 'Maximum 3 categories allowed' })
    .refine((arr) => new Set(arr).size === arr.length, {
      message: 'Duplicate category IDs are not allowed',
    }),
});

export type GenerateReportCommand = z.infer<typeof GenerateReportCommandSchema>;
```

### DTOs and Type Aliases

**File**: `src/types.ts` (already defined)

```typescript
export type ReportDto = Tables<'reports'>;

export type GenerateReportCommand = {
  include_categories: UUID[];
};
```

### Service Layer Custom Errors

**File**: `src/services/reports.service.ts`

```typescript
export class WeeklyLimitExceededError extends Error {
  constructor(
    public count: number,
    public limit: number = 3
  ) {
    super(`Weekly on-demand report limit exceeded: ${count} >= ${limit}`);
    this.name = 'WeeklyLimitExceededError';
  }
}

export class InvalidCategoriesError extends Error {
  constructor(public invalidIds: UUID[]) {
    super(`Invalid or unauthorized categories: ${invalidIds.join(', ')}`);
    this.name = 'InvalidCategoriesError';
  }
}

export class DuplicateIdempotencyKeyError extends Error {
  constructor(public idempotencyKey: string) {
    super(`Idempotency key already processed: ${idempotencyKey}`);
    this.name = 'DuplicateIdempotencyKeyError';
  }
}
```

---

## 5. Data Flow

### Step-by-Step Execution Flow

```
1. CLIENT REQUEST
   └─> POST /api/reports/generate
       ├─ Headers: Authorization, Idempotency-Key (optional)
       └─ Body: { include_categories: [...] }

2. AUTH MIDDLEWARE (authMiddleware)
   └─> Validate JWT
       ├─ Extract userId and JWT token
       └─ Attach to req.auth

3. ROUTE HANDLER (generateReportHandler)
   └─> Request Validation
       ├─ Parse request body using GenerateReportCommandSchema
       └─ Return 400 if validation fails

4. SERVICE LAYER (ReportsService.generateReport)
   ├─ Idempotency Check
   │  ├─ If Idempotency-Key provided:
   │  │  ├─ Check if key exists in idempotency store (cache/DB)
   │  │  ├─ If exists: Return cached response with 201
   │  │  └─ If not: Continue with generation
   │  └─ Store Idempotency-Key for 24 hours
   │
   ├─ Category Validation
   │  ├─ Query all categories with IDs matching include_categories
   │  ├─ Verify all exist and are marked active
   │  ├─ Fetch user preferences and verify all in active_categories
   │  ├─ Return 422/409 if any invalid or unauthorized
   │  └─ Store categories_snapshot for report
   │
   ├─ Weekly Limit Check
   │  ├─ Calculate current local week (Monday 00:00 to Sunday 23:59:59)
   │  │  └─ Use user's profile timezone for week boundary calculation
   │  ├─ Count on-demand reports created this week (includes soft-deleted)
   │  ├─ If count >= 3: Throw WeeklyLimitExceededError
   │  └─ Continue to generation
   │
   ├─ Report Generation (LLM)
   │  ├─ Fetch all notes from include_categories for this week
   │  ├─ Call LLM service (e.g., OpenAI) with notes
   │  │  ├─ System prompt: "Generate a weekly report"
   │  │  ├─ User prompt: Formatted notes data
   │  │  └─ Response: { html, text_version?, pdf_path?, llm_model, system_prompt_version }
   │  └─ Handle LLM service errors (rate limit, auth, etc.)
   │
   ├─ Database Insert
   │  ├─ Create transaction
   │  ├─ Insert into reports table:
   │  │  ├─ id: generated UUID
   │  │  ├─ user_id: from JWT
   │  │  ├─ generated_by: 'on_demand'
   │  │  ├─ html: from LLM
   │  │  ├─ text_version: from LLM
   │  │  ├─ pdf_path: from LLM (nullable)
   │  │  ├─ llm_model: from LLM response
   │  │  ├─ system_prompt_version: from LLM config
   │  │  ├─ categories_snapshot: JSON of selected categories
   │  │  └─ created_at, updated_at: now()
   │  │
   │  ├─ Trigger: reports_auto_insert_in_app_delivery
   │  │  └─ Automatically create in-app delivery entry
   │  │
   │  └─ Commit transaction
   │
   └─ Idempotency Storage
      └─ Store generated report ID with Idempotency-Key for 24 hours

5. RESPONSE HANDLER
   └─> Success (201 Created)
       ├─ Headers: Location: /api/reports/{reportId}
       ├─ Body: Full ReportDto
       └─ Return to client
```

### Database Queries

**Query 1: Validate Categories**

```sql
SELECT id, name, active FROM categories
WHERE id = ANY($1::uuid[])
AND user_id = $2;
```

**Query 2: Fetch User Preferences**

```sql
SELECT active_categories FROM preferences
WHERE user_id = $1;
```

**Query 3: Count On-Demand Reports This Week**

```sql
SELECT COUNT(*) as count FROM reports
WHERE user_id = $1
  AND generated_by = 'on_demand'
  AND created_at >= $2  -- week start
  AND created_at <= $3; -- week end
  -- Note: Does NOT filter deleted_at (counts soft-deleted)
```

**Query 4: Insert Report**

```sql
INSERT INTO reports (
  id, user_id, generated_by, html, text_version,
  pdf_path, llm_model, system_prompt_version,
  categories_snapshot, created_at, updated_at
) VALUES (
  $1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now()
)
RETURNING *;
```

**Query 5: Fetch Notes for Report Content** (for LLM)

```sql
SELECT id, title, content, category_id, created_at, updated_at
FROM notes
WHERE user_id = $1
  AND category_id = ANY($2::uuid[])
  AND created_at >= $3   -- week start
  AND created_at <= $4   -- week end
  AND deleted_at IS NULL
ORDER BY created_at DESC;
```

---

## 6. Security Considerations

### 1. Authentication & Authorization

**Mechanism**: JWT-based (Supabase)

- **Required**: Bearer token in Authorization header
- **Validation**: Auth middleware extracts and validates JWT
- **User Isolation**: User-scoped Supabase client with RLS ensures data ownership
- **Scope**: Only the authenticated user can generate reports for themselves

**Threat Mitigated**: Unauthorized access, user impersonation

### 2. Category Authorization

**Check**: Verify all `include_categories` are in user's `preferences.active_categories`

- User can only report on categories they've explicitly enabled
- Prevents users from accessing/reporting on inactive or unauthorized categories
- Database constraint + API validation (defense in depth)

**Threat Mitigated**: Privilege escalation, unauthorized category access

### 3. Input Validation

**Validation Strategy** (multi-layer):

a. **Request Body Schema** (Zod):

- UUID format validation for each category ID
- Array length constraints (1-3 items)
- No duplicates within array
- Returns 400 with detailed field errors on failure

b. **Business Logic Validation** (Service):

- Verify all category IDs exist in database
- Confirm categories are marked active
- Confirm user is authorized for each category
- Returns 422/409 with invalid IDs on failure

**Threat Mitigated**: SQL injection, invalid data insertion, authorization bypass

### 4. Rate Limiting

**Recommendation**: Tighter rate limit for this endpoint (relative to GET)

- **Suggested**: 5 requests per minute per user (adjustable)
- **Location**: Rate limit middleware on router
- **Purpose**: Prevent abuse (spam, expensive LLM calls)
- **Response**: 429 Too Many Requests if exceeded

**Threat Mitigated**: Brute force attacks, resource exhaustion, cost abuse

### 5. Idempotency

**Purpose**: Prevent duplicate report generation if request is retried

**Implementation Options**:

a. **Database-backed** (Recommended):

- Store idempotency key in `idempotency_keys` table (per spec)
- Key format: string or UUID
- TTL: 24 hours (clean up expired keys)
- Query: `SELECT report_id FROM idempotency_keys WHERE key = $1 AND expires_at > now()`
- If key exists: Return cached report from result_data
- If new: Generate report and store result with key

b. **Cache-backed** (Simpler but less durable):

- Store in Redis with 24-hour TTL
- Trade-off: Cache loss = idempotency loss
- Still prevents duplicates within cache window

**Threat Mitigated**: Duplicate resource creation, double-charging for LLM calls

### 6. Weekly Quota Enforcement

**Logic**: Count on-demand reports in current local week; reject if >= 3

- **Week calculation**: User's timezone (from profile) determines Monday-Sunday boundaries
- **Includes soft-deleted**: Count all reports regardless of deleted_at (business requirement)
- **Atomic check**: Check and insert should be atomic (use transaction)
- **Race condition mitigation**: Database constraint + application-level check

**Threat Mitigated**: Quota bypassing, usage inflation, fair resource allocation

### 7. LLM Service Security

**External Service Call** (OpenAI/OpenRouter):

- **Auth**: Use API key from secure env variable (never expose in response)
- **Input Sanitization**: Ensure note content doesn't contain injection payloads
- **Rate Limiting**: Respect LLM service's own rate limits
- **Error Handling**: Don't expose LLM service errors directly to client
- **Timeout**: Set timeout (e.g., 30 seconds) to prevent hanging requests

**Threat Mitigated**: Information disclosure, service disruption, cost abuse

### 8. Sensitive Data Handling

**Data in Response**:

- Report HTML/text may contain user's notes (PII)
- Ensure HTTPS-only transmission
- Don't log full report content in analytics
- Only return `ReportDto` shape (never internal fields)

**Idempotency Key**:

- Don't expose in API responses
- Treat as sensitive (like session tokens)

**Threat Mitigated**: Data leakage, privacy violations

### 9. Concurrency & Race Conditions

**Scenario**: Two simultaneous requests to generate report

**Mitigation**:

a. **Idempotency Check** first: If key exists, return cached result
b. **Lock** on weekly count check: Use database-level lock or pessimistic locking
c. **Atomic Transaction**: Check count + insert in single transaction
d. **Supabase RLS**: Ensures only user's own reports are visible

**Threat Mitigated**: Over-limit bypassing, duplicate generation

---

## 7. Error Handling

### Error Scenarios and Responses

| Error Scenario                            | HTTP Status | Error Code              | Root Cause                                  | User Message                                        | Resolution                                      |
| ----------------------------------------- | ----------- | ----------------------- | ------------------------------------------- | --------------------------------------------------- | ----------------------------------------------- |
| Missing Authorization header              | 401         | UNAUTHORIZED            | No Bearer token provided                    | "Authentication required"                           | Add Authorization header with valid JWT         |
| Invalid/expired JWT                       | 401         | UNAUTHORIZED            | JWT invalid or expired                      | "Authentication required"                           | Re-authenticate and get new token               |
| Missing `include_categories` field        | 400         | VALIDATION_ERROR        | Request body missing required field         | "include_categories is required"                    | Add include_categories array to body            |
| Empty `include_categories` array          | 400         | VALIDATION_ERROR        | Array has 0 elements                        | "At least one category must be specified"           | Add at least 1 UUID to array                    |
| `include_categories` with >3 items        | 400         | VALIDATION_ERROR        | Array exceeds max length                    | "Maximum 3 categories allowed"                      | Remove items from array (max 3)                 |
| Invalid UUID format in category ID        | 400         | VALIDATION_ERROR        | UUID doesn't match RFC 4122 format          | "Each category ID must be a valid UUID"             | Provide valid UUID strings                      |
| Duplicate category IDs in array           | 400         | VALIDATION_ERROR        | Same UUID appears multiple times            | "Duplicate category IDs are not allowed"            | Remove duplicate IDs from array                 |
| Non-existent category ID                  | 409         | INVALID_CATEGORIES      | Category doesn't exist in database          | "One or more categories are invalid..."             | Use valid category IDs from GET /api/categories |
| Inactive category                         | 409         | INVALID_CATEGORIES      | Category.active = false                     | "One or more categories are invalid or inactive..." | Enable category or use active one               |
| Category not in user preferences          | 422         | CATEGORY_NOT_AUTHORIZED | Not in preferences.active_categories        | "Not authorized for specified categories"           | Add category to preferences first               |
| 3+ on-demand reports already this week    | 409         | WEEKLY_LIMIT_REACHED    | Count >= 3 in current local week            | "Maximum 3 on-demand reports allowed per week"      | Wait until next week or delete existing         |
| LLM service timeout                       | 500         | SERVER_ERROR            | LLM API didn't respond in time              | "An unexpected error occurred"                      | Retry after delay; contact support if persists  |
| LLM service rate limit hit                | 500         | SERVER_ERROR            | LLM API rate limit exceeded                 | "An unexpected error occurred"                      | Retry later; may implement queue                |
| LLM service auth failure                  | 500         | SERVER_ERROR            | LLM API key invalid or expired              | "An unexpected error occurred"                      | Check server configuration; contact ops         |
| Database connection failure               | 500         | SERVER_ERROR            | DB unreachable or connection pool exhausted | "An unexpected error occurred"                      | Retry; contact ops if persists                  |
| Duplicate Idempotency-Key (concurrent)    | 409         | DUPLICATE_REQUEST       | Key already being processed                 | "Request with this key already being processed"     | Wait or use new key                             |
| Duplicate Idempotency-Key (cached result) | 201         | (success, from cache)   | Key matches recent request                  | (returns cached report)                             | (no action needed; idempotency working)         |

### Logging Strategy

**Errors to Log**:

1. **LLM Service Errors** (ERROR level):
   - Include service name, error code, timestamp, user ID
   - Example: `[ERROR] LLM service unavailable: timeout after 30s for user {userId}`

2. **Unexpected Database Errors** (ERROR level):
   - Include query, error details, user ID
   - Example: `[ERROR] Failed to count on-demand reports: {dbError} for user {userId}`

3. **Validation Failures** (WARN level):
   - Don't log full request body (may contain sensitive data)
   - Example: `[WARN] Validation failed for POST /api/reports/generate: missing include_categories`

4. **Quota Violations** (INFO level):
   - Example: `[INFO] User {userId} attempted to exceed weekly limit: {count}/3`

5. **Authorization Failures** (WARN level):
   - Example: `[WARN] User {userId} attempted unauthorized category access: {invalidIds}`

**Logs Should NOT Include**:

- Full report HTML/text content
- Full request/response bodies (security risk)
- JWT tokens or Idempotency keys

---

## 8. Performance Considerations

### 1. Query Optimization

**Category Validation Query**:

- Index: `categories (id, active, user_id)`
- Expected: <1ms (small table, direct lookup)
- Alternative: Cache active categories for 5 minutes per user

**Weekly Count Query**:

- Index: `reports (user_id, generated_by, created_at DESC)`
- Expected: <10ms (small count)
- Atomic: Use transaction to prevent race conditions

**Notes Fetch for LLM**:

- Index: `notes (user_id, category_id, created_at DESC)`
- Expected: <100ms (depends on note volume)
- Filter: Only non-deleted notes in this week
- Optimization: Limit note fetch to recent N notes (e.g., 100)

### 2. LLM Call Latency

**Longest Operation**: LLM generation (OpenAI API call)

- **Typical**: 5-30 seconds (depends on model and note volume)
- **Max**: Set timeout to 30 seconds (fail gracefully)
- **Optimization**: Async processing (optional for future):
  - Return 202 Accepted immediately
  - Generate report in background job
  - Notify user via dashboard when ready

### 3. Database Transaction Strategy

**Goal**: Ensure atomicity of count check + insert

```typescript
// Pseudo-code
await db.transaction(async (trx) => {
  // Pessimistic lock: SELECT ... FOR UPDATE
  const [report] = await trx('reports')
    .where({ user_id: userId, generated_by: 'on_demand' })
    .where('created_at', '>=', weekStart)
    .where('created_at', '<=', weekEnd)
    .count()
    .forUpdate(); // Lock the rows

  if (report.count >= 3) {
    throw new WeeklyLimitExceededError(report.count);
  }

  // Insert report
  const [newReport] = await trx('reports').insert({...});
  return newReport;
});
```

### 4. Caching Strategy

**Category Cache** (Optional):

- Cache user's preferences.active_categories for 5 minutes
- Invalidate on preferences update
- Reduces query count for repeated generations

**Idempotency Cache**:

- Store generated report ID + response for 24 hours
- Use fast cache (Redis or in-memory with TTL)
- Allow cache miss gracefully (re-generate if needed)

### 5. Request Timeout

**Total Timeout**: 35 seconds (30s LLM + 5s overhead)

- Set at route level or middleware
- Return 504 Gateway Timeout if exceeded
- Retry logic at client

### 6. Connection Pooling

**Database**: Ensure Supabase connection pool is sized adequately

- Concurrent users × queries per request = pool size needed
- Monitor pool utilization

---

## 9. Implementation Steps

### Phase 1: Validation & Error Definitions

#### Step 1.1: Add Validation Schema

**File**: `src/validation/reports.ts`

Add or update the validation schema:

```typescript
import { z } from 'zod';

export const GenerateReportCommandSchema = z.object({
  include_categories: z
    .array(z.string().uuid({ message: 'Each category ID must be a valid UUID' }))
    .min(1, { message: 'At least one category must be specified' })
    .max(3, { message: 'Maximum 3 categories allowed' })
    .refine((arr) => new Set(arr).size === arr.length, {
      message: 'Duplicate category IDs are not allowed',
    }),
});

export type GenerateReportCommand = z.infer<typeof GenerateReportCommandSchema>;
```

#### Step 1.2: Define Custom Errors

**File**: `src/services/reports.service.ts`

Add error classes to the top of the file:

```typescript
export class WeeklyLimitExceededError extends Error {
  constructor(
    public readonly count: number,
    public readonly limit: number = 3,
    public readonly weekStart: string,
    public readonly weekEnd: string
  ) {
    super(
      `Weekly on-demand report limit exceeded: ${count}/${limit} for week ${weekStart} to ${weekEnd}`
    );
    this.name = 'WeeklyLimitExceededError';
  }
}

export class InvalidCategoriesError extends Error {
  constructor(public readonly invalidIds: string[]) {
    super(`Invalid or unauthorized categories: ${invalidIds.join(', ')}`);
    this.name = 'InvalidCategoriesError';
  }
}

export class DuplicateIdempotencyKeyError extends Error {
  constructor(public readonly idempotencyKey: string) {
    super(`Request with this Idempotency-Key is already being processed`);
    this.name = 'DuplicateIdempotencyKeyError';
  }
}
```

---

### Phase 2: Service Layer Implementation

#### Step 2.1: Add Service Methods

**File**: `src/services/reports.service.ts`

Add methods to `ReportsService` class:

```typescript
/**
 * Generate a new on-demand report for the authenticated user
 *
 * @param userId - UUID of authenticated user
 * @param command - GenerateReportCommand with include_categories
 * @param idempotencyKey - Optional Idempotency-Key for deduplication
 * @returns Generated ReportDto
 * @throws WeeklyLimitExceededError if limit reached
 * @throws InvalidCategoriesError if categories invalid/unauthorized
 * @throws DuplicateIdempotencyKeyError if key already processing
 * @throws Error for unexpected DB/LLM failures
 */
async generateReport(
  userId: UUID,
  command: GenerateReportCommand,
  idempotencyKey?: string
): Promise<ReportDto> {
  // 1. Idempotency check (if key provided)
  if (idempotencyKey) {
    const existing = await this.checkIdempotencyKey(userId, idempotencyKey);
    if (existing) {
      return existing; // Return cached result
    }
  }

  // 2. Validate categories
  const validatedCategories = await this.validateCategories(
    userId,
    command.include_categories
  );

  // 3. Check weekly limit
  await this.checkWeeklyLimit(userId);

  // 4. Fetch notes for report content
  const notes = await this.fetchNotesForReport(
    userId,
    command.include_categories
  );

  // 5. Generate report via LLM
  const generatedContent = await this.generateReportContent(
    notes,
    validatedCategories
  );

  // 6. Insert report into database
  const report = await this.insertReport(
    userId,
    generatedContent,
    validatedCategories
  );

  // 7. Store idempotency key (if provided)
  if (idempotencyKey) {
    await this.storeIdempotencyKey(userId, idempotencyKey, report.id);
  }

  return report;
}

/**
 * Check if Idempotency-Key has been processed recently
 * Returns cached report if key found, null otherwise
 */
private async checkIdempotencyKey(
  userId: UUID,
  idempotencyKey: string
): Promise<ReportDto | null> {
  // Query idempotency_keys table (to be created)
  const { data: keyRecord } = await this.userClient
    .from('idempotency_keys')
    .select('report_id')
    .eq('user_id', userId)
    .eq('key', idempotencyKey)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (!keyRecord) {
    return null; // Key not found or expired
  }

  // Fetch the cached report
  return this.getReportById(userId, keyRecord.report_id);
}

/**
 * Validate all categories exist, are active, and user is authorized
 */
private async validateCategories(
  userId: UUID,
  categoryIds: UUID[]
): Promise<CategoryDto[]> {
  // 1. Fetch categories that exist and are active
  const { data: existingCategories, error: catError } = await this.userClient
    .from('categories')
    .select('*')
    .in('id', categoryIds)
    .eq('active', true);

  if (catError) {
    throw new Error(`Failed to validate categories: ${catError.message}`);
  }

  // 2. Check if all requested categories exist and are active
  const foundIds = new Set((existingCategories || []).map((c) => c.id));
  const notFoundIds = categoryIds.filter((id) => !foundIds.has(id));

  if (notFoundIds.length > 0) {
    throw new InvalidCategoriesError(notFoundIds);
  }

  // 3. Fetch user preferences to verify authorization
  const { data: prefs, error: prefError } = await this.userClient
    .from('preferences')
    .select('active_categories')
    .eq('user_id', userId)
    .single();

  if (prefError) {
    throw new Error(`Failed to fetch preferences: ${prefError.message}`);
  }

  // 4. Verify all categories are in active_categories
  const activeCatSet = new Set(prefs?.active_categories || []);
  const unauthorizedIds = categoryIds.filter((id) => !activeCatSet.has(id));

  if (unauthorizedIds.length > 0) {
    throw new InvalidCategoriesError(unauthorizedIds);
  }

  return existingCategories as CategoryDto[];
}

/**
 * Check if user has already created 3 on-demand reports this week
 * Uses user's timezone to determine week boundaries
 */
private async checkWeeklyLimit(userId: UUID): Promise<void> {
  // 1. Get user's timezone from profile
  const { data: profile, error: profError } = await this.userClient
    .from('profiles')
    .select('timezone')
    .eq('user_id', userId)
    .single();

  if (profError) {
    throw new Error(`Failed to fetch profile: ${profError.message}`);
  }

  // 2. Calculate week start and end in user's timezone
  const { weekStart, weekEnd } = this.calculateWeekBoundaries(profile.timezone);

  // 3. Count on-demand reports this week (includes soft-deleted)
  const { data: countResult, error: countError } = await this.userClient
    .from('reports')
    .select('id', { count: 'exact' })
    .eq('user_id', userId)
    .eq('generated_by', 'on_demand')
    .gte('created_at', weekStart)
    .lte('created_at', weekEnd);

  if (countError) {
    throw new Error(`Failed to count reports: ${countError.message}`);
  }

  const count = countResult?.length || 0;
  if (count >= 3) {
    throw new WeeklyLimitExceededError(count, 3, weekStart, weekEnd);
  }
}

/**
 * Calculate week start and end for user's timezone
 * Week: Monday 00:00:00 to Sunday 23:59:59
 */
private calculateWeekBoundaries(
  timezone: string
): { weekStart: string; weekEnd: string } {
  // Get current date in user's timezone
  const now = new Date();
  const userDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

  // Calculate days since Monday (0 = Monday, 6 = Sunday)
  const dayOfWeek = userDate.getDay();
  const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

  // Calculate Monday of current week
  const monday = new Date(userDate);
  monday.setDate(userDate.getDate() - daysToMonday);
  monday.setHours(0, 0, 0, 0);

  // Calculate Sunday of current week
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  // Return ISO strings
  const weekStart = monday.toISOString().split('T')[0] + 'T00:00:00Z';
  const weekEnd = sunday.toISOString().split('T')[0] + 'T23:59:59Z';

  return { weekStart, weekEnd };
}

/**
 * Fetch notes from included categories for LLM input
 */
private async fetchNotesForReport(
  userId: UUID,
  categoryIds: UUID[]
): Promise<NoteDto[]> {
  const { data, error } = await this.userClient
    .from('notes')
    .select('*')
    .in('category_id', categoryIds)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(100); // Limit to prevent LLM overload

  if (error) {
    throw new Error(`Failed to fetch notes: ${error.message}`);
  }

  return data as NoteDto[];
}

/**
 * Generate report HTML/text via LLM service
 * Placeholder: Replace with actual LLM integration
 */
private async generateReportContent(
  notes: NoteDto[],
  categories: CategoryDto[]
): Promise<{
  html: string;
  text_version: string | null;
  pdf_path: string | null;
  llm_model: string;
  system_prompt_version: string;
}> {
  // TODO: Integrate with LLM service (OpenAI, OpenRouter, etc.)
  // For now, return placeholder
  return {
    html: '<html><body><h1>Weekly Report</h1></body></html>',
    text_version: 'Weekly Report\n...',
    pdf_path: null,
    llm_model: 'gpt-4',
    system_prompt_version: 'v1.0',
  };
}

/**
 * Insert report into database and trigger auto-delivery creation
 */
private async insertReport(
  userId: UUID,
  content: {
    html: string;
    text_version: string | null;
    pdf_path: string | null;
    llm_model: string;
    system_prompt_version: string;
  },
  categories: CategoryDto[]
): Promise<ReportDto> {
  const { data: report, error } = await this.userClient
    .from('reports')
    .insert({
      user_id: userId,
      generated_by: 'on_demand',
      html: content.html,
      text_version: content.text_version,
      pdf_path: content.pdf_path,
      llm_model: content.llm_model,
      system_prompt_version: content.system_prompt_version,
      categories_snapshot: categories,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to insert report: ${error.message}`);
  }

  return report as ReportDto;
}

/**
 * Store Idempotency-Key with 24-hour expiration
 */
private async storeIdempotencyKey(
  userId: UUID,
  idempotencyKey: string,
  reportId: UUID
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);

  const { error } = await this.userClient.from('idempotency_keys').insert({
    user_id: userId,
    key: idempotencyKey,
    report_id: reportId,
    expires_at: expiresAt.toISOString(),
  });

  if (error) {
    // Log but don't fail the request if idempotency storage fails
    console.warn(`Failed to store idempotency key: ${error.message}`);
  }
}
```

---

### Phase 3: Controller Implementation

#### Step 3.1: Add Controller Handler

**File**: `src/controllers/reports.controller.ts`

Add the generate report handler:

```typescript
import { GenerateReportCommandSchema } from '../validation/reports.js';
import { WeeklyLimitExceededError, InvalidCategoriesError } from '../services/reports.service.js';

/**
 * POST /api/reports/generate
 * Generate a new on-demand report for the authenticated user
 *
 * Request Body:
 * - include_categories: UUID[] (1-3 elements, all valid/authorized)
 *
 * Headers:
 * - Idempotency-Key: optional UUID or string for deduplication
 *
 * Success Response:
 * - 201 Created: Full ReportDto with Location header
 *
 * Error Responses:
 * - 400: Validation error (invalid UUIDs, empty array, etc.)
 * - 401: Missing/invalid authentication
 * - 409: Weekly limit exceeded or invalid categories
 * - 500: Server error
 */
export const generateReportHandler = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    // 1. Ensure authenticated
    if (!req.auth) {
      const errorResponse: ErrorResponseDto = {
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      };
      res.status(401).json(errorResponse);
      return;
    }

    // 2. Validate request body
    let validatedBody;
    try {
      validatedBody = GenerateReportCommandSchema.parse(req.body);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const details = Object.fromEntries(
          validationError.errors.map((err) => [err.path.join('.'), err.message])
        );
        const errorResponse: ErrorResponseDto = {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request body validation failed',
            details,
          },
        };
        res.status(400).json(errorResponse);
        return;
      }
      throw validationError;
    }

    const userId = req.auth.userId;
    const jwt = req.auth.jwt;
    const idempotencyKey = req.header('Idempotency-Key');

    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const reportsService = new ReportsService(userClient);

    // 4. Generate report through service
    const generatedReport = await reportsService.generateReport(
      userId,
      validatedBody,
      idempotencyKey
    );

    // 5. Return created report with 201 Created and Location header
    res.status(201).set('Location', `/api/reports/${generatedReport.id}`).json(generatedReport);
  } catch (err) {
    // Handle specific service errors with appropriate HTTP status codes

    if (err instanceof WeeklyLimitExceededError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'WEEKLY_LIMIT_REACHED',
          message: 'Maximum 3 on-demand reports allowed per week',
          details: {
            limit: err.limit,
            count_this_week: err.count,
            week_start: err.weekStart,
            week_end: err.weekEnd,
          },
        },
      };
      res.status(409).json(errorResponse);
      return;
    }

    if (err instanceof InvalidCategoriesError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'INVALID_CATEGORIES',
          message: 'One or more categories are invalid or not authorized',
          details: {
            invalid_ids: err.invalidIds,
          },
        },
      };
      res.status(409).json(errorResponse);
      return;
    }

    // Generic error handling
    console.error('generateReportHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};
```

---

### Phase 4: Route Registration

#### Step 4.1: Add Route to Router

**File**: `src/routes/reports.router.ts`

Add the POST route:

```typescript
import { generateReportHandler } from '../controllers/reports.controller.js';

// ... existing imports and routes ...

/**
 * POST /api/reports/generate
 * Generate a new on-demand report for the authenticated user
 * Requires: Authorization header with Bearer token
 * Optional: Idempotency-Key header for deduplication
 */
router.post('/generate', authMiddleware, (req: Request, res: Response, _next: NextFunction) =>
  generateReportHandler(req, res, _next)
);

export default router;
```

---

### Phase 5: Database Migrations (If Needed)

#### Step 5.1: Create Idempotency Keys Table (Optional)

**Migration SQL**:

```sql
-- Create idempotency_keys table for tracking duplicate requests
CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  report_id UUID NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, key)
);

-- Create index for fast cleanup of expired keys
CREATE INDEX idx_idempotency_keys_expires_at ON idempotency_keys (expires_at);

-- Create policy for RLS
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can only see their own idempotency keys"
  ON idempotency_keys FOR ALL
  USING (auth.uid() = user_id);

-- Background job to clean up expired keys (optional, run via cron)
-- DELETE FROM idempotency_keys WHERE expires_at < now();
```

---

### Phase 6: Testing Strategy

#### Step 6.1: Unit Tests

**File**: `src/controllers/reports.controller.spec.ts`

```typescript
import { generateReportHandler } from '../controllers/reports.controller.js';

describe('generateReportHandler', () => {
  test('returns 401 if not authenticated', async () => {
    const req = { auth: null, body: { include_categories: ['uuid'] } };
    const res = mockResponse();
    await generateReportHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 400 if validation fails', async () => {
    const req = {
      auth: { userId: 'uuid', jwt: 'token' },
      body: { include_categories: [] }, // empty array
    };
    const res = mockResponse();
    await generateReportHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 201 and generated report on success', async () => {
    // Mock service to return report
    const req = {
      auth: { userId: 'uuid', jwt: 'token' },
      body: { include_categories: ['cat-uuid'] },
      header: () => undefined, // no idempotency key
    };
    const res = mockResponse();
    // ... continue test
  });
});
```

#### Step 6.2: Integration Tests

**Test Scenarios**:

1. **Valid Request**: Generate report successfully
2. **Invalid Categories**: Return 409
3. **Weekly Limit Exceeded**: Return 409
4. **Idempotency**: Same key returns same report
5. **Concurrent Requests**: Handle race conditions
6. **Missing Auth**: Return 401
7. **Malformed Body**: Return 400

---

### Phase 7: Integration with Main Express App

#### Step 7.1: Verify Route Registration

**File**: `src/index.ts`

Ensure reports router is registered:

```typescript
import reportsRouter from './routes/reports.router.js';

// ... other route registrations ...
app.use('/api/reports', reportsRouter);
```

---

### Phase 8: Documentation & Deployment

#### Step 8.1: Update API Documentation

- Add endpoint to OpenAPI/Swagger (if using)
- Document Idempotency-Key header behavior
- Provide example cURL requests

#### Step 8.2: Update Deployment Checklist

- Ensure LLM service credentials are in production environment
- Verify database migrations ran successfully
- Test rate limiting on production
- Monitor error rates and LLM latency

---

## Summary of Changes by File

| File                                    | Changes                                                          |
| --------------------------------------- | ---------------------------------------------------------------- |
| `src/validation/reports.ts`             | Add `GenerateReportCommandSchema` and type                       |
| `src/services/reports.service.ts`       | Add custom error classes and `generateReport()` + helper methods |
| `src/controllers/reports.controller.ts` | Add `generateReportHandler`                                      |
| `src/routes/reports.router.ts`          | Add POST `/generate` route                                       |
| `src/index.ts`                          | Verify reports router is registered                              |
| Database migrations                     | Create `idempotency_keys` table (optional)                       |

---

## Related Endpoints

- **GET /api/reports**: List user's reports
- **GET /api/reports/{id}**: Fetch specific report
- **DELETE /api/reports/{id}**: Soft-delete report
- **GET /api/categories**: List categories for validation
- **GET /api/preferences**: Fetch user preferences for authorization

---

## References

- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
- [Zod Validation](https://zod.dev/)
- [Idempotency Best Practices](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [RFC 7231 HTTP Semantics](https://tools.ietf.org/html/rfc7231#section-6.3.2)
