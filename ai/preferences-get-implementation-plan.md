# API Endpoint Implementation Plan: GET /api/preferences

## 1. Endpoint Overview

**Purpose**: Retrieve the current user's preferences with all their configured settings for weekly reports, delivery channels, note creation limits, and active categories. This endpoint provides a single source of truth for the user's system-wide preferences.

**Key Responsibilities**:

- Authenticate the user via JWT token
- Retrieve user's preferences record from database
- Return complete preferences object with all fields
- Enforce authorization (user can only read their own preferences)
- Handle edge cases (preferences not found, database errors)

---

## 2. Request Details

### HTTP Method

- **GET** `/api/preferences`

### URL Structure

```
GET /api/preferences
Host: {API_BASE_URL}
Authorization: Bearer {JWT_TOKEN}
```

### Request Headers

- **Authorization**: `Bearer {jwt_token}` (required, validated by auth middleware)

### Request Body

- **None** - This is a read-only endpoint with no input parameters

### URL Parameters

- **None** - Endpoint fetches preferences for the authenticated user (determined by JWT)

### Query Parameters

- **None** - Fixed response for authenticated user

---

## 3. Response Details

### Success Response (200 OK)

**Type**: `PreferencesDto` (Tables<'preferences'>)

```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440002",
  "active_categories": [
    "550e8400-e29b-41d4-a716-446655440000",
    "550e8400-e29b-41d4-a716-446655440001"
  ],
  "report_dow": 0,
  "report_hour": 2,
  "preferred_delivery_channels": ["in_app", "email"],
  "email_unsubscribed_at": null,
  "max_daily_notes": 4,
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-02T10:00:00Z"
}
```

### Response Fields

| Field                         | Type                | Description                                                    |
| ----------------------------- | ------------------- | -------------------------------------------------------------- |
| `user_id`                     | UUID                | Unique identifier for the user                                 |
| `active_categories`           | UUID[]              | List of category IDs where user creates notes (0-3 categories) |
| `report_dow`                  | SMALLINT            | Day of week for weekly report (0=Monday, 6=Sunday)             |
| `report_hour`                 | SMALLINT            | Hour of day for weekly report generation (0-23, UTC)           |
| `preferred_delivery_channels` | DeliveryChannel[]   | Channels to receive reports on (['in_app', 'email'])           |
| `email_unsubscribed_at`       | TIMESTAMPTZ \| null | Timestamp when user unsubscribed from emails; null=subscribed  |
| `max_daily_notes`             | SMALLINT            | Maximum notes user can create per category per day (1-10)      |
| `created_at`                  | TIMESTAMPTZ         | Timestamp when preferences record was created                  |
| `updated_at`                  | TIMESTAMPTZ         | Timestamp when preferences record was last updated             |

### Error Responses

#### 401 Unauthorized

Missing or invalid JWT token.

```json
{
  "error": {
    "code": "JWT_INVALID",
    "message": "Invalid credentials"
  }
}
```

Or:

```json
{
  "error": {
    "code": "AUTH_HEADER_MISSING",
    "message": "Authorization header is required"
  }
}
```

#### 404 Not Found

User preferences record does not exist (edge case - should rarely occur as preferences are created with profile).

```json
{
  "error": {
    "code": "PREFERENCES_NOT_FOUND",
    "message": "User preferences not found"
  }
}
```

#### 500 Internal Server Error

Unexpected server error (database connectivity, etc.).

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "Unexpected server error"
  }
}
```

---

## 4. Data Flow

### High-Level Flow Diagram

```
Client Request (GET /api/preferences)
    ↓
[Auth Middleware]
    - Validate JWT token
    - Extract userId
    - Attach req.auth with user context
    ↓
[Controller: getPreferencesHandler]
    - Check req.auth exists
    - Create user-scoped Supabase client with JWT
    ↓
[Preferences Service: getPreferences()]
    - Query preferences table: SELECT * FROM preferences WHERE user_id = $1
    - RLS policy enforces user_id visibility
    - Return PreferencesDto or throw error
    ↓
[Success Response (200 OK)]
    - Return full PreferencesDto with all fields
```

### Detailed Step-by-Step Process

1. **Request Reception**
   - Express receives GET request with Authorization header
   - Auth middleware validates JWT and attaches `req.auth` context
   - If JWT invalid or missing: middleware returns 401 (before reaching handler)

2. **Authentication Verification (Controller)**
   - Handler checks `req.auth` exists
   - If missing (should not happen due to middleware): return 401
   - Extract `userId` from `req.auth`

3. **Supabase Client Initialization**
   - Create user-scoped Supabase client with user's JWT token
   - This client respects RLS policies - user can only query their own data

4. **Service: Database Query**
   - Call `preferencesService.getPreferences(userId)`
   - Execute query: `SELECT * FROM preferences WHERE user_id = $1`
   - Supabase RLS policy automatically filters by `auth.uid()` matching `user_id`
   - If row found: return as PreferencesDto
   - If no row found: throw `PreferencesNotFoundError`

5. **Error Handling**
   - If `PreferencesNotFoundError`: return 404
   - If database connectivity error: return 500
   - If unexpected error: log and return 500

6. **Success Response**
   - Set status code 200 OK
   - Return PreferencesDto as JSON
   - Content-Type: application/json automatically set by Express

### Interaction with External Services

- **Supabase Auth**: JWT validation in middleware
- **Supabase Database**:
  - Single SELECT query on `preferences` table
  - RLS policy enforces user_id ownership
  - No external service calls needed
  - Response time: ~100-300ms (mostly Supabase latency)

---

## 5. Security Considerations

### Authentication

- **Mechanism**: Bearer JWT token in Authorization header
- **Validation**: Supabase middleware validates JWT and extracts user claims
- **JWT Format**: Expected format is "Bearer {token}"
- **Dev Mode**: In development, supports mock JWT via `X-Mock-User-Id` header
- **Production Mode**: Strict JWT validation required via Supabase API

### Authorization

- **Ownership Enforcement**: User can only read their own preferences via RLS policy
- **Row-Level Security (RLS)**: Enabled on `preferences` table
  - Policy: `(auth.uid() = user_id)` - user can only see/modify their row
  - User JWT client ensures queries are scoped to authenticated user
- **No Role-Based Access**: This endpoint is user-specific (1:1 with auth user)

### Input Validation

- **No Input to Validate**: GET endpoint has no request body or query parameters
- **URL Validation**: Implicit through routing (/api/preferences is exact match)
- **Header Validation**: Authorization header format validated by auth middleware

### Data Privacy

- **No PII Exposure**: Response contains only user_id (UUID) and system metadata
- **No Logging of Sensitive Data**: Avoid logging actual preference values
- **Response Filtering**: Supabase client returns only user's own record via RLS
- **TLS/HTTPS**: Enforced in production to protect JWT in transit

### Rate Limiting

- **Scope**: Per-user rate limiting should be configured at API gateway
- **Recommendation**: Moderate limit for preferences read (e.g., 60/minute per user)
- **Note**: This endpoint is read-only and low-risk for abuse

### Common Attack Vectors

- **Unauthorized Access**: Mitigated by JWT validation + RLS
- **SQL Injection**: Mitigated by Supabase parameterized queries
- **Data Exposure**: Mitigated by RLS policy + user JWT scope
- **Timing Attacks**: Not applicable (simple row retrieval)

---

## 6. Error Handling

### Error Categorization & Handling Strategy

#### Authorization Errors (401)

**Missing or Invalid JWT**:

- Handled by auth middleware before reaching handler
- Returns 401 with code `JWT_INVALID` or `AUTH_HEADER_MISSING`
- No additional error handling needed in controller (middleware intercepts)

**In Handler Context** (defensive check):

- If `req.auth` somehow missing, return 401
- Should not happen under normal middleware behavior

#### Not Found Errors (404)

**Preferences Record Not Found**:

- After auth, if querying user's preferences returns null
- Edge case: occurs if preferences not initialized during user signup
- Service throws `PreferencesNotFoundError`
- Controller catches and returns 404 with code `PREFERENCES_NOT_FOUND`

#### Server Errors (500)

**Database Connectivity Issues**:

- Connection pool exhausted
- Network timeout to Supabase
- Supabase service unavailable
- Log full error with user_id and timestamp
- Return generic 500 response (no internal details to client)

**Unexpected Service Failures**:

- Supabase client initialization errors
- Response parsing failures
- Thrown by service but not caught as specific error type
- Log with full stack trace for debugging

### Implementation Pattern

```typescript
try {
  // 1. Check authentication (middleware already validated)
  if (!req.auth) {
    return res.status(401).json({
      error: { code: 'JWT_INVALID', message: 'Invalid credentials' },
    });
  }

  // 2. Create user-scoped client
  const userClient = createClient<Database>(supabaseUrl, req.auth.jwt);

  // 3. Call service
  const preferences = await preferencesService.getPreferences(req.auth.userId);

  // 4. Return success
  return res.status(200).json(preferences);
} catch (err) {
  // Handle specific error types
  if (err instanceof PreferencesNotFoundError) {
    return res.status(404).json({
      error: { code: 'PREFERENCES_NOT_FOUND', message: 'User preferences not found' },
    });
  }

  // Log and return generic server error
  console.error('Preferences get error', err);
  return res.status(500).json({
    error: { code: 'SERVER_ERROR', message: 'Unexpected server error' },
  });
}
```

### Error Response Consistency

- All error responses follow `ErrorResponseDto` structure
- Always include `error.code` (machine-readable identifier)
- Always include `error.message` (human-readable description)
- Never expose internal error details to client (log them instead)
- Use appropriate HTTP status codes (401, 404, 500)

---

## 7. Performance Considerations

### Database Query Optimization

#### Single Row Lookup

- **Query**: `SELECT * FROM preferences WHERE user_id = $1 LIMIT 1`
- **Optimization**: `user_id` is PK (primary key), O(1) direct access
- **Index**: Automatically indexed as primary key
- **Expected Latency**: ~50-100ms

#### RLS Policy Enforcement

- **Impact**: RLS adds minimal overhead (condition evaluated per row)
- **Single Row**: Efficient for single-user queries
- **No N+1 Problem**: Not applicable (single query)

### Caching Strategy

- **Client-Side Caching**: Not recommended - preferences can change frequently
- **Server-Side Caching**: Optional cache with invalidation on PUT /api/preferences
  - If implemented: store in Redis with TTL of 5-10 minutes
  - Invalidate when preferences updated (PUT endpoint)
- **Current Recommendation**: No caching needed - queries are fast

### Latency Profile

- **Expected**: ~150-300ms per request
  - JWT validation: ~50ms (middleware)
  - Supabase round-trip: ~50-150ms (network + DB query)
  - Serialization/response: ~20ms
- **Bottleneck**: Supabase network latency (outside API server control)

### Concurrent Request Handling

- **Read-Only**: Multiple concurrent GET requests are independent
- **No Locking**: No row locks needed for read-only query
- **Supabase Connection Pool**: Handles concurrent connections efficiently
- **Scaling**: Read queries scale linearly with connection pool size

### Response Size

- **Average Response Size**: ~600 bytes (UUID strings + timestamps)
- **Compression**: gzip compression recommended for transport (Express middleware)
- **Bandwidth**: Negligible impact even at scale

---

## 8. Implementation Steps

### Step 1: Add getPreferences Method to PreferencesService

**File**: `src/services/preferences.service.ts`

Add new method to existing `PreferencesService` class:

```typescript
/**
 * Retrieve user preferences from the database
 * @param userId - UUID of the user
 * @returns PreferencesDto with user's preferences
 * @throws PreferencesNotFoundError if preferences record doesn't exist
 * @throws Error for database or unexpected errors
 */
async getPreferences(userId: UUID): Promise<PreferencesDto> {
  // Execute query with user's scoped client (enforces RLS)
  const { data: preferences, error } = await this.userClient
    .from('preferences')
    .select()
    .eq('user_id', userId)
    .single();

  if (error) {
    // Distinguish between not found and other errors
    if (error.code === 'PGRST116') {
      throw new PreferencesNotFoundError(userId);
    }
    throw new Error(`Failed to retrieve preferences: ${error.message}`);
  }

  if (!preferences) {
    throw new PreferencesNotFoundError(userId);
  }

  return preferences as PreferencesDto;
}
```

**Key Points**:

- Use `select()` without columns to get all fields
- Use `.single()` to ensure exactly one row returned
- `.eq('user_id', userId)` filters to authenticated user
- RLS policy on user JWT client automatically enforces ownership
- Handle error code `PGRST116` (no rows returned)
- Throw `PreferencesNotFoundError` for consistency

### Step 2: Create Controller Handler

**File**: `src/controllers/preferences.controller.ts`

Add new handler (keep existing `updatePreferencesHandler`):

```typescript
/**
 * Handler for GET /api/preferences
 * Retrieves current user's preferences
 *
 * @param req - Express request with authenticated user
 * @param res - Express response object
 * @returns 200 OK with PreferencesDto on success, error response otherwise
 */
export const getPreferencesHandler = async (req: Request, res: Response): Promise<void> => {
  try {
    // Step 1: Verify authentication
    if (!req.auth) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'JWT_INVALID',
          message: 'Invalid credentials',
        },
      };
      res.status(401).json(errorResponse);
      return;
    }

    // Step 2: Create user-scoped Supabase client for RLS enforcement
    const supabaseUrl = process.env.SUPABASE_URL as string;
    const userClient = createClient<Database>(supabaseUrl, req.auth.jwt);

    // Step 3: Initialize service and call get
    const preferencesService = new PreferencesService(userClient);
    const preferences = await preferencesService.getPreferences(req.auth.userId);

    // Step 4: Return success response
    res.status(200).json(preferences);
  } catch (err) {
    // Handle PreferencesNotFoundError (404)
    if (err instanceof PreferencesNotFoundError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'PREFERENCES_NOT_FOUND',
          message: 'User preferences not found',
        },
      };
      res.status(404).json(errorResponse);
      return;
    }

    // Log unexpected errors for debugging
    console.error('Preferences get handler error', err);

    // Return generic server error (500)
    const errorResponse: ErrorResponseDto = {
      error: {
        code: 'SERVER_ERROR',
        message: 'Unexpected server error',
      },
    };
    res.status(500).json(errorResponse);
  }
};
```

**Key Points**:

- Check `req.auth` exists (defensive, middleware should ensure it)
- Create user-scoped client with user's JWT
- Pass user ID to service
- Catch `PreferencesNotFoundError` for 404 response
- Catch all other errors for 500 response
- Log errors for debugging (but don't expose details to client)

### Step 3: Add GET Route to Router

**File**: `src/routes/preferences.router.ts`

Update router to add GET endpoint (keep existing PUT):

```typescript
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import {
  updatePreferencesHandler,
  getPreferencesHandler,
} from '../controllers/preferences.controller.js';

const router = Router();

/**
 * GET /api/preferences
 * Retrieve current user's preferences
 * @requires Authorization header with valid JWT
 */
router.get('/', authMiddleware, getPreferencesHandler);

/**
 * PUT /api/preferences
 * Update user preferences for reports, delivery channels, and daily note constraints
 * @requires Authorization header with valid JWT
 */
router.put('/', authMiddleware, updatePreferencesHandler);

export default router;
```

**Key Points**:

- Add GET route before PUT for consistency
- Both routes use `authMiddleware` to validate JWT
- Endpoints already registered in `src/index.ts` as `/api/preferences`
- No changes needed to main app file

### Step 4: Verify Existing Setup

**Files to Check**:

- `src/index.ts` - preferencesRouter already registered at `/api/preferences`
- `src/middleware/auth.middleware.ts` - Already validates JWT
- `src/services/preferences.service.ts` - PreferencesNotFoundError already defined
- `src/types.ts` - PreferencesDto already defined

No changes needed to these files.

### Step 5: Test Handler Locally

**Setup**:

1. Start backend server: `npm run dev`
2. Ensure Supabase is running/accessible
3. Get a valid JWT token or use mock user header

**Test Case 1: Valid Request (200 OK)**

```bash
curl -X GET http://localhost:3000/api/preferences \
  -H "Authorization: Bearer {valid_jwt}" \
  -H "Content-Type: application/json"
```

Expected Response:

```json
{
  "user_id": "...",
  "active_categories": [...],
  "report_dow": 0,
  "report_hour": 2,
  "preferred_delivery_channels": ["in_app"],
  "email_unsubscribed_at": null,
  "max_daily_notes": 4,
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-02T10:00:00Z"
}
```

**Test Case 2: Missing Authorization (401)**

```bash
curl -X GET http://localhost:3000/api/preferences
```

Expected Response:

```json
{
  "error": {
    "code": "AUTH_HEADER_MISSING",
    "message": "Authorization header is required"
  }
}
```

**Test Case 3: Invalid JWT (401)**

```bash
curl -X GET http://localhost:3000/api/preferences \
  -H "Authorization: Bearer invalid_token"
```

Expected Response:

```json
{
  "error": {
    "code": "JWT_INVALID",
    "message": "Invalid credentials"
  }
}
```

**Test Case 4: Mock User (Development)**

```bash
curl -X GET http://localhost:3000/api/preferences \
  -H "X-Mock-User-Id: 00000000-0000-0000-0000-000000000001"
```

Expected Response: User's preferences (if profile exists in dev DB)

### Step 6: Integration Testing

**File**: `src/controllers/preferences.controller.spec.ts` (optional but recommended)

Create unit tests:

```typescript
import { describe, it, expect } from '@jest/globals';
import { Request, Response } from 'express';
import { getPreferencesHandler } from '../preferences.controller';
import { PreferencesService, PreferencesNotFoundError } from '../../services/preferences.service';

// Mock the service
jest.mock('../../services/preferences.service');

describe('getPreferencesHandler', () => {
  it('should return 200 OK with preferences for valid request', async () => {
    const mockPreferences = {
      /* ... */
    };
    PreferencesService.prototype.getPreferences = jest.fn().resolveValue(mockPreferences);

    const req = { auth: { userId: 'test-user', jwt: 'test-jwt' } } as unknown as Request;
    const res = { status: jest.fn().returnThis(), json: jest.fn() } as unknown as Response;

    await getPreferencesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(mockPreferences);
  });

  it('should return 401 if req.auth missing', async () => {
    const req = { auth: null } as unknown as Request;
    const res = { status: jest.fn().returnThis(), json: jest.fn() } as unknown as Response;

    await getPreferencesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'JWT_INVALID' }) })
    );
  });

  it('should return 404 if preferences not found', async () => {
    PreferencesService.prototype.getPreferences = jest
      .fn()
      .rejectValue(new PreferencesNotFoundError('test-user'));

    const req = { auth: { userId: 'test-user', jwt: 'test-jwt' } } as unknown as Request;
    const res = { status: jest.fn().returnThis(), json: jest.fn() } as unknown as Response;

    await getPreferencesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'PREFERENCES_NOT_FOUND' }) })
    );
  });

  it('should return 500 on unexpected error', async () => {
    PreferencesService.prototype.getPreferences = jest
      .fn()
      .rejectValue(new Error('Database connection failed'));

    const req = { auth: { userId: 'test-user', jwt: 'test-jwt' } } as unknown as Request;
    const res = { status: jest.fn().returnThis(), json: jest.fn() } as unknown as Response;

    await getPreferencesHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'SERVER_ERROR' }) })
    );
  });
});
```

**Test Cases to Include**:

- Valid request returns 200 with PreferencesDto
- Missing auth returns 401
- Invalid JWT returns 401
- Preferences not found returns 404
- Database error returns 500
- Response structure is correct (all fields present)

### Step 7: Document and Deploy

**Documentation**:

1. Update OpenAPI/Swagger spec with GET endpoint schema
2. Add to API documentation with example requests/responses
3. Document error codes and meanings
4. Add to ENDPOINT_TESTING_GUIDE.md

**Deployment Checklist**:

- [ ] All tests passing
- [ ] Code review completed
- [ ] No linter errors
- [ ] Tested in staging environment
- [ ] Manual smoke tests (curl requests)
- [ ] Verify RLS policy enforces user isolation
- [ ] Deploy to production
- [ ] Monitor error logs for issues
- [ ] Verify endpoint in production with real user

---

## Implementation Checklist

### Core Implementation

- [ ] Add `getPreferences()` method to PreferencesService
- [ ] Add `getPreferencesHandler()` to preferences controller
- [ ] Add GET route to preferences router
- [ ] Verify no changes needed to main app file
- [ ] Verify imports and exports are correct

### Testing

- [ ] Write unit tests for handler
- [ ] Test successful retrieval (200)
- [ ] Test missing auth header (401)
- [ ] Test invalid JWT (401)
- [ ] Test preferences not found (404)
- [ ] Test database errors (500)
- [ ] Manual testing with curl
- [ ] Test with mock user header (development)

### Documentation

- [ ] Update OpenAPI/Swagger spec
- [ ] Add endpoint to API documentation
- [ ] Update ENDPOINT_TESTING_GUIDE.md
- [ ] Add to README if applicable

### Quality Assurance

- [ ] Run linter: `npm run lint`
- [ ] Build TypeScript: `npm run build`
- [ ] All tests passing: `npm test`
- [ ] No unused imports
- [ ] Code follows existing patterns
- [ ] Error handling comprehensive

---

## Tech Stack References

- **Framework**: Express.js (TypeScript)
- **Database**: Supabase (PostgreSQL) with RLS
- **Authentication**: JWT (Supabase)
- **Language**: TypeScript 5.9.3
- **Runtime**: Node.js
- **HTTP Client (tests)**: Supertest or curl

---

## Related Implementation

This endpoint complements the existing **PUT /api/preferences** endpoint:

- **GET /api/preferences** - Retrieve user's preferences (READ)
- **PUT /api/preferences** - Update user's preferences (WRITE)

Both endpoints:

- Use same authentication mechanism (JWT)
- Use same RLS policy (user_id ownership)
- Return PreferencesDto response
- Share PreferencesService for data access
- Follow identical error handling patterns

---

## Notes for Developers

1. **Idempotency**: GET is idempotent - multiple calls return same result
2. **Caching**: Response can be safely cached by client/browser
3. **Etag Headers**: Consider adding ETag header for client-side caching optimization
4. **Permissions**: RLS policy on preferences table ensures users can only see their own row
5. **Performance**: Single row lookup is very fast (~100ms), no optimization urgency
6. **Edge Cases**: Handle gracefully if preferences record doesn't exist (unlikely but possible)
7. **Monitoring**: Track response times and error rates in production
