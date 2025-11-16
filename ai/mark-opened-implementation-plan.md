# API Endpoint Implementation Plan: POST /api/report-deliveries/{id}/mark-opened

## 1. Endpoint Overview

**Purpose**: Mark a report delivery as opened for in-app delivery tracking.

This endpoint enables users to record when they've opened/viewed a report delivery. It updates the delivery status from 'queued' or 'sent' to 'opened' and records the exact timestamp of the open event. This feature is essential for tracking report engagement metrics and user interaction with delivered reports.

**Key Characteristics**:

- Requires authentication (JWT token)
- Idempotent operation (safe to call multiple times)
- Updates a single delivery record
- Returns 204 No Content on success

---

## 2. Request Details

### HTTP Method

`POST`

### URL Structure

```
/api/report-deliveries/{id}/mark-opened
```

### URL Parameters

- **id** (required, path parameter)
  - Type: UUID (string)
  - Format: `{8}-{4}-{4}-{4}-{12}` (RFC 4122)
  - Description: Unique identifier of the report delivery to mark as opened
  - Example: `550e8400-e29b-41d4-a716-446655440000`

### Headers

- **Authorization** (required)
  - Type: Bearer token
  - Format: `Bearer <JWT_TOKEN>`
  - Description: Valid JWT token from Supabase authentication

### Request Body

- **None** - This is a POST action with no body payload

### Content-Type

- Request: `application/json` (empty body)
- Response: No content (204)

---

## 3. Response Details

### Success Response: 204 No Content

```
HTTP/1.1 204 No Content
```

**Characteristics**:

- Empty response body
- Headers only (no JSON payload)
- Indicates successful mark-opened operation
- Idempotent - calling multiple times with same delivery ID returns 204

### Error Responses

#### 400 Bad Request: Invalid UUID Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid delivery ID format",
    "details": {
      "id": "Delivery ID must be a valid UUID"
    }
  }
}
```

**Trigger**: Path parameter `id` is not a valid UUID format.

---

#### 401 Unauthorized: Missing or Invalid Authentication

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
- Invalid/expired JWT token
- Token signature verification fails

---

#### 404 Not Found: Delivery Not Found or User Doesn't Own It

```json
{
  "error": {
    "code": "DELIVERY_NOT_FOUND",
    "message": "Report delivery not found"
  }
}
```

**Trigger**:

- Delivery with given ID doesn't exist
- User doesn't own the delivery (RLS policy blocks access)
- Delivery was soft-deleted

---

#### 500 Internal Server Error

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

**Trigger**:

- Database connection failure
- Unexpected Supabase errors
- Service layer exceptions

---

## 4. Data Flow

### Request Flow Diagram

```
Request: POST /api/report-deliveries/{id}/mark-opened
  ↓
Express Router (report-deliveries.router.ts)
  ↓
Authentication Middleware (authMiddleware)
  - Validates JWT token
  - Extracts user_id and JWT from token
  - Attaches req.auth { userId, jwt }
  ↓
Controller Handler (report-deliveries.controller.ts: markOpenedHandler)
  - Verifies req.auth exists (401 check)
  - Validates path parameter id as UUID (400 check)
  ↓
Service Layer (ReportDeliveriesService.markDeliveryOpened)
  - Verifies delivery exists and user owns it
  - Updates delivery status to 'opened' with opened_at timestamp
  - Returns void on success
  - Throws DeliveryNotFoundError if not found (404)
  ↓
Supabase Client (user-scoped with RLS)
  - Executes UPDATE query with RLS policy enforcement
  - RLS ensures only delivery rows where user_id matches current user can be updated
  ↓
Response: 204 No Content
```

### Data Interactions

1. **Authentication Check**: Verify JWT in Authorization header
2. **Path Validation**: Validate UUID format of delivery ID
3. **Database Query**:
   - Fetch delivery to verify existence and ownership
   - Update delivery record with new status and timestamp
4. **RLS Enforcement**: Supabase RLS policies prevent cross-user access

### Timestamp Handling

- **opened_at**: Set to `now()` (current server timestamp in TIMESTAMPTZ format)
- All timestamps are timezone-aware (TIMESTAMPTZ in database)
- Frontend should interpret timestamps as UTC

---

## 5. Security Considerations

### Authentication & Authorization

1. **Authentication**:
   - All requests must include valid JWT token
   - Token validated by authMiddleware before controller
   - Invalid/expired tokens return 401

2. **Authorization - Row-Level Security**:
   - User-scoped Supabase client enforces RLS via user JWT
   - RLS policy on `report_deliveries` table ensures users can only access their own records
   - SQL policy condition: `user_id = auth.uid()`
   - Double verification in service layer for defense-in-depth

3. **Ownership Verification**:
   - Delivery must belong to authenticated user (user_id matches)
   - RLS policies automatically enforce this constraint
   - Service layer performs explicit check as additional security layer

### Input Validation

1. **UUID Format Validation**:
   - Regex pattern: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`
   - Case-insensitive UUID matching
   - Prevent SQL injection via parameterized queries

2. **No Body Validation Required**:
   - Endpoint accepts no request body
   - No additional parameters to validate

### Data Protection

1. **No Sensitive Data Exposure**:
   - 204 response contains no data
   - No user information leaked in error messages
   - Generic "not found" error prevents enumeration

2. **Timestamp Immutability**:
   - Only `status` and `opened_at` fields updated
   - Immutable fields: `id`, `report_id`, `user_id`, `channel`, `created_at`
   - Database constraints prevent tampering

### Threat Mitigations

| Threat                                         | Mitigation                                     |
| ---------------------------------------------- | ---------------------------------------------- |
| Unauthorized access to other users' deliveries | RLS policies + user-scoped client              |
| SQL injection via malformed UUID               | UUID format validation + parameterized queries |
| Multiple concurrent opens                      | Idempotency: multiple calls return 204         |
| Token replay attacks                           | JWT expiration enforced by authMiddleware      |
| Cross-user access                              | RLS ensures user_id context isolation          |

---

## 6. Error Handling

### Error Handling Strategy

```
┌─ Validation Errors (400)
│  ├─ Invalid UUID format
│  └─ Handled in controller before DB query
│
├─ Authorization Errors (401)
│  ├─ Missing JWT token
│  ├─ Invalid/expired token
│  └─ Handled by authMiddleware
│
├─ Resource Errors (404)
│  ├─ Delivery not found
│  ├─ User doesn't own delivery (RLS)
│  └─ Handled in service layer
│
└─ Server Errors (500)
   ├─ Database connection failure
   ├─ Unexpected Supabase errors
   └─ Caught in global error handler
```

### Error Classes

**DeliveryNotFoundError** (Custom Error)

```typescript
export class DeliveryNotFoundError extends Error {
  constructor(public deliveryId: UUID) {
    super(`Report delivery ${deliveryId} not found`);
    this.name = 'DeliveryNotFoundError';
  }
}
```

### Handling Flow

1. **Validation Errors (400)**:
   - Caught in controller try-catch
   - Zod validation errors parsed into details object
   - Appropriate error response with validation details

2. **Authorization Errors (401)**:
   - Caught before controller execution
   - authMiddleware verifies JWT
   - Early return with 401 response

3. **Not Found Errors (404)**:
   - Service layer checks delivery existence
   - Throws DeliveryNotFoundError if not found
   - Caught in controller catch block
   - Returns 404 response

4. **Unexpected Errors (500)**:
   - Any unhandled exceptions caught
   - Logged to console for debugging
   - Generic server error response returned

### Error Logging

```typescript
// Console logging for debugging
console.error('markOpenedHandler error:', err);

// Error details logged:
// - Error name and message
// - Stack trace (for unexpected errors)
// - User ID and delivery ID (for context)
```

---

## 7. Performance Considerations

### Database Query Performance

**Operation**: Single UPDATE query with WHERE conditions

```sql
UPDATE report_deliveries
SET status = 'opened',
    opened_at = now(),
    updated_at = now()
WHERE id = $1 AND user_id = $2
```

**Performance Characteristics**:

- **Index**: Primary key on `id` ensures fast lookup (O(1))
- **RLS Filtering**: User_id indexed for RLS policy enforcement
- **Expected Query Time**: < 5ms typical, < 50ms worst case

### Optimization Strategies

1. **No N+1 Queries**:
   - Single UPDATE query, no preceding SELECT
   - Database returns update count, not row data
   - No hydration of response object needed

2. **Timestamp Generation**:
   - `now()` generated in database (server time)
   - No client time synchronization issues
   - Consistent timezone handling (TIMESTAMPTZ)

3. **Idempotency**:
   - Repeated calls with same ID are safe
   - No side effects from multiple requests
   - Status already 'opened' means update is no-op (still 204)

### Caching Considerations

- **No Caching Strategy Needed**:
  - 204 response contains no data
  - Frontend manages opened state locally if needed
  - Database is source of truth

### Rate Limiting

- Consider implementing rate limiting at API gateway level
- Prevent abuse of mark-opened endpoint (e.g., spam marking deliveries)
- Suggested: 100 requests per minute per user

---

## 8. Implementation Steps

### Phase 1: Update Service Layer

**File**: `src/services/report-deliveries.service.ts`

1. Add new error class:

   ```typescript
   export class DeliveryNotFoundError extends Error {
     constructor(public deliveryId: UUID) {
       super(`Report delivery ${deliveryId} not found`);
       this.name = 'DeliveryNotFoundError';
     }
   }
   ```

2. Add method `markDeliveryOpened()`:
   ```typescript
   async markDeliveryOpened(userId: UUID, deliveryId: UUID): Promise<void> {
     // Step 1: Fetch delivery to verify existence and ownership
     // Step 2: Throw DeliveryNotFoundError if not found
     // Step 3: Update delivery with status='opened' and opened_at=now()
     // Step 4: Return void
   }
   ```

### Phase 2: Add Controller Handler

**File**: `src/controllers/report-deliveries.controller.ts`

1. Add new handler function `markOpenedHandler()`:
   - Verify authentication (401 check)
   - Extract and validate path parameter `id` (400 check)
   - Call service method
   - Return 204 on success
   - Handle errors appropriately (404, 500)

### Phase 3: Add Validation Schema (if needed)

**File**: `src/validation/report-deliveries.ts`

1. Add UUID validation schema for path parameter (optional, can be done inline):
   ```typescript
   export const MarkOpenedParamSchema = z.object({
     id: z.string().uuid({ message: 'id must be a valid UUID' }),
   });
   ```

### Phase 4: Register Route Handler

**File**: `src/routes/report-deliveries.router.ts`

1. Import `markOpenedHandler` from controller
2. Add route with parameter:
   ```typescript
   router.post('/:id/mark-opened', authMiddleware, (req, res, next) =>
     markOpenedHandler(req, res, next)
   );
   ```

### Phase 5: Build and Test

1. Compile TypeScript:

   ```bash
   npm run build
   ```

2. Verify no linting errors:

   ```bash
   npm run lint
   ```

3. Run test suite:

   ```bash
   npm run test
   ```

4. Manual testing with curl or API client:

   ```bash
   # Test successful mark-opened
   curl -X POST \
     http://localhost:3000/api/report-deliveries/{DELIVERY_ID}/mark-opened \
     -H "Authorization: Bearer {JWT_TOKEN}" \
     -w "\nStatus: %{http_code}\n"

   # Test 401 (missing auth)
   curl -X POST \
     http://localhost:3000/api/report-deliveries/{DELIVERY_ID}/mark-opened \
     -w "\nStatus: %{http_code}\n"

   # Test 400 (invalid UUID)
   curl -X POST \
     http://localhost:3000/api/report-deliveries/invalid-id/mark-opened \
     -H "Authorization: Bearer {JWT_TOKEN}" \
     -w "\nStatus: %{http_code}\n"

   # Test 404 (not found)
   curl -X POST \
     http://localhost:3000/api/report-deliveries/550e8400-e29b-41d4-a716-446655440000/mark-opened \
     -H "Authorization: Bearer {JWT_TOKEN}" \
     -w "\nStatus: %{http_code}\n"
   ```

### Phase 6: Deployment

1. Commit changes to feature branch
2. Create pull request with implementation
3. Code review by team
4. Merge to main branch
5. Deploy to staging environment
6. Run integration tests
7. Deploy to production

---

## 9. Code Patterns and Examples

### Pattern: Controller Error Handling

Following project's established pattern from other endpoints:

```typescript
export const markOpenedHandler = async (
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> => {
  try {
    // 1. Ensure authenticated
    if (!req.auth) {
      res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
      return;
    }

    // 2. Validate path parameter
    const { id: deliveryId } = req.params;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(deliveryId)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid delivery ID format',
          details: { id: 'Delivery ID must be a valid UUID' },
        },
      });
      return;
    }

    // 3. Call service
    const userClient = createClient<Database>(supabaseUrl, req.auth.jwt);
    const service = new ReportDeliveriesService(userClient);
    await service.markDeliveryOpened(req.auth.userId, deliveryId);

    // 4. Return 204 No Content
    res.status(204).send();
  } catch (err) {
    // Handle specific errors
    if (err instanceof DeliveryNotFoundError) {
      res.status(404).json({
        error: {
          code: 'DELIVERY_NOT_FOUND',
          message: 'Report delivery not found',
        },
      });
      return;
    }

    // Generic error
    console.error('markOpenedHandler error:', err);
    res.status(500).json({
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    });
  }
};
```

### Pattern: Service Layer Implementation

Consistent with existing ReportDeliveriesService methods:

```typescript
async markDeliveryOpened(userId: UUID, deliveryId: UUID): Promise<void> {
  // Step 1: Fetch delivery to verify existence and ownership
  const { data: delivery, error: fetchError } = await this.userClient
    .from('report_deliveries')
    .select('id, user_id')
    .eq('id', deliveryId)
    .eq('user_id', userId)
    .maybeSingle();

  if (fetchError) {
    console.error('ReportDeliveriesService.markDeliveryOpened fetch error:', fetchError);
    throw new Error(`Failed to fetch delivery: ${fetchError.message}`);
  }

  if (!delivery) {
    throw new DeliveryNotFoundError(deliveryId);
  }

  // Step 2: Update delivery with status='opened' and opened_at=now()
  const { error: updateError } = await this.userClient
    .from('report_deliveries')
    .update({
      status: 'opened',
      opened_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', deliveryId)
    .eq('user_id', userId);

  if (updateError) {
    console.error('ReportDeliveriesService.markDeliveryOpened update error:', updateError);
    throw new Error(`Failed to update delivery: ${updateError.message}`);
  }
}
```

### Pattern: Route Registration

Consistent with existing report-deliveries routes:

```typescript
router.post(
  '/:id/mark-opened',
  authMiddleware,
  (req: Request, res: Response, _next: NextFunction) => markOpenedHandler(req, res, _next)
);
```

---

## 10. Testing Strategy

### Unit Tests

**Service Layer Tests** (`src/services/report-deliveries.service.spec.ts`):

- ✅ Test successful mark-opened
- ✅ Test delivery not found error
- ✅ Test RLS prevents cross-user access
- ✅ Test idempotency (multiple calls)
- ✅ Test database error handling

### Integration Tests

**Route Tests** (`src/routes/report-deliveries.router.integration.spec.ts`):

- ✅ Test 204 success response
- ✅ Test 401 missing auth
- ✅ Test 400 invalid UUID
- ✅ Test 404 delivery not found
- ✅ Test 500 server error

### Manual Testing

Use curl or Postman to verify:

1. Valid delivery mark-opened returns 204
2. Missing auth returns 401
3. Invalid UUID returns 400
4. Non-existent delivery returns 404
5. Database errors return 500

---

## 11. Deployment Checklist

- [ ] Code review completed
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] TypeScript compilation successful
- [ ] No linting errors
- [ ] Manual testing in staging environment
- [ ] Database indexes verified
- [ ] RLS policies verified
- [ ] Error monitoring configured
- [ ] Rate limiting configured (optional)
- [ ] Documentation updated
- [ ] Ready for production deployment

---

## 12. Related Endpoints & Context

### Related Endpoints

- `GET /api/report-deliveries` - List deliveries with filters
- `POST /api/report-deliveries/{id}/email` - Queue email delivery
- `POST /api/reports/generate` - Generate report (creates deliveries)

### Data Dependencies

- **report_deliveries table**: Primary data resource
- **reports table**: Referenced for ownership validation
- **auth.users**: JWT validation and user context

### Future Enhancements

- Analytics tracking for open rates
- Webhook notifications when delivery opened
- Batch mark-opened for multiple deliveries
- In-app notification when report first opened
