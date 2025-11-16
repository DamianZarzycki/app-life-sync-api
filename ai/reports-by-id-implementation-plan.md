# API Endpoint Implementation Plan: GET `/api/reports/{id}`

## 1. Endpoint Overview

The `GET /api/reports/{id}` endpoint retrieves a single report by its UUID for the authenticated user. This endpoint allows users to view a complete report object with all its details including generated content, metadata, and category snapshots.

**Purpose**: Allow users to retrieve and view individual reports they own.

**Key Features**:

- Retrieve full report details by ID
- Ownership verification (via RLS and user context)
- Soft-delete support (excludes deleted reports from retrieval)
- User-scoped data access (cannot access other users' reports)
- Input validation for UUID format

---

## 2. Request Details

### HTTP Method & URL

- **Method**: GET
- **URL**: `/api/reports/{id}`
- **Authentication**: Required (Bearer JWT via Authorization header)

### Path Parameters

| Parameter | Type | Required | Constraints       | Notes                                           |
| --------- | ---- | -------- | ----------------- | ----------------------------------------------- |
| `id`      | UUID | Yes      | Valid UUID format | The unique identifier of the report to retrieve |

### Query Parameters

None

### Request Body

None

### Example Requests

**Basic request to retrieve a report**:

```
GET /api/reports/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
Authorization: Bearer <jwt_token>
```

**Using curl**:

```bash
curl -X GET https://api.example.com/api/reports/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer <jwt_token>" \
  -H "Content-Type: application/json"
```

---

## 3. Used Types

### DTOs (Data Transfer Objects)

From `src/types.ts`:

1. **ReportDto** (from `Tables<'reports'>`):

   ```typescript
   {
     id: UUID; // UUID of the report
     user_id: UUID; // User who owns the report
     generated_by: GeneratedBy; // 'scheduled' | 'on_demand'
     html: string; // HTML content of the report
     text_version: string | null; // Plain text version of report
     pdf_path: string | null; // Path to PDF file (if generated)
     llm_model: string | null; // LLM model used for generation
     system_prompt_version: string | null; // System prompt version used
     categories_snapshot: JSONB; // Snapshot of categories included in report
     created_at: string; // ISO datetime when created
     updated_at: string; // ISO datetime when last updated
     deleted_at: string | null; // ISO datetime if soft-deleted
   }
   ```

2. **ErrorResponseDto**:

   ```typescript
   {
     error: {
       code: string;                        // Machine-readable error code
       message: string;                     // Human-readable error message
       details?: Record<string, unknown>;   // Optional validation details
     }
   }
   ```

3. **ReportNotFoundError** (Custom Error):
   - Thrown when report doesn't exist or user doesn't own it
   - Contains `reportId` property for debugging

---

## 4. Response Details

### Success Response (200 OK)

**Status Code**: 200 OK

**Response Body**: Full ReportDto object

**Example**:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "660e8400-e29b-41d4-a716-446655440001",
  "generated_by": "scheduled",
  "html": "<html><body>...</body></html>",
  "text_version": "Weekly report...",
  "pdf_path": "/reports/550e8400-e29b-41d4-a716-446655440000.pdf",
  "llm_model": "gpt-4",
  "system_prompt_version": "v1.0",
  "categories_snapshot": ["uuid1", "uuid2", "uuid3"],
  "created_at": "2025-01-20T02:00:00Z",
  "updated_at": "2025-01-20T02:00:00Z",
  "deleted_at": null
}
```

### Error Responses

#### 400 Bad Request

**Condition**: Invalid UUID format in path parameter

**Response**:

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

#### 401 Unauthorized

**Condition**: Missing or invalid authentication token

**Response**:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

#### 404 Not Found

**Condition**: Report doesn't exist or user doesn't own it

**Response**:

```json
{
  "error": {
    "code": "REPORT_NOT_FOUND",
    "message": "Report not found"
  }
}
```

#### 500 Server Error

**Condition**: Unexpected server errors

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

### Request Processing Flow

```
1. HTTP GET request arrives at /api/reports/:id
   ↓
2. Express route matches and passes to authMiddleware
   ↓
3. authMiddleware validates JWT token
   ├─ If invalid/missing → 401 Unauthorized response
   └─ If valid → extract userId and jwt, continue
   ↓
4. Route handler (getReportHandler) receives request
   ↓
5. Validate path parameter (UUID format)
   ├─ If invalid → 400 Bad Request response
   └─ If valid → continue
   ↓
6. Create user-scoped Supabase client with user JWT
   ↓
7. Call ReportsService.getReportById(userId, reportId)
   ↓
8. Service queries reports table:
   SELECT * FROM reports
   WHERE id = reportId
   AND deleted_at IS NULL
   ├─ RLS enforces: user_id = auth.uid()
   └─ If no rows → throw ReportNotFoundError
   ↓
9. Service returns ReportDto
   ↓
10. Handler returns 200 OK with ReportDto
```

### Database Query Details

**Query Type**: Single-row lookup with soft-delete filter

**Supabase Client Method**: `.select('*').eq('id', reportId).is('deleted_at', null).single()`

**RLS Policy Enforced**: User can only retrieve their own reports

**Expected Query Time**: < 50ms (indexed on id and user_id)

---

## 6. Security Considerations

### Authentication

- **Requirement**: JWT token in Authorization header (Bearer scheme)
- **Enforcement**: `authMiddleware` validates JWT via Supabase
- **User Context**: JWT extracted to get userId for RLS enforcement
- **Missing Token**: Endpoint returns 401 Unauthorized

### Authorization

- **Ownership Check**: RLS policies ensure users can only access their own reports
- **Soft Delete**: Deleted reports are excluded from retrieval (privacy protection)
- **User Scope**: Supabase client is user-scoped with JWT credentials

### Input Validation

- **UUID Format**: Path parameter validated with regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
- **Type Safety**: TypeScript ensures type safety at compile time
- **Zod Integration**: Input validation framework (if extended to body/query params)

### Data Protection

- **No Information Leakage**: 404 response doesn't distinguish between "not found" and "not owned"
- **Error Messages**: Generic error messages don't expose system details
- **HTTPS Enforcement**: Should be enforced at deployment level (not in code)
- **CORS**: Configured to restrict cross-origin access (via CORS middleware)

### Threat Mitigation

| Threat               | Mitigation                                         |
| -------------------- | -------------------------------------------------- |
| Unauthorized Access  | JWT authentication + RLS policies                  |
| Invalid UUID         | Regex validation before DB query                   |
| SQL Injection        | Parameterized queries via Supabase SDK             |
| Resource Enumeration | Generic 404 response (doesn't leak existence)      |
| Timing Attacks       | RLS enforces at database level (consistent timing) |
| CSRF                 | JWT-based (stateless, not vulnerable to CSRF)      |

---

## 7. Error Handling

### Error Scenarios and Handling

| Scenario                  | HTTP Status | Error Code       | Message                      | Root Cause                          |
| ------------------------- | ----------- | ---------------- | ---------------------------- | ----------------------------------- |
| Missing JWT token         | 401         | UNAUTHORIZED     | Authentication required      | No Authorization header             |
| Invalid JWT token         | 401         | UNAUTHORIZED     | Authentication required      | Failed JWT validation               |
| Malformed UUID            | 400         | VALIDATION_ERROR | Invalid report ID format     | Path param doesn't match UUID regex |
| Report doesn't exist      | 404         | REPORT_NOT_FOUND | Report not found             | No row with given id                |
| User doesn't own report   | 404         | REPORT_NOT_FOUND | Report not found             | RLS policy blocks access            |
| Report is soft-deleted    | 404         | REPORT_NOT_FOUND | Report not found             | deleted_at IS NOT NULL              |
| Database connection error | 500         | SERVER_ERROR     | An unexpected error occurred | DB connection lost                  |
| Query timeout             | 500         | SERVER_ERROR     | An unexpected error occurred | DB query slow/hanging               |
| Supabase API error        | 500         | SERVER_ERROR     | An unexpected error occurred | Upstream API issue                  |

### Error Detection and Response

**In Controller**:

```typescript
try {
  // Validation and service call
} catch (err) {
  if (err instanceof ReportNotFoundError) {
    // Specific handling for 404
    return res.status(404).json({
      error: { code: 'REPORT_NOT_FOUND', message: 'Report not found' },
    });
  }
  // Generic server error fallback
  return res.status(500).json({
    error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
  });
}
```

### Logging

- **Console Logging**: All errors logged to console with context
- **Log Level**: INFO for validation errors, ERROR for server errors
- **Error Details**: Stack traces logged server-side (not sent to client)
- **Future Enhancement**: Structured logging (Pino/Winston) and error tracking (Sentry)

---

## 8. Performance Considerations

### Query Optimization

**Database Indexes**:

- Primary Key: `id` (UUID) - automatically indexed
- Foreign Key: `user_id` (UUID) - indexed for RLS filtering
- Soft Delete: `deleted_at` (TIMESTAMPTZ) - indexed for WHERE clause
- Composite: Consider `(user_id, deleted_at, created_at)` for RLS + soft-delete queries

**Query Plan**:

```sql
SELECT * FROM reports
WHERE id = $1
  AND user_id = (auth.uid() via RLS)
  AND deleted_at IS NULL
```

### Performance Expectations

| Metric          | Expected | Notes                             |
| --------------- | -------- | --------------------------------- |
| Query Time      | < 50ms   | Index lookup on id, user_id       |
| Response Time   | < 100ms  | Includes network latency          |
| Payload Size    | 1-5 KB   | Depends on html/text_version size |
| Connection Pool | 10-20    | Shared across all requests        |
| Memory Usage    | Minimal  | Single-row lookup, no iteration   |

### Potential Bottlenecks

1. **Large HTML Content**: Reports with large `html` field can increase response time
   - Mitigation: Consider storing large content separately or compression

2. **RLS Policy Evaluation**: Complex RLS can slow down queries
   - Mitigation: Ensure RLS policy is simple (direct user_id comparison)

3. **Network Latency**: Supabase API call over network
   - Mitigation: No caching strategy needed (data is fresh)

### Caching Strategy

**Current**: No caching (reports are frequently updated)

**Future Options**:

- Redis cache with 5-minute TTL for frequently accessed reports
- ETag-based caching for conditional GET requests
- Client-side caching with Last-Modified headers

---

## 9. Implementation Steps

### Step 1: Validation Layer (`src/validation/reports.ts`)

- ✅ **Status**: Already implemented
- **File**: `src/validation/reports.ts`
- **Implementation**: UUID format validation is done inline in controller (no Zod schema needed for simple path param)

### Step 2: Service Layer (`src/services/reports.service.ts`)

- ✅ **Status**: Already implemented
- **File**: `src/services/reports.service.ts`
- **Key Method**: `getReportById(userId: UUID, reportId: UUID): Promise<ReportDto>`
- **Features**:
  - User-scoped Supabase client for RLS enforcement
  - Soft-delete filtering (excludes deleted_at != null)
  - ReportNotFoundError thrown on missing report
  - Proper error handling for PGRST116 (no rows returned)

### Step 3: Controller Handler (`src/controllers/reports.controller.ts`)

- ✅ **Status**: Already implemented
- **File**: `src/controllers/reports.controller.ts`
- **Handler**: `getReportHandler`
- **Responsibilities**:
  - Extract userId and JWT from req.auth (after authMiddleware)
  - Validate UUID format in req.params.id
  - Create user-scoped Supabase client
  - Call ReportsService.getReportById()
  - Return 200 OK or appropriate error response

### Step 4: Router/Routes (`src/routes/reports.router.ts`)

- ✅ **Status**: Already implemented
- **File**: `src/routes/reports.router.ts`
- **Route**: `GET /:id`
- **Middleware**: `authMiddleware` (enforces authentication)
- **Handler**: `getReportHandler`

### Step 5: Register in Main App (`src/index.ts`)

- ✅ **Status**: Already implemented
- **File**: `src/index.ts`
- **Line**: `app.use('/api/reports', reportsRouter);`
- **Result**: Endpoint accessible at `/api/reports/{id}`

### Step 6: Build & Compile

```bash
npm run build
# Compiles TypeScript to JavaScript in dist/
# Source maps generated for debugging
```

### Step 7: Type Checking

```bash
npx tsc --noEmit
# Verifies all TypeScript types are correct
# No compilation errors
```

### Step 8: Testing

```bash
# Integration tests
npm run test

# Manual testing with curl
curl -X GET http://localhost:3000/api/reports/{report-uuid} \
  -H "Authorization: Bearer {jwt-token}" \
  -H "Content-Type: application/json"
```

### Step 9: Verification Checklist

- [ ] TypeScript compiles without errors
- [ ] All imports resolve correctly
- [ ] Service layer methods exist and are callable
- [ ] Controller handlers properly structure requests/responses
- [ ] Router correctly maps GET /:id to handler
- [ ] Authentication middleware is applied
- [ ] Error responses have correct HTTP status codes
- [ ] UUID validation regex works for valid/invalid formats
- [ ] RLS policies prevent cross-user access
- [ ] Soft-delete filtering works (no deleted reports returned)

---

## 10. Testing Guide

### Unit Tests

#### 1. Service Layer (`ReportsService.getReportById`)

**Test Case: Valid Report Retrieval**

```typescript
it('should retrieve report when user owns it', async () => {
  const reportId = 'valid-uuid';
  const userId = 'user-uuid';

  const result = await service.getReportById(userId, reportId);

  expect(result).toBeDefined();
  expect(result.id).toBe(reportId);
  expect(result.user_id).toBe(userId);
});
```

**Test Case: Report Not Found**

```typescript
it('should throw ReportNotFoundError when report does not exist', async () => {
  const reportId = 'non-existent-uuid';
  const userId = 'user-uuid';

  await expect(service.getReportById(userId, reportId)).rejects.toThrow(ReportNotFoundError);
});
```

**Test Case: Access Denied (Non-Owner)**

```typescript
it('should throw ReportNotFoundError when user does not own report', async () => {
  const reportId = 'other-users-report-uuid';
  const userId = 'different-user-uuid';

  await expect(service.getReportById(userId, reportId)).rejects.toThrow(ReportNotFoundError);
});
```

### Integration Tests

#### 1. Full Endpoint Test

**Test Case: Valid Request with Auth**

```typescript
it('GET /api/reports/:id returns 200 for valid request', async () => {
  const response = await request(app)
    .get(`/api/reports/${reportId}`)
    .set('Authorization', `Bearer ${jwtToken}`);

  expect(response.status).toBe(200);
  expect(response.body.id).toBe(reportId);
});
```

**Test Case: Missing Auth Header**

```typescript
it('GET /api/reports/:id returns 401 without auth header', async () => {
  const response = await request(app).get(`/api/reports/${reportId}`);

  expect(response.status).toBe(401);
  expect(response.body.error.code).toBe('UNAUTHORIZED');
});
```

**Test Case: Invalid UUID Format**

```typescript
it('GET /api/reports/:id returns 400 for invalid UUID', async () => {
  const response = await request(app)
    .get(`/api/reports/not-a-uuid`)
    .set('Authorization', `Bearer ${jwtToken}`);

  expect(response.status).toBe(400);
  expect(response.body.error.code).toBe('VALIDATION_ERROR');
});
```

**Test Case: Report Not Found**

```typescript
it('GET /api/reports/:id returns 404 when report does not exist', async () => {
  const response = await request(app)
    .get(`/api/reports/00000000-0000-0000-0000-000000000000`)
    .set('Authorization', `Bearer ${jwtToken}`);

  expect(response.status).toBe(404);
  expect(response.body.error.code).toBe('REPORT_NOT_FOUND');
});
```

### Manual Testing with cURL

**1. Valid Request**:

```bash
curl -X GET "http://localhost:3000/api/reports/550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json"
```

**2. Invalid UUID**:

```bash
curl -X GET "http://localhost:3000/api/reports/invalid-uuid" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json"
```

**3. Missing Auth Header**:

```bash
curl -X GET "http://localhost:3000/api/reports/550e8400-e29b-41d4-a716-446655440000" \
  -H "Content-Type: application/json"
```

**4. Non-Existent Report**:

```bash
curl -X GET "http://localhost:3000/api/reports/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -H "Content-Type: application/json"
```

---

## 11. Code Review Checklist

### Architecture & Design

- [ ] Service layer properly encapsulates business logic
- [ ] Error handling is consistent with project patterns
- [ ] No business logic in controller (thin controller)
- [ ] Dependencies are injected (not hardcoded)
- [ ] Separation of concerns is maintained

### Security

- [ ] JWT authentication enforced via middleware
- [ ] RLS policies enforced at database level
- [ ] UUID validation prevents invalid queries
- [ ] No sensitive data in error messages
- [ ] No SQL injection vulnerabilities

### Code Quality

- [ ] TypeScript types are strict (no `any`)
- [ ] Error messages are clear and actionable
- [ ] Code follows project naming conventions
- [ ] Comments explain non-obvious logic
- [ ] No dead code or commented-out sections

### Performance

- [ ] Queries use indexed columns
- [ ] No N+1 queries
- [ ] Response payload is minimal
- [ ] No blocking operations in handler

### Testing

- [ ] Unit tests cover happy path
- [ ] Unit tests cover error scenarios
- [ ] Integration tests verify endpoint behavior
- [ ] Manual tests confirm functionality
- [ ] Edge cases are tested

---

## 12. Deployment Considerations

### Pre-Deployment

1. ✅ TypeScript compilation passes
2. ✅ All tests pass (unit + integration)
3. ✅ No linting errors
4. ✅ Environment variables configured
5. ✅ Database migrations applied
6. ✅ RLS policies are enabled

### Deployment Steps

1. Build: `npm run build`
2. Test: `npm run test`
3. Deploy to DigitalOcean (CI/CD via GitHub Actions)
4. Verify: Health check at `/api/health`
5. Monitor: Check error logs and response times

### Post-Deployment

1. Monitor API logs for errors
2. Check response time metrics
3. Verify RLS policies are working
4. Test endpoint with production data
5. Set up alerts for 500 errors

### Rollback Plan

- If critical errors occur, rollback to previous Git commit
- GitHub Actions will automatically redeploy
- Database migrations are backward compatible

---

## 13. Future Enhancements

### Short Term (v1.1)

- [ ] Add detailed reporting with structured logging
- [ ] Implement error tracking (Sentry)
- [ ] Add response compression for large reports

### Medium Term (v1.2)

- [ ] Implement Redis caching for frequently accessed reports
- [ ] Add ETag-based caching support
- [ ] Optimize large HTML payloads

### Long Term (v2.0)

- [ ] Pagination for report sections
- [ ] Full-text search across report content
- [ ] Report version history
- [ ] Report collaboration/sharing features

---

## Summary

The `GET /api/reports/{id}` endpoint is a straightforward single-resource retrieval endpoint that:

1. **Authenticates** users via JWT tokens
2. **Validates** UUID format in path parameter
3. **Retrieves** report from database with RLS enforcement
4. **Handles** errors appropriately with correct HTTP status codes
5. **Returns** full ReportDto for successful requests

The implementation follows established project patterns, provides robust security, and is ready for production deployment.
