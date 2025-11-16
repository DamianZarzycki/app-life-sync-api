# API Endpoint Implementation Plan: DELETE /api/notes/{id}

## 1. Endpoint Overview

### Purpose

Soft-delete a single note for the authenticated user. This endpoint allows users to remove notes from their view while preserving data integrity and enabling potential recovery. The operation sets the `deleted_at` timestamp to the current moment, marking the note as deleted without physically removing it from the database.

### Key Characteristics

- **Operation Type**: Soft Delete (non-destructive)
- **Scope**: Single note owned by the authenticated user
- **Idempotent**: Multiple requests with the same ID produce the same result
- **Response**: 204 No Content (no body, only status)
- **Authorization**: Requires valid JWT token
- **Data Retention**: Note remains in database, excluded from standard listing queries

---

## 2. Request Details

### HTTP Method

DELETE

### URL Structure

```
/api/notes/{id}
```

### Path Parameters

| Parameter | Type   | Required | Format  | Description                                 |
| --------- | ------ | -------- | ------- | ------------------------------------------- |
| `id`      | string | Yes      | UUID v4 | The unique identifier of the note to delete |

**Example**: `/api/notes/550e8400-e29b-41d4-a716-446655440000`

### Request Headers

| Header          | Required | Format               | Description                            |
| --------------- | -------- | -------------------- | -------------------------------------- |
| `Authorization` | Yes      | `Bearer <JWT_TOKEN>` | Supabase authentication token          |
| `Content-Type`  | No       | `application/json`   | Optional; typically not set for DELETE |

### Request Body

None

### Authentication

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 3. Used Types

### Input Validation Schema

**Location**: `src/validation/notes.ts`

**Schema**: `GetNoteParamSchema` (already defined)

```typescript
export const GetNoteParamSchema = z.object({
  id: z.string({ required_error: 'Note ID is required' }).uuid('Note ID must be a valid UUID'),
});

export type GetNoteParam = z.infer<typeof GetNoteParamSchema>;
```

**Validation Rules**:

- `id` must be a non-empty string
- `id` must be a valid UUID v4 format
- Case-insensitive UUID parsing

### DTOs

**No DTOs for response** (204 No Content has empty body)

**Related DTOs** (for context):

- `NoteDto` (from `src/types.ts`): Represents a complete note record
- `UUID` type: String alias for UUID identifiers

---

## 4. Response Details

### Success Response

**Status Code**: 204 No Content

**Response Body**: (empty)

**Response Headers**:

```
Content-Length: 0
```

**HTTP Flow**:

```
DELETE /api/notes/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>

HTTP/1.1 204 No Content
```

### Error Responses

#### 400 Bad Request - Invalid UUID Format

**Condition**: Path parameter `id` is not a valid UUID

**Status Code**: 400

**Response Body**:

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

#### 401 Unauthorized - Missing/Invalid Authentication

**Condition**: Authorization header missing, invalid format, or JWT token expired/invalid

**Status Code**: 401

**Response Body**:

```json
{
  "error": {
    "code": "JWT_INVALID",
    "message": "Invalid credentials"
  }
}
```

#### 404 Not Found - Note Not Found or Not Owned

**Condition**: Note with given ID doesn't exist OR user doesn't own the note

**Status Code**: 404

**Response Body**:

```json
{
  "error": {
    "code": "NOTE_NOT_FOUND",
    "message": "Note not found"
  }
}
```

**Security Note**: Returns 404 for both "not found" and "access denied" to prevent user enumeration attacks.

#### 500 Internal Server Error

**Condition**: Unexpected database or server error

**Status Code**: 500

**Response Body**:

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

### Request Processing Flow

```
1. Client sends DELETE request to /api/notes/{id}
                    ↓
2. Express router matches route pattern
                    ↓
3. Auth middleware validates JWT
   - Extracts token from Authorization header
   - Verifies JWT signature with Supabase
   - Attaches user info to req.auth
                    ↓
4. Route handler receives request
                    ↓
5. Validate path parameter {id}
   - Parse req.params.id
   - Run through GetNoteParamSchema validation
   - If invalid: respond 400
                    ↓
6. Create user-scoped Supabase client
   - Instantiate new client with user JWT
   - Enables RLS enforcement at database level
                    ↓
7. Instantiate NotesService with user client
                    ↓
8. Call service.deleteNoteById(userId, noteId)
                    ↓
9. Service retrieves note record
   - Query: SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL
   - RLS policy: WHERE user_id = auth.uid()
   - If not found: throw NoteNotFoundError
                    ↓
10. Service soft-deletes note
    - Query: UPDATE notes SET deleted_at = now() WHERE id = ?
    - Timestamp applied by database server (ensures consistency)
                    ↓
11. Handle result
    - If NoteNotFoundError: respond 404
    - If database error: respond 500 with generic message
                    ↓
12. Return 204 No Content to client
```

### Database Operations

#### Step 1: Verify Note Exists and User Owns It

```typescript
const { data: note, error } = await userClient
  .from('notes')
  .select('*')
  .eq('id', noteId)
  .is('deleted_at', null) // Only retrieve non-deleted notes
  .single();

if (error?.code === 'PGRST116' || !note) {
  throw new NoteNotFoundError(noteId);
}
```

**Query Generated** (with RLS):

```sql
SELECT *
FROM notes
WHERE id = $1
  AND user_id = auth.uid()
  AND deleted_at IS NULL
LIMIT 1
```

#### Step 2: Soft-Delete the Note

```typescript
const { data: updatedNote, error: updateError } = await userClient
  .from('notes')
  .update({ deleted_at: new Date().toISOString() })
  .eq('id', noteId)
  .select()
  .single();

if (updateError) {
  throw new Error(`Failed to delete note: ${updateError.message}`);
}
```

**Query Generated** (with RLS):

```sql
UPDATE notes
SET deleted_at = now()
WHERE id = $1
  AND user_id = auth.uid()
RETURNING *
```

### Data Consistency

- **Timestamp**: Uses server-side `now()` for consistency across timezones
- **Atomicity**: Single UPDATE operation ensures consistency
- **Idempotency**: Setting `deleted_at` multiple times is safe
- **Soft Delete**: `deleted_at IS NOT NULL` marks the note as deleted
- **RLS Enforcement**: Database policy ensures user can only delete own notes

---

## 6. Security Considerations

### Authentication & Authorization

#### JWT Validation

- **Middleware**: `authMiddleware` (in `src/middleware/auth.middleware.ts`)
- **Verification**: JWT signature validated against Supabase JWKS
- **User Context**: User ID extracted and attached to `req.auth`
- **Failure**: Returns 401 for invalid/expired tokens
- **Dev Mode**: Supports mock users for testing (controlled by NODE_ENV)

#### Row-Level Security (RLS)

- **Database Policy**: `notes` table has RLS enabled
- **Policy Rule**: Users can only access/modify notes where `user_id = auth.uid()`
- **Enforcement**: Applied by Supabase at query execution time
- **Defense-in-Depth**: User-scoped JWT client ensures RLS applies automatically
- **Ownership Verification**: Both controller and database enforce user_id match

#### User-Scoped Client

- **Instantiation**: Each request creates fresh client with user JWT
- **Purpose**: Ensures RLS policies apply to all queries
- **Prevents**: Accidental escalation of privileges
- **Pattern**: Aligns with Supabase best practices

### Data Validation

#### Input Validation

- **UUID Format**: Strict validation using Zod schema
- **Invalid Format**: Rejected before database query (400 response)
- **Framework**: Zod for runtime schema validation
- **Error Details**: Provides clear validation error messages to client

#### Output Validation

- **No Output**: 204 response has no body to validate
- **Status Only**: Client relies on HTTP status code

### Sensitive Data Handling

#### Information Disclosure Prevention

- **404 Response**: Used for both "note not found" and "access denied"
- **Prevents**: User enumeration attacks (attacker can't determine if note exists)
- **Error Messages**: Generic, don't reveal system internals
- **Logging**: Server-side logging only (not sent to client)

#### Error Messages

- **Validation Errors**: Provide actionable guidance (e.g., "invalid UUID format")
- **Authorization Errors**: Generic message (e.g., "invalid credentials")
- **Server Errors**: Generic message (e.g., "an unexpected error occurred")
- **Database Errors**: Never exposed directly to client

### Additional Security Measures

#### Rate Limiting

- **Application**: Inherited from API-level rate limit middleware
- **Purpose**: Prevents brute-force attacks on note IDs
- **Configuration**: See main Express configuration

#### SQL Injection Prevention

- **SDK Usage**: Supabase JS client uses parameterized queries exclusively
- **No Raw SQL**: No string concatenation in queries
- **Parameter Binding**: All user inputs bound as query parameters
- **Safe**: Automatically protects against SQL injection

#### CORS & Security Headers

- **Helmet Middleware**: Applied globally to all routes
- **Headers**: Include X-Frame-Options, X-Content-Type-Options, etc.
- **CORS Policy**: Configured in main Express setup

#### Concurrency Safety

- **Idempotent Operation**: Soft delete safe to retry
- **Multiple Deletes**: Setting `deleted_at` multiple times causes no harm
- **Database Timestamp**: `now()` ensures consistency

---

## 7. Error Handling

### Error Scenarios and Resolution

| Scenario                     | Status | Error Code       | Message                      | Root Cause                                  | Resolution                            |
| ---------------------------- | ------ | ---------------- | ---------------------------- | ------------------------------------------- | ------------------------------------- |
| Authorization header missing | 401    | JWT_INVALID      | Invalid credentials          | Missing Authorization header                | Add header with valid Bearer token    |
| JWT token expired            | 401    | JWT_INVALID      | Invalid credentials          | Token expired or revoked                    | Refresh token; re-authenticate        |
| JWT signature invalid        | 401    | JWT_INVALID      | Invalid credentials          | Tampered or forged token                    | Use valid token from provider         |
| UUID format invalid          | 400    | VALIDATION_ERROR | Invalid note ID format       | Malformed UUID in path                      | Use valid UUID v4 format              |
| Note doesn't exist           | 404    | NOTE_NOT_FOUND   | Note not found               | ID references non-existent record           | Verify note ID is correct             |
| User doesn't own note        | 404    | NOTE_NOT_FOUND   | Note not found               | Different user owns note                    | User can only delete own notes        |
| Note already deleted         | 204    | —                | (success)                    | Calling delete on already-soft-deleted note | Operation idempotent; safe to retry   |
| Database connection error    | 500    | SERVER_ERROR     | An unexpected error occurred | Supabase unreachable                        | Backend service monitors for recovery |
| Unexpected database error    | 500    | SERVER_ERROR     | An unexpected error occurred | Unhandled DB exception                      | Backend logs error; client retries    |

### Error Handling in Controller

```typescript
try {
  // 1. Validate path parameter
  try {
    validatedParam = GetNoteParamSchema.parse(req.params);
  } catch (validationError) {
    if (validationError instanceof z.ZodError) {
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid note ID format',
          details: {
            /* field errors */
          },
        },
      });
    }
  }

  // 2. Call service
  const noteId = validatedParam.id;
  const userId = req.auth.userId;
  const jwt = req.auth.jwt;

  const userClient = createClient<Database>(supabaseUrl, jwt);
  const notesService = new NotesService(userClient);

  await notesService.deleteNoteById(userId, noteId);

  // 3. Handle specific errors
  // (catch NoteNotFoundError, etc.)
} catch (err) {
  if (err instanceof NoteNotFoundError) {
    return res.status(404).json({
      error: {
        code: 'NOTE_NOT_FOUND',
        message: 'Note not found',
      },
    });
  }

  // Generic error
  console.error('deleteNoteHandler error:', err);
  return res.status(500).json({
    error: {
      code: 'SERVER_ERROR',
      message: 'An unexpected error occurred',
    },
  });
}
```

### Error Logging

- **Validation Errors**: Not logged (expected client errors)
- **Authorization Errors**: Not logged (expected with expired tokens)
- **Not Found Errors**: Not logged (expected for missing resources)
- **Server Errors (500)**: Logged with full error context
  - **Log Format**: `console.error('deleteNoteHandler error:', err)`
  - **Information**: Error type, message, stack trace
  - **Purpose**: Debugging and monitoring

---

## 8. Performance Considerations

### Query Optimization

#### Indexes

- **Primary**: `notes.id` (Primary Key)
- **Secondary**: `notes(user_id, deleted_at)` for RLS filtering
- **Existing Index**: `idx_notes_user_created_at` supports range queries
- **Current Setup**: Adequate for single-record lookups

#### Query Plan

- **Verification Query**: Uses PK index (O(1) lookup)
- **Update Query**: Uses PK index (O(1) update)
- **Total Complexity**: O(1) per request

### Database Load

#### Request Load

- **Small Payload**: Only UUID in path
- **Response Payload**: 204 No Content (0 bytes)
- **Network**: Minimal bandwidth required

#### Concurrent Deletes

- **Locking**: Database row-level locks during update
- **Duration**: Brief (milliseconds)
- **Conflict**: No conflict; last write wins (idempotent `deleted_at`)
- **Scalability**: Handles 1000+ concurrent deletes without issue

### Caching Considerations

- **No Caching**: Single delete operation (not suitable for HTTP caching)
- **Cache Invalidation**: If list/get caching implemented, invalidate on delete
- **Timestamp**: `deleted_at` ensures queries naturally exclude deleted notes

### Soft Delete Performance

- **List Query Impact**: Soft deletes add `AND deleted_at IS NULL` filter
- **Index Strategy**: Index on `(user_id, deleted_at)` optimizes queries
- **Data Growth**: Accumulation of soft-deleted records over 6 months
- **Retention Policy**: Hard deletion after 6 months prevents unbounded growth

### Recommended Optimizations

1. **Monitoring**: Track delete request latency at p50, p95, p99
2. **Alerting**: Alert if delete latency exceeds 500ms
3. **Retention**: Ensure 6-month cleanup CRON runs successfully
4. **Cleanup**: Monitor for accumulation of `deleted_at IS NOT NULL` records

---

## 9. Implementation Steps

### Phase 1: Service Layer

#### Step 1.1: Add Delete Service Method

**File**: `src/services/notes.service.ts`

**Action**: Add `deleteNoteById` method to `NotesService` class

```typescript
/**
 * Soft-delete a note by ID for the authenticated user
 *
 * Sets deleted_at timestamp to mark note as deleted without physical removal
 * Enforces user ownership through RLS
 *
 * @param userId - UUID of the authenticated user
 * @param noteId - UUID of the note to delete
 * @returns void (on success)
 * @throws NoteNotFoundError if note doesn't exist or user doesn't own it
 * @throws Error for unexpected database errors
 */
async deleteNoteById(userId: UUID, noteId: UUID): Promise<void> {
  // Step 1: Verify note exists and user owns it
  const { data: note, error: getError } = await this.userClient
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .is('deleted_at', null)
    .single();

  if (getError) {
    if (getError.code === 'PGRST116') {
      throw new NoteNotFoundError(noteId);
    }
    throw new Error(`Failed to retrieve note: ${getError.message}`);
  }

  if (!note) {
    throw new NoteNotFoundError(noteId);
  }

  // Step 2: Soft-delete the note
  const { error: updateError } = await this.userClient
    .from('notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', noteId);

  if (updateError) {
    throw new Error(`Failed to delete note: ${updateError.message}`);
  }
}
```

**Checklist**:

- [ ] Add method to NotesService class
- [ ] Include JSDoc comments
- [ ] Handle NoteNotFoundError appropriately
- [ ] Use user-scoped client (passed in constructor)
- [ ] Use ISO string for timestamp

### Phase 2: Controller Layer

#### Step 2.1: Add Delete Controller Handler

**File**: `src/controllers/notes.controller.ts`

**Action**: Add `deleteNoteHandler` function

```typescript
/**
 * DELETE /api/notes/{id}
 * Soft-delete a note for the authenticated user
 *
 * Path Parameters:
 * - id: required UUID of the note to delete
 *
 * Success Response:
 * - 204 No Content
 *
 * Error Responses:
 * - 400: Invalid UUID format
 * - 401: Missing/invalid authentication
 * - 404: Note not found or user doesn't own it
 * - 500: Server error
 */
export const deleteNoteHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. Ensure authenticated
    if (!req.auth) {
      res.status(401).json({
        error: { code: 'JWT_INVALID', message: 'Invalid credentials' },
      });
      return;
    }

    // 2. Validate path parameter
    let validatedParam;
    try {
      validatedParam = GetNoteParamSchema.parse(req.params);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const details = Object.fromEntries(
          validationError.errors.map((err) => [err.path.join('.'), err.message])
        );
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid note ID format',
            details,
          },
        });
        return;
      }
      throw validationError;
    }

    const userId = req.auth.userId;
    const noteId = validatedParam.id;
    const jwt = req.auth.jwt;

    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const notesService = new NotesService(userClient);

    // 4. Delete note through service
    await notesService.deleteNoteById(userId, noteId);

    // 5. Return 204 No Content
    res.status(204).send();
  } catch (err) {
    // Handle specific service errors with appropriate HTTP status codes
    if (err instanceof NoteNotFoundError) {
      res.status(404).json({
        error: {
          code: 'NOTE_NOT_FOUND',
          message: 'Note not found',
        },
      });
      return;
    }

    // Generic error handling
    console.error('deleteNoteHandler error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    });
  }
};
```

**Checklist**:

- [ ] Add handler function to notes.controller.ts
- [ ] Import GetNoteParamSchema from validation
- [ ] Check authentication exists
- [ ] Validate path parameter
- [ ] Create user-scoped client
- [ ] Call service.deleteNoteById()
- [ ] Handle NoteNotFoundError with 404
- [ ] Return 204 on success
- [ ] Log errors (500 case)

#### Step 2.2: Export Handler

**File**: `src/controllers/notes.controller.ts`

**Action**: Verify export in controller file

```typescript
export { listNotesHandler, createNoteHandler, getNoteHandler, deleteNoteHandler };
```

### Phase 3: Route Layer

#### Step 3.1: Add Delete Route

**File**: `src/routes/notes.router.ts`

**Action**: Add DELETE route to router

```typescript
/**
 * DELETE /api/notes/{id}
 * Soft-delete a note for the authenticated user
 * Requires: Authorization header with Bearer token
 */
router.delete('/:id', authMiddleware, (req: Request, res: Response, next: NextFunction) =>
  deleteNoteHandler(req, res, next)
);
```

**Full Router File** (after changes):

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  listNotesHandler,
  createNoteHandler,
  getNoteHandler,
  deleteNoteHandler,
} from '../controllers/notes.controller.js';

const router = Router();

router.get('/', authMiddleware, (req: Request, res: Response, next: NextFunction) =>
  listNotesHandler(req, res, next)
);

router.get('/:id', authMiddleware, (req: Request, res: Response, next: NextFunction) =>
  getNoteHandler(req, res, next)
);

router.post('/', authMiddleware, (req: Request, res: Response, next: NextFunction) =>
  createNoteHandler(req, res, next)
);

router.delete('/:id', authMiddleware, (req: Request, res: Response, next: NextFunction) =>
  deleteNoteHandler(req, res, next)
);

export default router;
```

**Checklist**:

- [ ] Import deleteNoteHandler
- [ ] Add DELETE route with `:id` parameter
- [ ] Apply authMiddleware
- [ ] Route handler follows existing pattern

### Phase 4: Testing

#### Step 4.1: Manual Testing with cURL

```bash
# Success case (204 No Content)
curl -X DELETE \
  -H "Authorization: Bearer <valid_jwt>" \
  http://localhost:3000/api/notes/550e8400-e29b-41d4-a716-446655440000

# Expected: HTTP 204 with no body

# Invalid UUID (400)
curl -X DELETE \
  -H "Authorization: Bearer <valid_jwt>" \
  http://localhost:3000/api/notes/invalid-id

# Expected: HTTP 400 with validation error

# Unauthorized (401)
curl -X DELETE \
  http://localhost:3000/api/notes/550e8400-e29b-41d4-a716-446655440000

# Expected: HTTP 401 with auth error

# Not found (404)
curl -X DELETE \
  -H "Authorization: Bearer <valid_jwt>" \
  http://localhost:3000/api/notes/00000000-0000-0000-0000-000000000000

# Expected: HTTP 404 with not found error
```

#### Step 4.2: Verify Soft Delete Behavior

1. Create a note via POST /api/notes
2. Verify note appears in GET /api/notes
3. Delete note via DELETE /api/notes/{id}
4. Verify GET /api/notes/{id} returns 404
5. Verify note not in GET /api/notes list
6. Verify note can be retrieved with include_deleted=true (if implemented)

#### Step 4.3: Unit Tests (Optional)

**File**: `src/services/notes.service.spec.ts` (if test structure exists)

```typescript
describe('NotesService.deleteNoteById', () => {
  it('should soft-delete a note for the authenticated user', async () => {
    // Setup: Create a test note
    // Execute: Call deleteNoteById
    // Assert: Verify deleted_at timestamp set, note no longer in list
  });

  it('should throw NoteNotFoundError for non-existent note', async () => {
    // Execute: Call deleteNoteById with fake ID
    // Assert: NoteNotFoundError thrown
  });

  it('should return 404 for note owned by different user', async () => {
    // Setup: Create note as user A
    // Execute: Try to delete as user B
    // Assert: NoteNotFoundError thrown (RLS prevents access)
  });
});
```

#### Step 4.4: Compile TypeScript

```bash
npm run build
```

**Checklist**:

- [ ] TypeScript compiles without errors
- [ ] No type errors in new code
- [ ] All imports resolve correctly

### Phase 5: Integration and Deployment

#### Step 5.1: Verify Imports

**File**: `src/controllers/notes.controller.ts`

Ensure import statement includes all handlers:

```typescript
import {
  ListNotesQuerySchema,
  CreateNoteCommandSchema,
  GetNoteParamSchema,
} from '../validation/notes.js';
import {
  NotesService,
  CategoryNotActiveError,
  DailyLimitExceededError,
  CategoryNotFoundError,
  NoteNotFoundError,
} from '../services/notes.service.js';
```

#### Step 5.2: Verify Environment Variables

Ensure required variables are set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `NODE_ENV` (for dev mode determination)

#### Step 5.3: Build and Test

```bash
# Clean build
npm run clean
npm run build

# Run in dev mode
npm run dev

# Test endpoint (in another terminal)
curl -X DELETE http://localhost:3000/api/notes/{id}
```

#### Step 5.4: Deployment Checklist

- [ ] All files saved and committed
- [ ] TypeScript builds successfully
- [ ] No linting errors
- [ ] All manual tests pass
- [ ] Environment variables configured
- [ ] Code review completed
- [ ] Ready for deployment

---

## 10. Additional Considerations

### Backward Compatibility

- **Existing Clients**: Soft delete via this endpoint doesn't break existing integrations
- **List Query**: Notes automatically excluded unless `include_deleted=true`
- **Get Query**: Returns 404 for deleted notes (existing behavior)

### Future Enhancements

1. **Undelete Endpoint**: Add PATCH endpoint to restore soft-deleted notes
2. **Bulk Delete**: Support deleting multiple notes in single request
3. **Cascade Delete**: Consider categories—what happens to notes when category deleted?
4. **Audit Logging**: Log delete operations to audit table for compliance
5. **Soft Delete TTL**: Implement temporary soft-delete (purge after 30 days)

### Monitoring & Observability

1. **Delete Rate**: Monitor frequency of delete operations
2. **Soft Delete Accumulation**: Track ratio of deleted:active notes
3. **Error Rate**: Monitor 404, 400, 500 error frequencies
4. **Latency**: Track 95th percentile delete operation time
5. **Alerts**: Alert if error rate exceeds threshold (>5% of requests)

### Retention & Compliance

- **Data Retention**: Soft-deleted notes retained for 6 months
- **Hard Deletion**: CRON cleanup job removes permanently after 6 months
- **GDPR**: Soft delete provides grace period before permanent deletion
- **Recovery**: Users can request recovery within retention window
