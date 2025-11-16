# API Endpoint Implementation Plan: Notes (GET & POST)

## 1. Endpoint Overview

### Purpose

The Notes API provides endpoints for users to list, filter, and create personal notes organized by category. The implementation enforces business rules such as active category validation and daily per-category note limits.

### Endpoints Covered

- **GET `/api/notes`**: Retrieve paginated list of user notes with optional filtering
- **POST `/api/notes`**: Create a new note with validation and business rule enforcement

---

## 2. Request Details

### GET `/api/notes`

**HTTP Method**: GET

**URL Structure**: `/api/notes`

**Query Parameters**:

| Parameter         | Type                                 | Required | Default           | Constraints                                            | Description                            |
| ----------------- | ------------------------------------ | -------- | ----------------- | ------------------------------------------------------ | -------------------------------------- |
| `category_id`     | UUID (repeatable or comma-separated) | No       | —                 | Valid UUID format                                      | Filter notes by one or more categories |
| `from`            | ISO 8601 datetime                    | No       | —                 | Valid ISO 8601 format                                  | Start of date range (inclusive)        |
| `to`              | ISO 8601 datetime                    | No       | —                 | Valid ISO 8601 format; `to >= from`                    | End of date range (inclusive)          |
| `include_deleted` | Boolean                              | No       | false             | true/false                                             | Include soft-deleted notes in results  |
| `limit`           | Integer                              | No       | 20                | 1–100                                                  | Maximum number of items per page       |
| `offset`          | Integer                              | No       | 0                 | ≥0                                                     | Number of items to skip (pagination)   |
| `sort`            | Enum                                 | No       | `created_at_desc` | `created_at_desc`, `created_at_asc`, `updated_at_desc` | Sort order for results                 |

**Request Body**: None

---

### POST `/api/notes`

**HTTP Method**: POST

**URL Structure**: `/api/notes`

**Content-Type**: `application/json`

**Request Body**:

```json
{
  "category_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "My Note Title",
  "content": "This is the note content"
}
```

| Field         | Type           | Required | Constraints                                                     | Description               |
| ------------- | -------------- | -------- | --------------------------------------------------------------- | ------------------------- |
| `category_id` | UUID           | Yes      | Valid UUID format, must exist and be active in user preferences | The category for the note |
| `title`       | String or null | No       | If provided, max 255 characters                                 | Optional note title       |
| `content`     | String         | Yes      | Non-empty, max 1000 characters                                  | Required note content     |

---

## 3. Used Types

### Type Definitions (from `src/types.ts`)

```typescript
// Query parameters
export type ListNotesQuery = {
  category_id?: UUID | UUID[];
  from?: string; // ISO datetime
  to?: string; // ISO datetime
  include_deleted?: boolean; // default false
  limit?: number; // default 20, max 100
  offset?: number; // default 0
  sort?: NotesSort; // default 'created_at_desc'
};

// Note Data Transfer Object
export type NoteDto = Tables<'notes'>;
// Structure:
// {
//   id: UUID;
//   user_id: UUID;
//   category_id: UUID;
//   title: string | null;
//   content: string;
//   created_at: string; // ISO datetime
//   updated_at: string; // ISO datetime
//   deleted_at: string | null;
// }

// Response wrapper for GET
export type ListNotesResponseDto = PaginatedResponse<NoteDto>;
// Structure:
// {
//   items: NoteDto[];
//   total: number;
//   limit: number;
//   offset: number;
// }

// Command for creating a note
export type CreateNoteCommand = Pick<TablesInsert<'notes'>, 'category_id' | 'title' | 'content'>;
```

### Supporting Types

```typescript
export type NotesSort = 'created_at_desc' | 'created_at_asc' | 'updated_at_desc';

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type UUID = string;
```

---

## 4. Response Details

### GET `/api/notes` — Success Response (200 OK)

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "550e8400-e29b-41d4-a716-446655440001",
      "category_id": "550e8400-e29b-41d4-a716-446655440002",
      "title": "Morning Reflection",
      "content": "Today was productive. I completed three major tasks.",
      "created_at": "2025-01-15T09:30:00Z",
      "updated_at": "2025-01-15T09:30:00Z",
      "deleted_at": null
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440003",
      "user_id": "550e8400-e29b-41d4-a716-446655440001",
      "category_id": "550e8400-e29b-41d4-a716-446655440002",
      "title": null,
      "content": "Quick note without a title.",
      "created_at": "2025-01-14T15:45:00Z",
      "updated_at": "2025-01-14T15:45:00Z",
      "deleted_at": null
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

**Status Code**: 200 OK

---

### POST `/api/notes` — Success Response (201 Created)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "550e8400-e29b-41d4-a716-446655440001",
  "category_id": "550e8400-e29b-41d4-a716-446655440002",
  "title": "New Note",
  "content": "This is my new note content.",
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T10:00:00Z",
  "deleted_at": null
}
```

**Status Code**: 201 Created

**Location Header**: Optional `Location: /api/notes/550e8400-e29b-41d4-a716-446655440000`

---

### Error Responses

#### 400 Bad Request

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": {
      "category_id": "Invalid UUID format",
      "limit": "Must be between 1 and 100"
    }
  }
}
```

**Trigger**: Invalid UUID format, limit out of range, invalid enum value for sort, invalid ISO datetime format.

---

#### 401 Unauthorized

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required or token expired"
  }
}
```

**Trigger**: Missing or invalid JWT token; failed authentication middleware check.

---

#### 403 Forbidden

```json
{
  "error": {
    "code": "CATEGORY_NOT_ACTIVE",
    "message": "The specified category is not active in your preferences"
  }
}
```

**Trigger**: POST request with a category_id that exists but is not in the user's active_categories list in preferences.

---

#### 409 Conflict

```json
{
  "error": {
    "code": "DAILY_LIMIT_REACHED",
    "message": "Daily note limit reached for this category",
    "details": {
      "category_id": "550e8400-e29b-41d4-a716-446655440002",
      "limit": 10,
      "count_today": 10
    }
  }
}
```

**Trigger**: POST request exceeds the daily per-category limit defined in user preferences (`max_daily_notes`).

---

#### 422 Unprocessable Entity

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "content": "Content must not be empty and must not exceed 1000 characters"
    }
  }
}
```

**Trigger**: Semantic validation errors (e.g., content exceeds 1000 chars, title exceeds 255 chars, category doesn't exist).

---

#### 500 Internal Server Error

```json
{
  "error": {
    "code": "INTERNAL_SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

**Trigger**: Unhandled database errors, service failures.

---

## 5. Data Flow

### GET `/api/notes` Flow

```
Request (GET /api/notes?category_id=...&limit=20&offset=0)
  ↓
AuthMiddleware (validates JWT token, extracts user_id)
  ↓
Route Handler (notes.router.ts)
  ↓
Validation (notes.ts validation schema)
  - Parse query parameters
  - Validate UUID format, date format, pagination bounds, sort enum
  ↓
Controller (notes.controller.ts)
  - Normalize category_id array (handle repeatable, comma-separated)
  - Normalize sort parameter
  ↓
Service Layer (notes.service.ts)
  - Query notes table:
    WHERE user_id = :userId
    AND (category_id IN :categoryIds OR :categoryIds is empty)
    AND (:from is null OR created_at >= :from)
    AND (:to is null OR created_at <= :to)
    AND (deleted_at IS NULL OR :includeDeleted = true)
    ORDER BY :sort
    LIMIT :limit OFFSET :offset
  - Count total matching records (for pagination)
  ↓
Supabase Client
  - Execute parameterized query
  ↓
Format Response (ListNotesResponseDto)
  ↓
Response (200 OK with paginated NoteDto[])
```

### POST `/api/notes` Flow

```
Request (POST /api/notes with body: { category_id, title, content })
  ↓
AuthMiddleware (validates JWT token, extracts user_id)
  ↓
Route Handler (notes.router.ts)
  ↓
Validation (notes.ts validation schema)
  - Validate category_id UUID format
  - Validate content (non-empty, ≤1000 chars)
  - Validate title if provided (≤255 chars)
  ↓
Controller (notes.controller.ts)
  ↓
Service Layer (notes.service.ts)
  - Step 1: Verify category exists
    SELECT id FROM categories WHERE id = :categoryId

  - Step 2: Verify category is active in user preferences
    SELECT active_categories FROM preferences WHERE user_id = :userId
    Check if :categoryId is in active_categories array

  - Step 3: Check daily limit for this category
    SELECT COUNT(*) FROM notes
    WHERE user_id = :userId
    AND category_id = :categoryId
    AND DATE(created_at AT TIME ZONE user.timezone) = TODAY
    AND deleted_at IS NULL
    Compare count to preferences.max_daily_notes

  - Step 4: Create note (if all validations pass)
    INSERT INTO notes (user_id, category_id, title, content)
    VALUES (:userId, :categoryId, :title, :content)
    ↓
    Handle errors:
    - Category not found → 422 VALIDATION_ERROR
    - Category not active → 403 CATEGORY_NOT_ACTIVE
    - Daily limit exceeded → 409 DAILY_LIMIT_REACHED
    - Database constraint violation → 500 INTERNAL_SERVER_ERROR
    ↓
Supabase Client
  - Execute transaction (validate + insert)
  ↓
Format Response (NoteDto)
  ↓
Response (201 Created with full NoteDto)
```

---

## 6. Security Considerations

### Authentication & Authorization

1. **Authentication Requirement**: All endpoints require valid JWT token in Authorization header
   - Enforced by `AuthMiddleware` (checks token validity, extracts user_id)
   - Status 401 returned if token missing or invalid

2. **User Isolation**: All queries scoped to authenticated user's `user_id`
   - GET: `WHERE user_id = :userId`
   - POST: Injected automatically by service layer

3. **Soft Delete Visibility**: Deleted notes hidden by default
   - Only visible if `include_deleted=true` AND user explicitly requests
   - Prevents accidental exposure of deleted data

### Input Validation & Injection Prevention

1. **Parameterized Queries**: All database operations use parameterized queries via Supabase client
   - Prevents SQL injection attacks

2. **Type Validation**:
   - UUIDs: Validated against RFC 4122 format
   - Dates: Validated as ISO 8601 datetime
   - Enums: Restricted to predefined set (sort values)

3. **Length & Range Validation**:
   - Content: Max 1000 characters (enforced at validation and database constraint)
   - Title: Max 255 characters (suggested, enforced at validation)
   - Limit: 1–100 (prevents resource exhaustion)
   - Offset: ≥0 (prevents negative pagination)

### Business Logic Security

1. **Category Active Status**: POST enforces that only categories marked active in user's preferences can receive new notes
   - Prevents users from creating notes in inactive categories
   - Filters out unauthorized category access

2. **Daily Limit Enforcement**: Prevents spam/abuse via per-category daily limits
   - Limit retrieved from `preferences.max_daily_notes`
   - Checked per calendar day in user's timezone

### Rate Limiting

- Apply per-user rate limiting to POST endpoint (e.g., 50 requests per minute per user)
- Suggested implementation: Redis-backed rate limiter middleware
- Prevents abuse and DoS attacks

### Data Exposure

1. **Sensitive Fields**: Note content may contain PII
   - Ensure HTTPS-only transmission
   - Enforce proper logging policies (don't log full content in analytics)

2. **Response Filtering**: Only return fields defined in NoteDto
   - Never expose internal fields or raw database schema

---

## 7. Error Handling

### Validation Errors (400, 422)

**Layer**: Validation schema (validation/notes.ts)

**Errors to Catch**:

- Invalid UUID format in `category_id`
- Invalid ISO 8601 datetime in `from` or `to`
- Limit out of range (not 1–100)
- Offset negative
- Invalid sort enum value
- Content empty or exceeds 1000 characters
- Title exceeds 255 characters (if provided)

**Response**: 400 Bad Request with `details` object listing each field error

---

### Business Logic Errors (403, 409, 422)

**Layer**: Service layer (notes.service.ts)

| Error                | HTTP Status | Code                | Description                            | User Message                                               |
| -------------------- | ----------- | ------------------- | -------------------------------------- | ---------------------------------------------------------- |
| Category not found   | 422         | CATEGORY_NOT_FOUND  | Category ID doesn't exist              | "The specified category does not exist"                    |
| Category not active  | 403         | CATEGORY_NOT_ACTIVE | Category not in user's active list     | "The specified category is not active in your preferences" |
| Daily limit exceeded | 409         | DAILY_LIMIT_REACHED | Too many notes for this category today | "Daily note limit reached for this category"               |

**Logging**: Log each business logic error to `analytics_events` table with:

- `event_name`: `note_creation_failed`
- `event_type`: `error`
- `metadata`: `{ reason: "category_not_active" | "daily_limit_reached" | ... }`

---

### Database Errors (500)

**Layer**: Service layer exception handling

**Errors to Catch**:

- Supabase connection failure
- Query timeout
- Constraint violation (e.g., FK constraint on category_id or user_id)
- Concurrency issues (e.g., unique constraint on generated UUID)

**Handling**:

1. Log full error to application logs (ERROR level)
2. Log error event to `analytics_events`
3. Return generic 500 response (never expose raw error details)

---

### Error Logging Strategy

All errors should be logged to `analytics_events` table:

```typescript
// Example
await analyticsService.recordEvent({
  event_name: 'note_creation_failed',
  event_type: 'error',
  metadata: {
    reason: 'daily_limit_reached',
    category_id: categoryId,
    user_count_today: 10,
    limit: 10,
  },
});
```

---

## 8. Performance Considerations

### Query Optimization (GET)

1. **Database Indexes**:
   - `notes (user_id, deleted_at, created_at)` — supports filtering and sorting
   - `notes (user_id, category_id, created_at)` — supports category + date filtering
   - Ensure Supabase indexes are configured

2. **Pagination**: Always paginate with default limit 20
   - Prevents full-table scans
   - Clients should implement "load more" pattern

3. **Count Query**: Calculate total count efficiently
   - Use `SELECT COUNT(*) OVER()` window function to avoid separate query
   - Or use fast approximate count if available in Supabase

4. **Date Range Filtering**:
   - `from` and `to` should use indexed columns (`created_at`)
   - Prefer `DATE(created_at)` only if timezone conversion needed

### Concurrency & Creation (POST)

1. **Atomic Validation**: Category active status + daily limit check + insert should be atomic
   - Use database transaction to prevent race conditions
   - Check-then-act pattern within a single transaction

2. **Idempotency**: POST is not idempotent
   - Each request creates a new note
   - No deduplication mechanism (client-side responsible for preventing duplicates)

### Caching Strategy

1. **Cache User Preferences**: Cache active_categories and max_daily_notes for 5 minutes
   - Reduces prefences.service calls
   - Invalidate cache on preferences update

2. **Do NOT Cache** notes list (GET)
   - Data is user-specific and frequently modified
   - Caching complexity outweighs benefits

### Rate Limiting

- **POST /api/notes**: 50 requests per minute per user (adjustable)
- **GET /api/notes**: 200 requests per minute per user (more permissive for reads)
- Implement via middleware (e.g., rateLimit.middleware.ts)

---

## 9. Implementation Steps

### Phase 1: Validation Schema

**File**: `src/validation/notes.ts`

1. Create validation schema for `ListNotesQuery`
   - Validate category_id: optional, UUID array format
   - Validate from/to: optional, ISO datetime format, to >= from
   - Validate include_deleted: optional, boolean
   - Validate limit: optional, integer 1–100, default 20
   - Validate offset: optional, integer ≥0, default 0
   - Validate sort: optional, enum (created_at_desc | created_at_asc | updated_at_desc), default created_at_desc

2. Create validation schema for `CreateNoteCommand`
   - Validate category_id: required, UUID format
   - Validate title: optional, string max 255 chars
   - Validate content: required, non-empty string max 1000 chars

3. Export validation functions for use in controllers

**Implementation Approach**: Use existing validation pattern (e.g., Joi, Zod, or custom schema)

---

### Phase 2: Service Layer

**File**: `src/services/notes.service.ts`

**Exports**:

```typescript
export class NotesService {
  // Constructor injects Supabase client, preferences service, categories service

  /**
   * Retrieves paginated list of notes for authenticated user
   */
  async listNotes(userId: UUID, query: ListNotesQuery): Promise<ListNotesResponseDto>;

  /**
   * Creates a new note with validation
   * - Verifies category exists
   * - Verifies category is active in user preferences
   * - Checks daily per-category limit
   */
  async createNote(userId: UUID, command: CreateNoteCommand): Promise<NoteDto>;

  /**
   * Helper: Check if category is active in user preferences
   */
  private async isCategoryActive(userId: UUID, categoryId: UUID): Promise<boolean>;

  /**
   * Helper: Count today's notes for category in user's timezone
   */
  private async countNotesTodayForCategory(
    userId: UUID,
    categoryId: UUID,
    timezone: string
  ): Promise<number>;

  /**
   * Helper: Get user's timezone from profile
   */
  private async getUserTimezone(userId: UUID): Promise<string>;
}
```

**Implementation Details**:

- `listNotes()`:
  - Normalize category_id array (handle repeatable params)
  - Build WHERE clause with optional filters
  - Execute COUNT query for pagination
  - Execute SELECT query with LIMIT/OFFSET and ORDER BY
  - Return ListNotesResponseDto

- `createNote()`:
  1. Verify category exists (query categories table)
  2. Verify category active (call preferences.service or check cache)
  3. Verify daily limit not exceeded (count today's notes, compare to preferences.max_daily_notes)
  4. If all pass, INSERT into notes table
  5. Return created NoteDto or throw specific error

---

### Phase 3: Controller

**File**: `src/controllers/notes.controller.ts`

**Exports**:

```typescript
export class NotesController {
  // Constructor injects NotesService

  /**
   * GET /api/notes handler
   */
  async listNotes(req: Request, res: Response, next: NextFunction): Promise<void>;

  /**
   * POST /api/notes handler
   */
  async createNote(req: Request, res: Response, next: NextFunction): Promise<void>;
}
```

**Implementation Details**:

- `listNotes()`:
  1. Extract user_id from req.user (set by AuthMiddleware)
  2. Extract and validate query parameters using validation schema
  3. Call notesService.listNotes(userId, query)
  4. Return 200 with ListNotesResponseDto
  5. Catch validation errors → 400
  6. Catch service errors → 500 (generic)

- `createNote()`:
  1. Extract user_id from req.user (set by AuthMiddleware)
  2. Extract and validate request body using validation schema
  3. Create CreateNoteCommand from validated body
  4. Call notesService.createNote(userId, command)
  5. Return 201 with NoteDto
  6. Catch validation errors → 400/422
  7. Catch specific service errors:
     - CATEGORY_NOT_ACTIVE → 403
     - DAILY_LIMIT_REACHED → 409
     - CATEGORY_NOT_FOUND → 422
     - Database errors → 500

---

### Phase 4: Routes

**File**: `src/routes/notes.router.ts`

**Implementation**:

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { NotesController } from '../controllers/notes.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();
const controller = new NotesController();

// Protect all routes with auth middleware
router.use(authMiddleware);

// GET /api/notes
router.get('/', (req: Request, res: Response, next: NextFunction) =>
  controller.listNotes(req, res, next)
);

// POST /api/notes
router.post('/', (req: Request, res: Response, next: NextFunction) =>
  controller.createNote(req, res, next)
);

export default router;
```

---

### Phase 5: Route Registration

**File**: `src/index.ts`

1. Import notesRouter
2. Register route: `app.use('/api/notes', notesRouter)`
3. Ensure placement after auth middleware and before error handlers

---

### Phase 6: Testing & Validation

1. **Unit Tests** (for notesService):
   - Test listNotes with various filter combinations
   - Test listNotes pagination and sorting
   - Test createNote with valid inputs
   - Test createNote validation failures (invalid category, daily limit, etc.)

2. **Integration Tests** (for full flow):
   - Test GET with authentication
   - Test GET with various query combinations
   - Test POST with authentication
   - Test POST with missing category in preferences
   - Test POST with daily limit exceeded

3. **Manual Testing** (using curl or Postman):
   - See CURL_QUICK_REFERENCE_NOTES.md (to be created)

---

## 10. File Checklist

- [ ] `src/validation/notes.ts` — Validation schemas
- [ ] `src/services/notes.service.ts` — Business logic
- [ ] `src/controllers/notes.controller.ts` — Request handlers
- [ ] `src/routes/notes.router.ts` — Route definitions
- [ ] `src/index.ts` — Register routes
- [ ] Tests for service layer
- [ ] Tests for controller layer
- [ ] CURL examples documentation

---

## 11. Dependencies & Assumptions

### External Dependencies

- `Supabase` client (for database queries)
- `PreferencesService` (to check active categories and max_daily_notes)
- `CategoriesService` (to verify category exists)
- `AuthMiddleware` (to extract user_id from JWT)

### Assumptions

1. Supabase client is pre-configured and available
2. User timezone is stored in `profiles.timezone` (required for daily limit calculation)
3. `PreferencesService` is already implemented
4. User preferences always exist (no null checks on preferences table)
5. Date range filtering uses `created_at` field (assumes consistent server/DB timezone)
