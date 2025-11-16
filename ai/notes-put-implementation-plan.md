# API Endpoint Implementation Plan: PUT /api/notes/{id}

## 1. Endpoint Overview

**Purpose**: Update an existing note's title, content, and/or category for the authenticated user. This endpoint enforces the active category constraint by re-validating that the assigned category is in the user's active categories list from their preferences.

**Key Responsibilities**:

- Validate the note ID path parameter (UUID format)
- Validate request body (category_id, title, content)
- Verify note exists and user owns it (RLS + explicit check)
- Verify category exists in database
- Verify category is in user's active_categories (re-check constraint)
- Update the note in database
- Return the complete updated note object
- Enforce authorization (user can only update their own notes)

---

## 2. Request Details

### HTTP Method

- **PUT** `/api/notes/{id}`

### URL Structure

```
PUT /api/notes/{id}
Host: {API_BASE_URL}
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

### Request Headers

- **Authorization**: `Bearer {jwt_token}` (required, validated by auth middleware)
- **Content-Type**: `application/json` (required)

### Path Parameters

| Parameter | Type | Constraints          | Description              |
| --------- | ---- | -------------------- | ------------------------ |
| `id`      | UUID | Valid UUID v4 format | ID of the note to update |

### Request Body

**Type**: `UpdateNoteCommand` (from types.ts)

```json
{
  "category_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Updated Title",
  "content": "Updated content here..."
}
```

### Body Parameters

**All parameters are required** at the API boundary:

| Parameter     | Type           | Constraints                | Description                             |
| ------------- | -------------- | -------------------------- | --------------------------------------- |
| `category_id` | UUID (string)  | Valid UUID, must exist     | UUID of the category for this note      |
| `title`       | string \| null | Max 255 characters         | Display name for the note (can be null) |
| `content`     | string         | Min 1, Max 1000 characters | Note body content                       |

### Notes on Parameters

- All three fields must be provided in the request body
- `title` can be `null` but the field must be present
- `content` cannot be empty or null
- `category_id` must be a valid UUID format and must exist in the database
- The category must be in the user's active_categories list (enforced after validation)

---

## 3. Used Types

### Validation Schemas

**File**: `src/validation/notes.ts`

```typescript
// Add to existing file:
export const UpdateNoteParamSchema = z.object({
  id: z.string({ required_error: 'Note ID is required' }).uuid('Note ID must be a valid UUID'),
});

export type UpdateNoteParam = z.infer<typeof UpdateNoteParamSchema>;

export const UpdateNoteCommandSchema = z.object({
  category_id: z
    .string({ required_error: 'category_id is required' })
    .uuid('category_id must be a valid UUID'),

  title: z
    .string()
    .max(255, { message: 'title must not exceed 255 characters' })
    .nullable()
    .optional()
    .default(null)
    .refine((val) => val === null || (typeof val === 'string' && val.length <= 255), {
      message: 'title must be null or a string with max 255 characters',
    }),

  content: z
    .string({ required_error: 'content is required' })
    .min(1, { message: 'content must not be empty' })
    .max(1000, { message: 'content must not exceed 1000 characters' }),
});

export type UpdateNoteCommand = z.infer<typeof UpdateNoteCommandSchema>;
```

### DTO Types

**From types.ts** (already defined):

```typescript
export type NoteDto = Tables<'notes'>; // Full note object

export type UpdateNoteCommand = Pick<TablesUpdate<'notes'>, 'category_id' | 'title' | 'content'>;
```

### Service Layer Types

**From services/notes.service.ts** (existing error classes):

```typescript
export class CategoryNotActiveError extends Error {
  constructor(public categoryId: UUID) { ... }
}

export class CategoryNotFoundError extends Error {
  constructor(public categoryId: UUID) { ... }
}

export class NoteNotFoundError extends Error {
  constructor(public noteId: UUID) { ... }
}
```

**New error class** (add to services/notes.service.ts):

```typescript
export class NoteNotOwnedError extends Error {
  constructor(public noteId: UUID) {
    super(`Note ${noteId} is not owned by this user`);
    this.name = 'NoteNotOwnedError';
  }
}
```

---

## 4. Response Details

### Success Response

**Status Code**: `200 OK`

**Response Body**: Full `NoteDto` object

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "650e8400-e29b-41d4-a716-446655440001",
  "category_id": "750e8400-e29b-41d4-a716-446655440002",
  "title": "Updated Title",
  "content": "Updated content here...",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T14:30:00Z",
  "deleted_at": null
}
```

### Error Responses

#### 400 Bad Request - Invalid UUID Format

**When**: Note ID in path is not a valid UUID

**Response**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid note ID format",
    "details": {
      "id": "Note ID must be a valid UUID"
    }
  }
}
```

#### 400 Bad Request - Invalid Request Body Structure

**When**: Request body has structural issues (missing fields, wrong types)

**Response**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body validation failed",
    "details": {
      "category_id": "category_id must be a valid UUID",
      "content": "content must not be empty"
    }
  }
}
```

#### 401 Unauthorized - Missing/Invalid Authentication

**When**: JWT token is missing or invalid

**Response**:

```json
{
  "error": {
    "code": "JWT_INVALID",
    "message": "Invalid credentials"
  }
}
```

#### 403 Forbidden - Category Not Active

**When**: Category exists but is not in user's active_categories list

**Response**:

```json
{
  "error": {
    "code": "CATEGORY_NOT_ACTIVE",
    "message": "The specified category is not active in your preferences"
  }
}
```

#### 404 Not Found - Note Not Found

**When**: Note doesn't exist, is deleted, or user doesn't own it

**Response**:

```json
{
  "error": {
    "code": "NOTE_NOT_FOUND",
    "message": "Note not found"
  }
}
```

#### 422 Unprocessable Entity - Category Not Found

**When**: category_id references a category that doesn't exist

**Response**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "category_id": "The specified category does not exist"
    }
  }
}
```

#### 422 Unprocessable Entity - Content Constraint Violation

**When**: Content exceeds 1000 characters or other constraint violation

**Response**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body validation failed",
    "details": {
      "content": "content must not exceed 1000 characters"
    }
  }
}
```

#### 500 Internal Server Error

**When**: Unexpected database or server error

**Response**:

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

---

## 5. Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. CLIENT REQUEST                                                           │
│    PUT /api/notes/{id}                                                      │
│    Authorization: Bearer {JWT}                                              │
│    Content-Type: application/json                                           │
│    Body: { category_id, title, content }                                    │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. AUTH MIDDLEWARE                                                          │
│    • Validate JWT token                                                     │
│    • Extract userId from JWT                                               │
│    • Create user context (req.auth)                                         │
│    • Return 401 if JWT invalid                                              │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. CONTROLLER HANDLER (updateNoteHandler)                                   │
│    • Validate path parameter (id) with UpdateNoteParamSchema                │
│    • Return 400 if path param invalid                                       │
│    • Validate request body with UpdateNoteCommandSchema                     │
│    • Return 400/422 if body validation fails                                │
│    • Extract userId and JWT from req.auth                                   │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. SERVICE LAYER (NotesService.updateNote)                                  │
│    a) Verify note exists and user owns it                                   │
│       • Query: SELECT id, user_id FROM notes WHERE id=? AND deleted_at=null │
│       • Return 404 if not found                                             │
│       • Return 403 if user doesn't own it                                   │
│                                                                             │
│    b) Verify category exists                                                │
│       • Query: SELECT id FROM categories WHERE id=?                         │
│       • Return 422 if not found (CategoryNotFoundError)                     │
│                                                                             │
│    c) Fetch user's active_categories from preferences                       │
│       • Query: SELECT active_categories FROM preferences WHERE user_id=?    │
│       • Return 404 if preferences not found (shouldn't happen)              │
│                                                                             │
│    d) Verify category is in active_categories                               │
│       • Check if category_id in active_categories array                    │
│       • Return 403 if not (CategoryNotActiveError)                          │
│                                                                             │
│    e) Update the note                                                       │
│       • Query: UPDATE notes SET category_id=?, title=?, content=?,          │
│         updated_at=now() WHERE id=? AND user_id=?                          │
│       • Return updated NoteDto                                              │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. ERROR HANDLING IN CONTROLLER                                             │
│    Catch service errors and map to HTTP status codes:                       │
│    • CategoryNotFoundError → 422 VALIDATION_ERROR                           │
│    • CategoryNotActiveError → 403 CATEGORY_NOT_ACTIVE                       │
│    • NoteNotFoundError → 404 NOTE_NOT_FOUND                                 │
│    • Generic Error → 500 SERVER_ERROR                                       │
└──────────────────────────┬──────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. RESPONSE TO CLIENT                                                       │
│    200 OK + NoteDto                                                         │
│    OR                                                                        │
│    4xx/5xx + ErrorResponseDto                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Database Interactions Summary

1. **User-Scoped Supabase Client** uses user JWT for all queries (RLS enforcement)
2. **Query 1**: Fetch note by ID to verify ownership
3. **Query 2**: Verify category exists
4. **Query 3**: Fetch user preferences to check active_categories
5. **Query 4**: Update note with new values

---

## 6. Security Considerations

### Authentication

- **Mechanism**: JWT Bearer token in Authorization header
- **Validation**: auth.middleware validates token and extracts userId
- **Enforcement**: User can only update their own notes via RLS
- **Response**: 401 Unauthorized if token missing or invalid

### Authorization

- **Ownership Check**: Note must belong to authenticated user
  - Enforced by RLS (user-scoped Supabase client)
  - Explicit verification in service layer
  - Returns 404 if user doesn't own note (not 403, to avoid leaking existence)

### Category Validation

- **Active Category Re-Check**: Category must be in user's active_categories list
  - This prevents users from bypassing preference constraints
  - Returns 403 CATEGORY_NOT_ACTIVE if not in active list
  - Database ensures category actually exists before this check

### Input Validation

- **UUID Format**: Path parameter and category_id validated as UUID v4
- **Content Length**: Content max 1000 chars (DB constraint enforced)
- **Title Length**: Title max 255 chars (optional, can be null)
- **Zod Schemas**: Strict mode to reject unknown fields
- **Type Safety**: TypeScript ensures correct types throughout

### Data Protection

- **Soft Delete**: Cannot update deleted notes (deleted_at check)
- **Immutable Fields**: user_id, created_at are not updatable
- **Updated Timestamp**: Automatically set to now() by service layer
- **No Data Exposure**: 404 responses don't reveal if note exists

### SQL Injection Prevention

- **Parameterization**: Supabase client handles all SQL parameter escaping
- **No String Interpolation**: Never concatenate user input into queries

---

## 7. Error Handling

### Error Hierarchy

```
Error
├── ZodError (validation framework)
│   ├── Invalid path parameter format
│   └── Invalid request body structure
├── CategoryNotFoundError (service)
│   └── 422 VALIDATION_ERROR response
├── CategoryNotActiveError (service)
│   └── 403 CATEGORY_NOT_ACTIVE response
├── NoteNotFoundError (service)
│   └── 404 NOTE_NOT_FOUND response
└── Generic Error
    └── 500 SERVER_ERROR response
```

### Specific Error Scenarios

| Scenario                    | Error Class            | HTTP Status | Error Code          |
| --------------------------- | ---------------------- | ----------- | ------------------- |
| Invalid UUID in path        | ZodError               | 400         | VALIDATION_ERROR    |
| Invalid category_id format  | ZodError               | 400         | VALIDATION_ERROR    |
| Missing category_id         | ZodError               | 400         | VALIDATION_ERROR    |
| Content too long            | ZodError               | 422         | VALIDATION_ERROR    |
| No Bearer token             | (from auth middleware) | 401         | JWT_INVALID         |
| Invalid JWT                 | (from auth middleware) | 401         | JWT_INVALID         |
| Category doesn't exist      | CategoryNotFoundError  | 422         | VALIDATION_ERROR    |
| Category not in active list | CategoryNotActiveError | 403         | CATEGORY_NOT_ACTIVE |
| Note not found              | NoteNotFoundError      | 404         | NOTE_NOT_FOUND      |
| User doesn't own note       | NoteNotFoundError      | 404         | NOTE_NOT_FOUND      |
| Note is soft-deleted        | NoteNotFoundError      | 404         | NOTE_NOT_FOUND      |
| Database connection error   | Generic Error          | 500         | SERVER_ERROR        |
| Unknown server error        | Generic Error          | 500         | SERVER_ERROR        |

### Error Logging

- **Info Level**: Log successful updates (optional)
- **Error Level**: Log all error scenarios for debugging
- **Format**: Use `console.error('updateNoteHandler error:', err)` pattern
- **No Stack Traces**: Never send error stack traces to client

---

## 8. Performance Considerations

### Database Queries

**Query Count**: 4-5 queries per request (optimized)

1. **Note Lookup**: `SELECT id, user_id FROM notes WHERE id=? AND deleted_at IS NULL` (indexed on id, deleted_at)
2. **Category Exists**: `SELECT id FROM categories WHERE id=?` (indexed on id)
3. **User Preferences**: `SELECT active_categories FROM preferences WHERE user_id=?` (indexed on user_id, PK)
4. **Note Update**: `UPDATE notes SET ... WHERE id=?` (single row)

### Optimization Strategies

- **Index Usage**: Queries use PK/FK indexes for fast lookups
- **Minimal Columns**: SELECT only required columns (id, user_id, active_categories)
- **Single Update**: One UPDATE query (not separate deletes/inserts)
- **RLS Enforcement**: Let Supabase handle authorization at DB level
- **User-Scoped Client**: Reduces query burden (no additional user_id filter needed)

### Caching Considerations

- **No Caching**: Each request queries current state (data freshness)
- **Preferences Cache**: Could be cached if performance becomes issue
- **Categories Cache**: Could be cached (rarely change)
- **Current**: Direct queries sufficient for MVP

### Potential Bottlenecks

1. **Large active_categories Array**: Array membership check is O(n), but max 3 items
2. **User Preferences Lookup**: Should be fast (PK lookup)
3. **Category Validation**: Single row lookup (indexed)

---

## 9. Implementation Steps

### Step 1: Create Zod Schemas for Request Validation

**File**: `src/validation/notes.ts`

**Actions**:

- Add `UpdateNoteParamSchema` for path parameter validation
- Add `UpdateNoteCommandSchema` for request body validation
- Export `UpdateNoteParam` and `UpdateNoteCommand` types
- Ensure all constraints match DB schema (max 1000 chars for content, max 255 for title)

**Validation Rules**:

- Path `id`: Required UUID
- Body `category_id`: Required UUID
- Body `title`: Optional string (max 255) or null
- Body `content`: Required non-empty string (1-1000 chars)

---

### Step 2: Create Service Method for Note Updates

**File**: `src/services/notes.service.ts`

**New Error Class**:

- Add `NoteNotOwnedError` (optional, for explicit ownership check)

**New Service Method**: `updateNote(userId: UUID, noteId: UUID, command: UpdateNoteCommand): Promise<NoteDto>`

**Implementation**:

1. Query note by ID to verify existence and ownership
   - Filter: `WHERE id=? AND deleted_at IS NULL`
   - Check result exists and user_id matches
   - Throw `NoteNotFoundError` if not found or user doesn't own
2. Verify category exists
   - Query: `SELECT id FROM categories WHERE id=?`
   - Throw `CategoryNotFoundError` if not found
3. Fetch user's active_categories from preferences
   - Query: `SELECT active_categories FROM preferences WHERE user_id=?`
   - Throw error if preferences not found (shouldn't happen)
4. Verify category is in active_categories array
   - Check if `command.category_id` is in `preferences.active_categories`
   - Throw `CategoryNotActiveError` if not
5. Update the note
   - Query: `UPDATE notes SET category_id=?, title=?, content=?, updated_at=now() WHERE id=?`
   - Return updated row as `NoteDto`

**Error Handling**:

- Throw custom errors for business logic violations
- Propagate database errors for unexpected failures
- Use `maybeSingle()` for single-row queries to handle empty results

---

### Step 3: Create Controller Handler for PUT Endpoint

**File**: `src/controllers/notes.controller.ts`

**New Handler**: `updateNoteHandler(req: Request, res: Response, next: NextFunction): Promise<void>`

**Implementation**:

1. Verify authentication
   - Check `req.auth` exists
   - Return 401 if missing
2. Validate path parameter
   - Parse `req.params` with `UpdateNoteParamSchema`
   - Catch ZodError and return 400 with validation details
3. Validate request body
   - Parse `req.body` with `UpdateNoteCommandSchema`
   - Catch ZodError and return 400 with validation details
4. Create user-scoped Supabase client
   - Use `req.auth.jwt` for RLS enforcement
   - Initialize `NotesService` with client
5. Call service method
   - `notesService.updateNote(userId, noteId, validatedCommand)`
6. Handle service errors
   - `CategoryNotFoundError` → 422 VALIDATION_ERROR
   - `CategoryNotActiveError` → 403 CATEGORY_NOT_ACTIVE
   - `NoteNotFoundError` → 404 NOTE_NOT_FOUND
   - Generic Error → 500 SERVER_ERROR
7. Return success response
   - Status 200 with updated NoteDto

**Error Responses**:

- Use consistent `ErrorResponseDto` structure
- Include error code and message for client guidance
- Include details object for validation errors

---

### Step 4: Add Route Handler to Router

**File**: `src/routes/notes.router.ts`

**Actions**:

- Import `updateNoteHandler` from controller
- Add route: `router.put('/:id', authMiddleware, updateNoteHandler)`
- Place after POST and before DELETE for logical ordering
- Update JSDoc comment with endpoint details

---

### Step 5: Integration Testing

**Test Cases**:

_Success Scenarios_:

- Update only title
- Update only content
- Update only category_id (if in active list)
- Update all three fields
- Update title to null
- Verify updated_at timestamp changes

_Validation Errors (400/422)_:

- Invalid UUID in path
- Missing category_id
- Missing content
- Content exceeds 1000 chars
- Title exceeds 255 chars
- Invalid UUID format for category_id

_Authorization Errors (401)_:

- No Authorization header
- Invalid JWT token
- Expired token

_Business Logic Errors (403/404)_:

- Category not found → 422
- Category not in active_categories → 403
- Note not found → 404
- User doesn't own note → 404
- Note is soft-deleted → 404

_Error Scenarios (500)_:

- Database connection failure

---

### Step 6: Code Review & Refinement

**Review Checklist**:

- ✓ Zod schemas match DB constraints
- ✓ Error handling covers all scenarios
- ✓ RLS enforcement via user-scoped client
- ✓ Explicit ownership verification in service
- ✓ TypeScript types are correct
- ✓ No console.logs (except errors)
- ✓ Consistent error response format
- ✓ JSDoc comments on all public methods
- ✓ No hardcoded values
- ✓ Follows existing code patterns

---

### Step 7: Deployment & Verification

**Pre-Deployment**:

- Run linter: `npm run lint`
- Build: `npm run build`
- Run integration tests
- No TypeScript errors

**Post-Deployment**:

- Test endpoint with curl or Postman
- Verify error responses are consistent
- Check logs for any exceptions
- Monitor performance (query count, response time)

---

## Summary

This implementation plan provides a complete roadmap for adding the **PUT `/api/notes/{id}` endpoint**. The endpoint will:

✅ Validate all inputs (path parameter, request body)  
✅ Enforce authentication and authorization  
✅ Re-check active category constraint  
✅ Update note in database  
✅ Return updated note with 200 OK  
✅ Handle errors with appropriate HTTP status codes  
✅ Maintain data consistency and security  
✅ Follow existing code patterns and conventions

The implementation requires changes to 4 files:

1. `src/validation/notes.ts` - Add Zod schemas
2. `src/services/notes.service.ts` - Add updateNote method
3. `src/controllers/notes.controller.ts` - Add updateNoteHandler
4. `src/routes/notes.router.ts` - Add PUT route

Total effort: ~3-4 hours for a team familiar with the codebase.
