# API Endpoint Implementation Plan: PUT /api/preferences

## 1. Endpoint Overview

**Purpose**: Update user preferences for weekly report scheduling, delivery channels, and daily note creation constraints. This endpoint enforces comprehensive validation to maintain data integrity and ensure users configure consistent preferences across the system.

**Key Responsibilities**:
- Validate incoming preference parameters
- Ensure referenced categories exist in the database
- Update user's preferences record via Supabase
- Return the complete updated preferences object
- Enforce authorization (user can only update their own preferences)

---

## 2. Request Details

### HTTP Method
- **PUT** `/api/preferences`

### URL Structure
```
PUT /api/preferences
Host: {API_BASE_URL}
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

### Request Headers
- **Authorization**: `Bearer {jwt_token}` (required, validated by auth middleware)
- **Content-Type**: `application/json` (required)

### Request Body

**Type**: `UpdatePreferencesCommand` (from types.ts)

```json
{
  "active_categories": ["550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001"],
  "report_dow": 0,
  "report_hour": 2,
  "preferred_delivery_channels": ["in_app", "email"],
  "email_unsubscribed_at": null,
  "max_daily_notes": 4
}
```

### Parameters

**All parameters are required at the API boundary** (as specified in types.ts `UpdatePreferencesCommand`):

| Parameter | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| `active_categories` | UUID[] | Min 0, Max 3 | Categories where user enables note creation |
| `report_dow` | SMALLINT | 0-6 (0=Monday) | Day of week for weekly report generation |
| `report_hour` | SMALLINT | 0-23 | Hour of day (UTC or user timezone) for weekly report |
| `preferred_delivery_channels` | DeliveryChannel[] | ['in_app', 'email'] subset | Channels to receive reports on |
| `email_unsubscribed_at` | TIMESTAMPTZ \| null | ISO datetime or null | Timestamp when user unsubscribed from emails (null=subscribed) |
| `max_daily_notes` | SMALLINT | 1-10 | Maximum notes allowed per category per day |

---

## 3. Response Details

### Success Response (200 OK)

**Type**: `PreferencesDto` (Tables<'preferences'>)

```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440002",
  "active_categories": ["550e8400-e29b-41d4-a716-446655440000", "550e8400-e29b-41d4-a716-446655440001"],
  "report_dow": 0,
  "report_hour": 2,
  "preferred_delivery_channels": ["in_app", "email"],
  "email_unsubscribed_at": null,
  "max_daily_notes": 4,
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-15T14:30:00Z"
}
```

### Error Responses

#### 400 Bad Request
Invalid request payload structure or missing required fields.

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body validation failed",
    "details": {
      "report_dow": "Expected number, received string"
    }
  }
}
```

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

#### 404 Not Found
User preferences record does not exist (should rarely occur as preferences are created with profile).

```json
{
  "error": {
    "code": "PREFERENCES_NOT_FOUND",
    "message": "User preferences not found"
  }
}
```

#### 422 Unprocessable Entity
Field-level validation failures (constraints violated).

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Preference validation failed",
    "details": {
      "active_categories": "Maximum 3 categories allowed",
      "report_dow": "Must be between 0 and 6",
      "report_hour": "Must be between 0 and 23",
      "max_daily_notes": "Must be between 1 and 10",
      "preferred_delivery_channels": "Invalid channel: sms"
    }
  }
}
```

#### 500 Internal Server Error
Unexpected server error.

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
Client Request (PUT /api/preferences)
    ↓
[Auth Middleware]
    - Validate JWT token
    - Extract userId
    - Create user-scoped Supabase client with JWT
    ↓
[Request Body Parsing & Zod Validation]
    - Parse JSON body
    - Validate against UpdatePreferencesCommandSchema
    - Return 400 if structure invalid
    - Return 422 if field values out of range/invalid type
    ↓
[Preferences Service: updatePreferences()]
    - Verify user preferences record exists
    - Validate all active_category UUIDs exist in categories table
    - Call Supabase UPDATE to persist changes
    - Return updated PreferencesDto
    ↓
[Success Response (200 OK)]
    - Return full PreferencesDto with updated_at timestamp
```

### Detailed Step-by-Step Process

1. **Request Reception**
   - Express receives PUT request with body and Authorization header
   - Auth middleware validates JWT and attaches `req.auth` context

2. **Body Validation (Controller)**
   - Parse incoming JSON as UpdatePreferencesCommand
   - Apply Zod schema validation:
     - Type checking (arrays, numbers, strings)
     - Range validation (report_dow 0-6, report_hour 0-23, max_daily_notes 1-10)
     - Array constraints (active_categories max 3)
     - Enum validation (preferred_delivery_channels)
   - If validation fails: return 400 (structural) or 422 (constraint)

3. **Preferences Service Call**
   - Initialize PreferencesService with user's JWT client
   - Call `updatePreferences(userId, command)`

4. **Service: Category Validation**
   - Query `categories` table for all UUIDs in `active_categories`
   - Verify count matches requested UUIDs (all must exist)
   - If any missing: return error details (422)

5. **Service: Database Update**
   - Call Supabase `.from('preferences').update(command).eq('user_id', userId).select()`
   - RLS policy ensures user can only update their own record
   - DB triggers update `updated_at` automatically

6. **Service: Response Mapping**
   - Extract returned row
   - Return as PreferencesDto

7. **Controller: Response**
   - Set status code 200 OK
   - Return PreferencesDto as JSON

### Interaction with External Services

- **Supabase Auth**: JWT validation (already handled by middleware)
- **Supabase Database**: 
  - Read `categories` table (validation)
  - Update `preferences` table (persistence)
  - RLS policy enforces user_id ownership

---

## 5. Security Considerations

### Authentication
- **Mechanism**: Bearer JWT token in Authorization header
- **Validation**: Supabase middleware validates JWT and attaches user context
- **Scope**: Service role or user JWT; user JWT ensures RLS enforcement
- **Dev Mode**: Dev mode supports mock JWT via `X-Mock-User-Id` header

### Authorization
- **Ownership Enforcement**: User can only update their own preferences via RLS policy (`user_id = auth.uid()`)
- **Row-Level Security (RLS)**: Enabled on `preferences` table; user JWT client ensures only user's row is visible/updatable

### Input Validation
- **Zod Schemas**: Strict type and range validation
  - `active_categories`: UUID format validation, max length 3
  - `report_dow`: integer range 0-6
  - `report_hour`: integer range 0-23
  - `max_daily_notes`: integer range 1-10
  - `preferred_delivery_channels`: enum validation against allowed values
- **Business Logic Validation**: Category existence check prevents reference to non-existent categories
- **No Injection Risk**: Supabase parameterized queries prevent SQL injection

### Data Privacy
- **No PII Exposure**: Response contains only user_id (UUID) and system metadata
- **Audit Trail**: Client can track updates via `updated_at` timestamp
- **No Logging of Sensitive Data**: Avoid logging actual preference values; log only operation success/error codes

### Rate Limiting
- **Scope**: Per-user rate limiting should be configured at API gateway
- **Recommendation**: Stricter limit for preferences writes (e.g., 10/minute per user)

---

## 6. Error Handling

### Error Categorization & Handling Strategy

#### Validation Errors (400/422)

**Zod Validation Failures** (during body parsing):
- Trap `ZodError` in controller
- Extract all field-level errors
- Return 400 if structural issue (missing required field)
- Return 422 if constraint violated (value out of range, invalid enum)
- Include error details object with field names and reasons

**Category Existence Failures**:
- Query `categories` for all UUIDs in request
- If any UUID not found, return 422 with details mapping missing UUIDs to error reason
- Example: `"active_categories": "Category with ID {uuid} does not exist"`

#### Authorization Errors (401)

**Missing/Invalid JWT**:
- Handled by auth middleware before reaching this endpoint
- Returns 401 with code `JWT_INVALID` or `AUTH_HEADER_MISSING`

#### Not Found Errors (404)

**Preferences Record Not Found**:
- After auth, if querying user's preferences returns null (edge case)
- Return 404 with code `PREFERENCES_NOT_FOUND`
- This is rare as preferences should be created with profile

#### Server Errors (500)

**Database Connectivity Issues**:
- Connection pool exhausted, network timeout
- Log full error context with user_id and timestamp
- Return generic 500 response (no details to client)

**Unexpected Service Failures**:
- Supabase client initialization errors
- Response parsing failures
- Log with full stack trace for debugging

### Implementation Pattern

```typescript
try {
  // 1. Validate JWT (middleware already done)
  if (!req.auth) {
    return res.status(401).json({...});
  }

  // 2. Validate body
  let validated;
  try {
    validated = UpdatePreferencesCommandSchema.parse(req.body);
  } catch (e) {
    if (e instanceof ZodError) {
      // Determine if 400 or 422
      // Return appropriate error
    }
  }

  // 3. Call service
  const updated = await preferencesService.updatePreferences(req.auth.userId, validated);

  // 4. Success
  return res.status(200).json(updated);

} catch (err) {
  // Handle service errors
  if (err instanceof PreferencesNotFoundError) {
    return res.status(404).json({...});
  }
  if (err instanceof InvalidCategoriesError) {
    return res.status(422).json({...});
  }
  
  console.error('Preferences update error', err);
  return res.status(500).json({...});
}
```

---

## 7. Performance Considerations

### Database Query Optimization

#### Category Existence Check
- **Query**: `SELECT id FROM categories WHERE id = ANY($1::uuid[])`
- **Optimization**: Use index on `categories.id` (PK)
- **Result Count**: If result count < requested UUIDs, some are missing
- **Batch Query**: Fetch all UUIDs in single query, not N queries

#### Preferences Update
- **Query**: `UPDATE preferences SET {...} WHERE user_id = $1 RETURNING *`
- **Optimization**: User_id is PK, so single direct row access (O(1))
- **RLS**: RLS policy enforces user_id check in WHERE clause

### Caching Strategy
- **No client-side cache required**: Preferences is user-specific and update is synchronous
- **No server-side cache invalidation needed**: Preferences changes are infrequent
- **Consider**: Dashboard cache (if used) should be invalidated on preferences update

### Latency Profile
- **Expected**: ~200-500ms per request
  - JWT validation: ~50ms
  - Category validation: ~50ms
  - Database update: ~50-100ms
  - Network/serialization: ~50ms
- **Bottleneck**: Supabase network latency (outside API server control)

### Concurrent Request Handling
- **Update Conflict**: If two PUT requests arrive simultaneously, Postgres will serialize them
- **Last-Write-Wins**: Later request's values overwrite earlier (acceptable for preferences)
- **No Optimistic Locking**: Not needed for this use case

---

## 8. Implementation Steps

### Step 1: Create Zod Schema for Request Validation
**File**: `src/validation/preferences.ts`

Create validation schema for update preferences request:
- Validate active_categories as array of UUIDs with max length 3
- Validate report_dow as integer 0-6
- Validate report_hour as integer 0-23
- Validate preferred_delivery_channels as array of enum values
- Validate email_unsubscribed_at as ISO datetime string or null
- Validate max_daily_notes as integer 1-10

**Validation Should**:
- Reject structural issues with default Zod messages
- Provide custom error messages for constraint violations
- Support `.parse()` and `.safeParse()` patterns

### Step 2: Create PreferencesService
**File**: `src/services/preferences.service.ts`

Implement service class with:

**Constructor**:
- Accept Supabase client (user-scoped via JWT) and admin client (for category lookup)

**Methods**:

`async validateCategories(categoryIds: UUID[]): Promise<void>`
- Query categories table for existence of all UUIDs
- If any missing, throw `InvalidCategoriesError` with details
- Use index on categories.id for performance

`async updatePreferences(userId: UUID, command: UpdatePreferencesCommand): Promise<PreferencesDto>`
- Validate categories exist
- Execute UPDATE query: `from('preferences').update(command).eq('user_id', userId).select().single()`
- If no row returned, throw `PreferencesNotFoundError`
- Return updated row as PreferencesDto

**Error Classes**:
- `PreferencesNotFoundError`: Throw when preferences record not found
- `InvalidCategoriesError`: Throw with details about invalid category UUIDs

### Step 3: Create Controller Handler
**File**: `src/controllers/preferences.controller.ts`

Implement handler: `updatePreferencesHandler`

**Handler Logic**:
1. Check `req.auth` exists; return 401 if missing
2. Parse request body with `UpdatePreferencesCommandSchema.parse()`
   - Catch `ZodError` and determine if 400 (structural) or 422 (constraint)
   - Extract all field errors for details object
3. Initialize PreferencesService with user's JWT client
4. Call `preferencesService.updatePreferences(req.auth.userId, validated)`
5. Return 200 with PreferencesDto
6. Catch errors:
   - `PreferencesNotFoundError` → 404
   - `InvalidCategoriesError` → 422 with field details
   - Other errors → 500 with log

**Error Response Construction**:
- For Zod errors: Extract all field-level errors into `details` object
- For category errors: Map invalid UUIDs to error reason
- For server errors: Log full error, return generic message to client

### Step 4: Create Router Endpoint
**File**: `src/routes/preferences.router.ts`

Create Express router with:

```typescript
const router = Router();

router.put('/', authMiddleware, updatePreferencesHandler);

export default router;
```

### Step 5: Register Router in App
**File**: `src/index.ts`

Add import and route registration:
```typescript
import preferencesRouter from './routes/preferences.router.js';
// ...
app.use('/api/preferences', preferencesRouter);
```

**Order**: Register before 404 handler; ensure `authMiddleware` is applied to all preferences routes.

### Step 6: Create Unit Tests (Optional but Recommended)
**File**: `src/controllers/preferences.controller.spec.ts` and `src/services/preferences.service.spec.ts`

**Test Cases**:
- Valid update with all fields
- Valid update with null email_unsubscribed_at
- Valid update with empty active_categories
- Invalid: report_dow out of range (400)
- Invalid: report_hour out of range (400)
- Invalid: max_daily_notes out of range (400)
- Invalid: active_categories exceeds 3 (400)
- Invalid: active_categories contains non-existent UUID (422)
- Invalid: preferred_delivery_channels contains invalid enum (400)
- Invalid: missing required field (400)
- Unauthorized: missing JWT (401 from middleware)
- Server error: database unavailable (500)

### Step 7: Integration Testing
Test the full flow:
- Start backend server
- Make PUT request with valid token
- Verify preferences updated in database
- Verify response includes updated_at with new timestamp
- Verify concurrent requests are handled correctly

### Step 8: Document and Deploy
- Update OpenAPI/Swagger spec with endpoint schema
- Add endpoint to API documentation
- Deploy to staging environment
- Perform smoke tests
- Deploy to production

---

## Implementation Checklist

### Core Implementation
- [ ] Create `src/validation/preferences.ts` with Zod schema
- [ ] Create `src/services/preferences.service.ts` with validation and update logic
- [ ] Create `src/controllers/preferences.controller.ts` with request handler
- [ ] Create `src/routes/preferences.router.ts` with PUT route
- [ ] Register preferences router in `src/index.ts`

### Validation & Error Handling
- [ ] Implement Zod schema with all constraints
- [ ] Create custom error classes (PreferencesNotFoundError, InvalidCategoriesError)
- [ ] Implement comprehensive error handling in controller
- [ ] Test all error scenarios

### Testing
- [ ] Write unit tests for PreferencesService
- [ ] Write unit tests for controller handler
- [ ] Write integration tests for full endpoint
- [ ] Test validation errors (400, 422)
- [ ] Test authorization (401)
- [ ] Test concurrent requests

### Documentation
- [ ] Update OpenAPI spec
- [ ] Add request/response examples to API docs
- [ ] Document error codes and meanings
- [ ] Add implementation notes for future maintainers

---

## Tech Stack References

- **Framework**: Express.js (TypeScript)
- **Validation**: Zod
- **Database**: Supabase (PostgreSQL) with RLS
- **Authentication**: JWT (Supabase)
- **Language**: TypeScript 5.9.3
- **Runtime**: Node.js

---

## References

- API Specification: `/api/preferences` endpoint in api-plan.md
- Database Schema: `preferences` table definition in db-plan.md
- Type Definitions: `UpdatePreferencesCommand` and `PreferencesDto` in src/types.ts
- Existing Patterns: See `src/controllers/auth.controller.ts` and `src/services/auth.service.ts` for reference implementation style
