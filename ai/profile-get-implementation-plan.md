# API Endpoint Implementation Plan: Profile Management

## 1. Endpoint Overview

This implementation covers two REST API endpoints for user profile management:

- **GET `/api/profile`**: Retrieves the current authenticated user's profile information including user ID, timezone, and timestamps
- **PUT `/api/profile`**: Updates the current authenticated user's profile (timezone only)

These endpoints provide core profile CRUD operations with full authentication enforcement and timezone validation. The profile is 1:1 with the user and is created automatically during sign-up.

---

## 2. Request Details

### 2.1 GET /api/profile

| Aspect                  | Details                              |
| ----------------------- | ------------------------------------ |
| **HTTP Method**         | GET                                  |
| **URL Structure**       | `/api/profile`                       |
| **Authentication**      | Required (JWT Bearer token)          |
| **Request Body**        | None                                 |
| **Required Parameters** | None (JWT from Authorization header) |
| **Optional Parameters** | None                                 |

**Authorization Header Format:**

```
Authorization: Bearer <JWT_TOKEN>
```

### 2.2 PUT /api/profile

| Aspect                  | Details                                           |
| ----------------------- | ------------------------------------------------- |
| **HTTP Method**         | PUT                                               |
| **URL Structure**       | `/api/profile`                                    |
| **Authentication**      | Required (JWT Bearer token)                       |
| **Request Body**        | JSON object with timezone                         |
| **Required Parameters** | JWT from Authorization header, `timezone` in body |
| **Optional Parameters** | None                                              |

**Request Body Schema:**

```json
{
  "timezone": "Europe/Warsaw"
}
```

**Supported Timezone Format:**

- Any valid IANA timezone string (e.g., "UTC", "Europe/Warsaw", "America/New_York", "Asia/Tokyo")
- Database-level constraint validates against Postgres timezone names
- Client-side validation via Zod schema for fast feedback

---

## 3. Used Types

### 3.1 Data Transfer Objects (DTOs)

**ProfileDto** (from `src/types.ts`):

```typescript
export type ProfileDto = Pick<
  Tables<'profiles'>,
  'user_id' | 'timezone' | 'created_at' | 'updated_at'
>;
```

**Structure:**

```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "timezone": "Europe/Warsaw",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-02T10:00:00Z"
}
```

### 3.2 Command Models

**UpdateProfileCommand** (from `src/types.ts`):

```typescript
export type UpdateProfileCommand = Required<Pick<TablesUpdate<'profiles'>, 'timezone'>>;
```

This ensures the timezone field is required at the API boundary while database-level defaults still apply.

### 3.3 Error Response DTO

**ErrorResponseDto** (from `src/types.ts`):

```typescript
export type ErrorResponseDto = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
```

---

## 4. Response Details

### 4.1 Successful Responses

**GET /api/profile - 200 OK**

```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "timezone": "Europe/Warsaw",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-02T10:00:00Z"
}
```

**PUT /api/profile - 200 OK**

```json
{
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "timezone": "Europe/Warsaw",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-02T10:00:10Z"
}
```

### 4.2 Error Responses

**401 Unauthorized - Missing/Invalid JWT**

```json
{
  "error": {
    "code": "JWT_INVALID",
    "message": "Invalid credentials"
  }
}
```

**400 Bad Request - Structural Validation Error**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body validation failed",
    "details": {
      "timezone": "Expected string, received number"
    }
  }
}
```

**422 Unprocessable Entity - Constraint Validation Error**

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Profile validation failed",
    "details": {
      "timezone": "Invalid timezone: America/InvalidCity"
    }
  }
}
```

**404 Not Found - Profile Not Initialized**

```json
{
  "error": {
    "code": "PROFILE_NOT_FOUND",
    "message": "User profile not found"
  }
}
```

**500 Internal Server Error**

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "Unexpected server error"
  }
}
```

---

## 5. Data Flow

### 5.1 GET /api/profile Flow

```
Client Request (GET /api/profile with Authorization header)
  ↓
Auth Middleware (validate JWT)
  ↓
Extract user ID from authenticated context
  ↓
Profile Controller (getProfileHandler)
  ↓
Create user-scoped Supabase client (enforces RLS)
  ↓
Profile Service (getProfile)
  ↓
Query: SELECT * FROM profiles WHERE user_id = ${userId}
  ↓
Return ProfileDto
  ↓
Controller: res.status(200).json(profileDto)
```

### 5.2 PUT /api/profile Flow

```
Client Request (PUT /api/profile with Authorization header + JSON body)
  ↓
Auth Middleware (validate JWT)
  ↓
Express JSON parser (parse request body)
  ↓
Profile Controller (updateProfileHandler)
  ↓
Validate request body with Zod schema
  ↓
Create user-scoped Supabase client (enforces RLS)
  ↓
Profile Service (updateProfile)
  ↓
Validate timezone against known valid timezones (optional DB-level check)
  ↓
Query: UPDATE profiles SET timezone = ${timezone}, updated_at = now() WHERE user_id = ${userId}
  ↓
Return updated ProfileDto
  ↓
Controller: res.status(200).json(updatedProfileDto)
```

### 5.3 Service Interactions

**ProfileService** responsibilities:

- Query profile data from Supabase
- Update profile in Supabase
- Throw custom errors for not-found scenarios
- Leverage user-scoped client for RLS enforcement

**Database Interactions:**

- User-scoped client ensures RLS policies enforce data isolation
- Service never queries data for users other than the authenticated user
- Supabase handles all SQL generation and parameterization

---

## 6. Security Considerations

### 6.1 Authentication & Authorization

1. **JWT Validation**: Auth middleware validates JWT token and extracts user ID
2. **User Scoping**: Create user-scoped Supabase client with user's JWT
3. **Row-Level Security (RLS)**: Supabase RLS policies enforce that users can only access their own profiles
4. **Development Mode**: Auth middleware supports DEV_MODE for testing with mock users

### 6.2 Input Validation

1. **Timezone Validation**:
   - Client-side: Zod schema validates format and against known timezone values
   - Server-side: Database constraint validates timezone against Postgres timezone names
   - Error differentiation: Structural errors (400) vs constraint violations (422)

2. **JSON Schema Enforcement**:
   - Use Zod for strict schema validation
   - `.strict()` on schema ensures no extra fields accepted
   - Clear error messages for validation failures

### 6.3 Data Protection

1. **No Sensitive Exposure**: Profile DTO only exposes user_id, timezone, and timestamps
2. **User Isolation**: RLS policies prevent cross-user access
3. **Parameter Binding**: Supabase client handles all parameterized queries (no SQL injection risk)
4. **Error Messages**: Generic error messages in production, detailed logs for debugging

### 6.4 Threat Mitigations

| Threat              | Mitigation                                |
| ------------------- | ----------------------------------------- |
| Unauthorized Access | JWT validation + auth middleware          |
| RLS Bypass          | User-scoped client enforces RLS policies  |
| Data Leakage        | Limited DTO exposure + RLS isolation      |
| Timezone Injection  | Validated against known timezone list     |
| SQL Injection       | Parameterized queries via Supabase client |
| CSRF                | Standard CORS + JWT (stateless)           |

---

## 7. Error Handling

### 7.1 Custom Error Classes

**ProfileNotFoundError**:

```typescript
export class ProfileNotFoundError extends Error {
  constructor(userId: UUID) {
    super(`Profile not found for user ${userId}`);
    this.name = 'ProfileNotFoundError';
  }
}
```

### 7.2 Error Handling Strategy

| Error Scenario          | HTTP Status | Error Code          | Handling        |
| ----------------------- | ----------- | ------------------- | --------------- |
| Missing JWT             | 401         | JWT_INVALID         | Auth middleware |
| Invalid JWT format      | 401         | AUTH_HEADER_INVALID | Auth middleware |
| Missing timezone field  | 400         | VALIDATION_ERROR    | Zod schema      |
| Timezone wrong type     | 400         | VALIDATION_ERROR    | Zod schema      |
| Invalid timezone value  | 422         | VALIDATION_ERROR    | Zod schema      |
| Profile not found (GET) | 404         | PROFILE_NOT_FOUND   | Service layer   |
| Profile not found (PUT) | 404         | PROFILE_NOT_FOUND   | Service layer   |
| Database error          | 500         | SERVER_ERROR        | Catch block     |
| Unexpected error        | 500         | SERVER_ERROR        | Catch block     |

### 7.3 Error Handling in Controller

1. **Authentication Check**: Return 401 if `req.auth` is undefined
2. **Validation**: Catch ZodError and differentiate between structural (400) and constraint (422) errors
3. **Not Found**: Catch ProfileNotFoundError and return 404
4. **Database Errors**: Generic 500 with logging for unexpected errors
5. **Logging**: Console.error all unexpected exceptions for debugging

---

## 8. Performance Considerations

### 8.1 Optimization Strategies

1. **Indexed Queries**:
   - Profile queries use primary key (user_id)
   - Supabase automatically indexes UUID foreign keys
   - Single-row result expected (1:1 relationship with users)

2. **Connection Pooling**:
   - Supabase handles connection pooling
   - User-scoped clients are lightweight (ephemeral)
   - No N+1 query issues (simple single-table operations)

3. **Response Size**:
   - ProfileDto is minimal (~4 fields)
   - No nested objects or large arrays
   - Suitable for mobile and slow network scenarios

### 8.2 Caching Considerations

- **Client-side**: Frontend may cache profile data with cache headers
- **Server-side**: No caching needed (profile rarely changes)
- **Validation Cache**: Timezone list could be cached if validation becomes expensive

### 8.3 Scalability

- Profile operations are simple CRUD on small records
- No joins or complex queries
- RLS policies enforce automatic partitioning
- Suitable for high concurrency without bottlenecks

---

## 9. Implementation Steps

### Phase 1: Setup & Types

**Step 1.1: Create Validation Schema**

- File: `src/validation/profile.ts`
- Define `UpdateProfileCommandSchema` using Zod
- Validate timezone field against known timezone values
- Use `.strict()` to reject extra fields
- Include clear error messages for each constraint

**Step 1.2: Review Existing Types**

- Verify `ProfileDto` in `src/types.ts` matches database schema
- Verify `UpdateProfileCommand` in `src/types.ts` is correctly defined
- Confirm `ErrorResponseDto` is available for error handling

### Phase 2: Service Layer

**Step 2.1: Create ProfileService Class**

- File: `src/services/profile.service.ts`
- Create `ProfileNotFoundError` class for not-found scenarios
- Implement constructor accepting user-scoped Supabase client
- Method: `getProfile(userId: UUID): Promise<ProfileDto>`
  - Query: `SELECT * FROM profiles WHERE user_id = ${userId}`
  - Handle PGRST116 error (no rows) → throw ProfileNotFoundError
  - Return ProfileDto
- Method: `updateProfile(userId: UUID, command: UpdateProfileCommand): Promise<ProfileDto>`
  - Query: `UPDATE profiles SET timezone = ${timezone}, updated_at = now() WHERE user_id = ${userId}`
  - Handle PGRST116 error (no rows) → throw ProfileNotFoundError
  - Return updated ProfileDto

### Phase 3: Controller Layer

**Step 3.1: Create Controller Handlers**

- File: `src/controllers/profile.controller.ts`
- Implement `getProfileHandler(req: Request, res: Response): Promise<void>`
  - Verify `req.auth` exists, return 401 if missing
  - Create user-scoped Supabase client
  - Call service.getProfile()
  - Return 200 with ProfileDto
  - Catch ProfileNotFoundError → 404
  - Catch unexpected errors → 500 with logging
- Implement `updateProfileHandler(req: Request, res: Response): Promise<void>`
  - Verify `req.auth` exists, return 401 if missing
  - Validate request body with UpdateProfileCommandSchema
  - Differentiate ZodError: structural (400) vs constraint (422)
  - Create user-scoped Supabase client
  - Call service.updateProfile()
  - Return 200 with updated ProfileDto
  - Catch ProfileNotFoundError → 404
  - Catch unexpected errors → 500 with logging

### Phase 4: Router Integration

**Step 4.1: Create Router**

- File: `src/routes/profile.router.ts`
- Import handlers and auth middleware
- `GET /` → authMiddleware → getProfileHandler
- `PUT /` → authMiddleware → updateProfileHandler
- Export router for mounting in main app

**Step 4.2: Mount Router in Main App**

- File: `src/index.ts`
- Import profile router
- Mount at `/api/profile` path
- Verify auth middleware is applied before route handlers

### Phase 5: Validation & Testing

**Step 5.1: Manual Testing**

- Test GET with valid JWT → 200 with ProfileDto
- Test GET without JWT → 401
- Test GET with invalid JWT → 401
- Test PUT with valid JWT and timezone → 200 with updated ProfileDto
- Test PUT with missing timezone field → 400
- Test PUT with invalid timezone value → 422
- Test PUT for non-existent profile → 404 (profile not created yet)

**Step 5.2: Integration Testing**

- Create integration test file: `src/routes/profile.router.integration.spec.ts`
- Test full request/response cycle with mock Supabase client
- Verify error handling at each layer
- Test RLS enforcement (user cannot access other user's profile)

**Step 5.3: Error Scenarios Testing**

- Database connection failures
- RLS policy violations (if RLS bypass attempted)
- Malformed requests
- Missing required fields
- Invalid field types

### Phase 6: Documentation

**Step 6.1: Update API Documentation**

- Add profile endpoints to API reference
- Include example cURL commands
- Document all error codes and meanings
- Add timezone examples

**Step 6.2: Create cURL Quick Reference**

- Example GET request
- Example PUT request with different timezones
- Examples with mock user headers for development

### Phase 7: Deployment & Monitoring

**Step 7.1: Pre-deployment Checklist**

- All tests passing
- No console.log statements in production (use structured logging)
- Environment variables configured
- Error messages appropriate for users
- Performance acceptable under load

**Step 7.2: Monitoring**

- Log all 5xx errors with full context
- Monitor profile update latency
- Track authentication failures
- Set alerts for unexpected error rates

---

## Implementation Checklist

### Files to Create:

- [ ] `src/validation/profile.ts` - Validation schema
- [ ] `src/services/profile.service.ts` - Business logic
- [ ] `src/controllers/profile.controller.ts` - Request handlers
- [ ] `src/routes/profile.router.ts` - Route definitions
- [ ] `src/routes/profile.router.integration.spec.ts` - Integration tests (optional)

### Files to Modify:

- [ ] `src/index.ts` - Mount profile router at `/api/profile`

### Validation Checklist:

- [ ] All types properly exported and imported
- [ ] Schema validation covers all constraints
- [ ] Error messages are clear and actionable
- [ ] Auth middleware is applied to routes
- [ ] RLS policies are verified in Supabase
- [ ] Timezone validation matches database constraints

### Testing Checklist:

- [ ] GET successful retrieval
- [ ] GET authentication required
- [ ] PUT successful update
- [ ] PUT validation errors
- [ ] PUT authentication required
- [ ] Error responses have correct structure
- [ ] Error responses have correct status codes

---

## Notes & Considerations

### Timezone Handling

- Postgres has built-in timezone validation
- Consider caching known timezones list for faster client-side validation
- Timezone is stored as TEXT, not TIMESTAMPTZ (it's a user preference, not a timestamp)

### Profile Initialization

- Profile is created automatically during sign-up (backend or trigger)
- GET will return 404 if profile not yet initialized
- PUT will also return 404 if profile not yet initialized
- Consider adding a separate endpoint to initialize profile if needed

### Future Enhancements

- Add profile fields: full_name, avatar_url, bio, etc.
- Add profile picture upload endpoint
- Add profile preferences beyond timezone
- Add profile deletion endpoint
- Add profile history/audit trail

### Development Mode

- Auth middleware supports mock users via X-Mock-User-Id header
- Useful for frontend testing without valid JWT
- Remove DEV_MODE logic before production deployment

### Related Endpoints

- GET `/api/me` - Returns authenticated user info (includes hasProfile flag)
- POST `/api/auth/signin` - Returns new user; profile created post-signup
- Other profile-related endpoints follow same patterns
