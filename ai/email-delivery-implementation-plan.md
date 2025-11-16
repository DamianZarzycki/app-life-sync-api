# API Endpoint Implementation Plan: POST /api/reports/{id}/deliveries/email

## 1. Endpoint Overview

### Purpose

Request/queue email delivery for a specific report if the user has email delivery enabled in their preferences. This endpoint allows authenticated users to manually trigger email delivery of their reports, with validation to ensure:

1. The report exists and belongs to the authenticated user
2. The user has not unsubscribed from email delivery
3. Email is an enabled delivery channel in user preferences
4. A delivery record doesn't already exist for this report+channel combination

The endpoint creates a new `report_deliveries` record with `status='queued'` and `channel='email'`, which serves as a queue for the email delivery service to process asynchronously.

### Key Characteristics

- **Operation Type**: Creation (POST)
- **Response Status**: 202 Accepted (request queued for processing, not yet executed)
- **Authorization**: Requires valid JWT token
- **Idempotency**: Not supported (unique constraint prevents duplicate calls naturally)
- **Business Logic**: Multi-step validation (report exists, preferences exist, email enabled, not unsubscribed, no duplicate delivery)

---

## 2. Request Details

### HTTP Method

POST

### URL Structure

```
/api/reports/{id}/deliveries/email
```

### Path Parameters

| Parameter | Type | Required | Constraints          | Description                                                     |
| --------- | ---- | -------- | -------------------- | --------------------------------------------------------------- |
| `id`      | UUID | Yes      | Valid UUID v4 format | The unique identifier of the report to queue for email delivery |

### Request Headers

| Header          | Required | Format               | Description                   |
| --------------- | -------- | -------------------- | ----------------------------- |
| `Authorization` | Yes      | `Bearer <JWT_TOKEN>` | Supabase authentication token |
| `Content-Type`  | No       | `application/json`   | Optional; body is empty       |

### Request Body

```
Empty (no request body)
```

---

## 3. Used Types

### DTOs & Models

**EmailDeliveryResponseDto** (`src/types.ts`, lines 203-205):

```typescript
export type EmailDeliveryResponseDto = {
  delivery: Pick<ReportDeliveryDto, 'id' | 'status' | 'channel'>;
};
```

**ReportDeliveryDto** (`src/types.ts`, line 191):

```typescript
export type ReportDeliveryDto = Tables<'report_deliveries'>;
```

**ErrorResponseDto** (`src/types.ts`, lines 24-30):

```typescript
export type ErrorResponseDto = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
```

### Type Aliases

- `UUID` (`src/types.ts`, line 11): String-based UUID type
- `DeliveryChannel` (`src/types.ts`, line 37): Enum type for 'in_app' or 'email'
- `DeliveryStatus` (`src/types.ts`, line 38): Enum type for 'queued', 'sent', or 'opened'

### Custom Error Classes (to be created in service)

These will extend the `Error` class and be caught in the controller:

- `ReportNotFoundError` - When report doesn't exist or user doesn't own it
- `EmailUnsubscribedError` - When user has email_unsubscribed_at set
- `EmailNotPreferredError` - When email is not in preferred_delivery_channels
- `PreferencesNotFoundError` - When user preferences don't exist
- `DeliveryAlreadyExistsError` - When unique constraint is violated

---

## 4. Response Details

### Success Response (202 Accepted)

**HTTP Status**: 202 Accepted

**Response Body**:

```json
{
  "delivery": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "queued",
    "channel": "email"
  }
}
```

**Response Headers**:

```
Content-Type: application/json
```

### Error Responses

| HTTP Status | Error Code              | Scenario                                                          | Example Response                                                                                                                            |
| ----------- | ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 400         | VALIDATION_ERROR        | Invalid UUID format for report ID                                 | `{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid report ID format", "details": { "id": "Report ID must be a valid UUID" } } }` |
| 400         | EMAIL_UNSUBSCRIBED      | User has email_unsubscribed_at set (unsubscribed from all emails) | `{ "error": { "code": "EMAIL_UNSUBSCRIBED", "message": "User has unsubscribed from email delivery" } }`                                     |
| 400         | EMAIL_NOT_PREFERRED     | Email not in user's preferred_delivery_channels                   | `{ "error": { "code": "EMAIL_NOT_PREFERRED", "message": "Email delivery is not enabled in user preferences" } }`                            |
| 400         | PREFERENCES_NOT_FOUND   | User preferences record doesn't exist                             | `{ "error": { "code": "PREFERENCES_NOT_FOUND", "message": "User preferences not found" } }`                                                 |
| 401         | UNAUTHORIZED            | Missing or invalid JWT token                                      | `{ "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }`                                                             |
| 404         | REPORT_NOT_FOUND        | Report doesn't exist or user doesn't own it                       | `{ "error": { "code": "REPORT_NOT_FOUND", "message": "Report not found" } }`                                                                |
| 409         | DELIVERY_ALREADY_EXISTS | Delivery record already exists for this report+channel            | `{ "error": { "code": "DELIVERY_ALREADY_EXISTS", "message": "Email delivery already queued for this report" } }`                            |
| 500         | SERVER_ERROR            | Unexpected server error                                           | `{ "error": { "code": "SERVER_ERROR", "message": "An unexpected error occurred" } }`                                                        |

---

## 5. Data Flow

### High-Level Flow

```
1. Client sends POST request with JWT and report ID
   ↓
2. Express middleware parses path parameter
   ↓
3. Controller receives request
   ├─ Validates authentication (JWT present)
   ├─ Validates report ID format (UUID)
   └─ If validation fails → return error response
   ↓
4. Controller creates user-scoped Supabase client with JWT
   ↓
5. Controller delegates to ReportDeliveriesService
   ↓
6. Service layer executes business logic:
   ├─ Query: Fetch report from 'reports' table
   │  └─ Validates: user_id matches, report exists
   ├─ Query: Fetch user preferences from 'preferences' table
   │  └─ Validates: user has preferences
   ├─ Validation: Check email in preferred_delivery_channels
   ├─ Validation: Check email_unsubscribed_at is NULL
   ├─ Query: Check if delivery already exists (UNIQUE constraint)
   │  └─ Validates: no duplicate for (report_id, 'email')
   └─ If all validations pass:
       ├─ Insert: Create new record in 'report_deliveries'
       │  └─ Fields: report_id, user_id, channel='email', status='queued', queued_at=now()
       └─ Return: Created delivery DTO
   ↓
7. Controller catches any errors and returns appropriate response
   ↓
8. Client receives response with delivery object or error details
```

### Database Interactions

**Query 1: Fetch Report (RLS enforced via JWT)**

```sql
SELECT id, user_id FROM reports
WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
```

**Query 2: Fetch User Preferences (RLS enforced via JWT)**

```sql
SELECT preferred_delivery_channels, email_unsubscribed_at
FROM preferences WHERE user_id = $1
```

**Query 3: Check Existing Delivery (RLS enforced via JWT)**

```sql
SELECT id FROM report_deliveries
WHERE report_id = $1 AND channel = 'email' AND user_id = $2
```

**Query 4: Insert New Delivery (RLS enforced via JWT)**

```sql
INSERT INTO report_deliveries
  (report_id, user_id, channel, status, queued_at, created_at, updated_at)
VALUES ($1, $2, 'email', 'queued', now(), now(), now())
RETURNING id, status, channel
```

### Error Flow

```
Service Layer Error
   ↓
├─ ReportNotFoundError → Controller catches → 404 REPORT_NOT_FOUND
├─ EmailUnsubscribedError → Controller catches → 400 EMAIL_UNSUBSCRIBED
├─ EmailNotPreferredError → Controller catches → 400 EMAIL_NOT_PREFERRED
├─ PreferencesNotFoundError → Controller catches → 400 PREFERENCES_NOT_FOUND
├─ DeliveryAlreadyExistsError → Controller catches → 409 DELIVERY_ALREADY_EXISTS
└─ Unexpected Error → Controller catches → 500 SERVER_ERROR
```

---

## 6. Security Considerations

### Authentication & Authorization

1. **JWT Validation**: All requests must include valid `Authorization: Bearer <JWT>` header
   - Validated by `authMiddleware` before reaching controller
   - JWT is issued by Supabase Auth
   - Contains user ID and scopes

2. **Row-Level Security (RLS)**:
   - User-scoped Supabase client created with user's JWT
   - All queries enforced by RLS policies on `reports`, `preferences`, and `report_deliveries` tables
   - Users can only access their own data

3. **Authorization Policy**:
   - User must own the report (verified via `user_id` column in RLS query)
   - User preferences must exist and be readable
   - User must not have opted out of email delivery

### Data Validation

1. **Input Validation**:
   - Report ID: Strict UUID v4 format validation before database query
   - No request body expected (empty body)

2. **Business Logic Validation**:
   - Email is in preferred_delivery_channels array (array element check)
   - email_unsubscribed_at is NULL (opt-out check)
   - No duplicate delivery via UNIQUE(report_id, channel) constraint

### Defense Against Common Threats

| Threat                                    | Mitigation                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| **SQL Injection**                         | Supabase JS client uses parameterized queries; no string concatenation                       |
| **Unauthorized Data Access**              | RLS policies + user-scoped JWT enforce row-level access control                              |
| **Preference Tampering**                  | User preferences read from DB on each request, not from client                               |
| **Email Preference Bypass**               | Server-side validation ensures email is in preferred_delivery_channels                       |
| **Duplicate Deliveries (Race Condition)** | UNIQUE(report_id, channel) database constraint prevents duplicates; 409 returned if violated |
| **CSRF**                                  | Not applicable; no state-changing cookies, only JWT in Authorization header                  |

### Sensitive Data Handling

- No sensitive user data (email address, preferences values) included in success response
- Only delivery metadata (id, status, channel) returned to client
- Error messages are generic; internal details logged server-side only

---

## 7. Error Handling

### Input Validation Errors

**Scenario**: Invalid report ID format

- **Status**: 400 Bad Request
- **Error Code**: VALIDATION_ERROR
- **Message**: "Invalid report ID format"
- **Details**: `{ "id": "Report ID must be a valid UUID" }`

### Business Logic Errors

**Scenario 1**: Report Not Found

- **Status**: 404 Not Found
- **Error Code**: REPORT_NOT_FOUND
- **Message**: "Report not found"
- **Details**: None
- **Cause**: Report ID doesn't exist OR user doesn't own the report

**Scenario 2**: User Email Unsubscribed

- **Status**: 400 Bad Request
- **Error Code**: EMAIL_UNSUBSCRIBED
- **Message**: "User has unsubscribed from email delivery"
- **Details**: None
- **Cause**: User's `email_unsubscribed_at` is not NULL

**Scenario 3**: Email Not in Preferred Channels

- **Status**: 400 Bad Request
- **Error Code**: EMAIL_NOT_PREFERRED
- **Message**: "Email delivery is not enabled in user preferences"
- **Details**: None
- **Cause**: User's `preferred_delivery_channels` array doesn't include 'email'

**Scenario 4**: Preferences Not Found

- **Status**: 400 Bad Request
- **Error Code**: PREFERENCES_NOT_FOUND
- **Message**: "User preferences not found"
- **Details**: None
- **Cause**: No preferences record exists for user (should not happen in normal flow)

**Scenario 5**: Delivery Already Exists

- **Status**: 409 Conflict
- **Error Code**: DELIVERY_ALREADY_EXISTS
- **Message**: "Email delivery already queued for this report"
- **Details**: None
- **Cause**: UNIQUE(report_id, channel) constraint violated

### Authentication Errors

**Scenario**: Missing or Invalid JWT

- **Status**: 401 Unauthorized
- **Error Code**: UNAUTHORIZED
- **Message**: "Authentication required"
- **Details**: None
- **Handling**: Caught by `authMiddleware`, doesn't reach controller

### Server Errors

**Scenario**: Database connection failure, timeout, or unexpected error

- **Status**: 500 Internal Server Error
- **Error Code**: SERVER_ERROR
- **Message**: "An unexpected error occurred"
- **Details**: None (details logged server-side)
- **Logging**: Full error stack logged with context

### Error Handling Implementation

**In Controller**:

```typescript
try {
  // Validation
  // Service call
  // Response
} catch (err) {
  if (err instanceof ReportNotFoundError) {
    // Handle 404
  } else if (err instanceof EmailUnsubscribedError) {
    // Handle 400
  } else if (err instanceof EmailNotPreferredError) {
    // Handle 400
  } else if (err instanceof PreferencesNotFoundError) {
    // Handle 400
  } else if (err instanceof DeliveryAlreadyExistsError) {
    // Handle 409
  } else {
    // Handle 500
  }
}
```

---

## 8. Performance Considerations

### Database Query Optimization

1. **Query Parallelization**:
   - Report and preferences queries can be executed in parallel (no dependency)
   - Use `Promise.all()` for concurrent queries to reduce latency

2. **Indexes**:
   - Ensure indexes on:
     - `reports(user_id, id, deleted_at)` - for report lookup
     - `preferences(user_id)` - for preference lookup
     - `report_deliveries(report_id, channel, user_id)` - for unique constraint and existing delivery check

3. **Query Count**:
   - Minimum 3 queries: report fetch, preferences fetch, duplicate check
   - 4th query: insert delivery record
   - Total: 4 round-trips to database

### Caching Strategies

**Not Recommended** for this endpoint because:

- User preferences can change at any time
- Delivery must be queued immediately and accurately
- Cache invalidation complexity outweighs benefits
- User delivery status (unsubscribed) must be real-time

### Rate Limiting

- **Recommendation**: 10 requests per minute per user
- **Rationale**: Email delivery is not high-frequency operation; prevents abuse
- **Implementation**: Leverage existing rate limit middleware

### Expected Response Time

- **Target**: < 200ms
- **Breakdown**:
  - Request parsing: < 5ms
  - Authentication: < 10ms
  - Validation: < 10ms
  - Report query: < 50ms
  - Preferences query: < 50ms
  - Existing delivery check: < 30ms
  - Insert delivery: < 30ms
  - Response serialization: < 5ms

---

## 9. Implementation Steps

### Step 1: Define Custom Error Classes

**File**: `src/services/report-deliveries.service.ts` (add to existing file)

Create these error classes at the top of the service file:

```typescript
/**
 * Custom error for when a report is not found or user doesn't own it
 */
export class ReportNotFoundError extends Error {
  constructor(public reportId: UUID) {
    super(`Report ${reportId} not found`);
    this.name = 'ReportNotFoundError';
  }
}

/**
 * Custom error for when user has unsubscribed from email
 */
export class EmailUnsubscribedError extends Error {
  constructor() {
    super('User has unsubscribed from email delivery');
    this.name = 'EmailUnsubscribedError';
  }
}

/**
 * Custom error for when email is not in preferred delivery channels
 */
export class EmailNotPreferredError extends Error {
  constructor() {
    super('Email delivery is not enabled in user preferences');
    this.name = 'EmailNotPreferredError';
  }
}

/**
 * Custom error for when user preferences are not found
 */
export class PreferencesNotFoundError extends Error {
  constructor(public userId: UUID) {
    super(`Preferences for user ${userId} not found`);
    this.name = 'PreferencesNotFoundError';
  }
}

/**
 * Custom error for when delivery already exists
 */
export class DeliveryAlreadyExistsError extends Error {
  constructor(public reportId: UUID) {
    super(`Delivery already exists for report ${reportId}`);
    this.name = 'DeliveryAlreadyExistsError';
  }
}
```

### Step 2: Implement Service Method

**File**: `src/services/report-deliveries.service.ts` (add to existing service class)

Add this method to the `ReportDeliveriesService` class:

```typescript
/**
 * Queue email delivery for a report if user preferences allow
 *
 * Performs multi-step validation:
 * 1. Verify report exists and user owns it
 * 2. Verify user preferences exist
 * 3. Verify email is in preferred_delivery_channels
 * 4. Verify user has not unsubscribed (email_unsubscribed_at is NULL)
 * 5. Verify no delivery already queued for this report+channel
 * 6. Create new delivery record with status='queued'
 *
 * @param userId - UUID of the authenticated user
 * @param reportId - UUID of the report to queue
 * @returns EmailDeliveryResponseDto with created delivery
 * @throws ReportNotFoundError if report doesn't exist or user doesn't own it
 * @throws PreferencesNotFoundError if preferences don't exist
 * @throws EmailUnsubscribedError if user has opted out
 * @throws EmailNotPreferredError if email not in preferred channels
 * @throws DeliveryAlreadyExistsError if delivery already queued
 */
async queueEmailDelivery(
  userId: UUID,
  reportId: UUID
): Promise<EmailDeliveryResponseDto> {
  // Step 1: Fetch report (RLS ensures user ownership)
  const { data: report, error: reportError } = await this.userClient
    .from('reports')
    .select('id, user_id')
    .eq('id', reportId)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle();

  if (reportError) {
    console.error('ReportDeliveriesService.queueEmailDelivery report fetch error:', reportError);
    throw new Error(`Failed to fetch report: ${reportError.message}`);
  }

  if (!report) {
    throw new ReportNotFoundError(reportId);
  }

  // Step 2: Fetch user preferences (RLS ensures user ownership)
  const { data: preferences, error: preferencesError } = await this.userClient
    .from('preferences')
    .select('preferred_delivery_channels, email_unsubscribed_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (preferencesError) {
    console.error('ReportDeliveriesService.queueEmailDelivery preferences fetch error:', preferencesError);
    throw new Error(`Failed to fetch preferences: ${preferencesError.message}`);
  }

  if (!preferences) {
    throw new PreferencesNotFoundError(userId);
  }

  // Step 3: Validate email is in preferred channels
  const emailChannels = preferences.preferred_delivery_channels as DeliveryChannel[];
  if (!emailChannels.includes('email')) {
    throw new EmailNotPreferredError();
  }

  // Step 4: Validate user has not unsubscribed
  if (preferences.email_unsubscribed_at !== null) {
    throw new EmailUnsubscribedError();
  }

  // Step 5: Check if delivery already exists for this report
  const { data: existingDelivery, error: existingError } = await this.userClient
    .from('report_deliveries')
    .select('id')
    .eq('report_id', reportId)
    .eq('channel', 'email')
    .eq('user_id', userId)
    .maybeSingle();

  if (existingError) {
    console.error('ReportDeliveriesService.queueEmailDelivery existing check error:', existingError);
    throw new Error(`Failed to check existing delivery: ${existingError.message}`);
  }

  if (existingDelivery) {
    throw new DeliveryAlreadyExistsError(reportId);
  }

  // Step 6: Create new delivery record
  const { data: delivery, error: insertError } = await this.userClient
    .from('report_deliveries')
    .insert({
      report_id: reportId,
      user_id: userId,
      channel: 'email',
      status: 'queued',
    })
    .select('id, status, channel')
    .single();

  if (insertError) {
    console.error('ReportDeliveriesService.queueEmailDelivery insert error:', insertError);

    // Handle unique constraint violation
    if (insertError.code === '23505') {
      throw new DeliveryAlreadyExistsError(reportId);
    }

    throw new Error(`Failed to create delivery: ${insertError.message}`);
  }

  if (!delivery) {
    throw new Error('Failed to create delivery: no data returned');
  }

  return {
    delivery: {
      id: delivery.id,
      status: delivery.status as DeliveryStatus,
      channel: delivery.channel as DeliveryChannel,
    },
  };
}
```

### Step 3: Create Route Handler

**File**: `src/controllers/report-deliveries.controller.ts` (add to existing file)

Add this handler function:

```typescript
/**
 * POST /api/reports/{id}/deliveries/email
 * Request/queue email delivery for a report if user preferences allow
 *
 * Path Parameters:
 * - id: required UUID of the report
 *
 * Success Response:
 * - 202 Accepted: EmailDeliveryResponseDto with queued delivery
 *
 * Error Responses:
 * - 400: Validation or business logic error (not preferred, unsubscribed, etc.)
 * - 401: Missing/invalid authentication
 * - 404: Report not found
 * - 409: Delivery already exists
 * - 500: Server error
 */
export const queueEmailDeliveryHandler = async (
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

    // 2. Validate path parameter - check UUID format
    const reportId = req.params.id;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!reportId || !uuidRegex.test(reportId)) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid report ID format',
          details: { id: 'Report ID must be a valid UUID' },
        },
      };
      res.status(400).json(errorResponse);
      return;
    }

    const userId = req.auth.userId;
    const jwt = req.auth.jwt;

    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const reportDeliveriesService = new ReportDeliveriesService(userClient);

    // 4. Queue email delivery through service
    const result = await reportDeliveriesService.queueEmailDelivery(userId, reportId);

    // 5. Return 202 Accepted with delivery info
    res.status(202).json(result);
  } catch (err) {
    // Handle specific service errors with appropriate HTTP status codes

    if (err instanceof ReportNotFoundError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'REPORT_NOT_FOUND',
          message: 'Report not found',
        },
      };
      res.status(404).json(errorResponse);
      return;
    }

    if (err instanceof EmailUnsubscribedError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'EMAIL_UNSUBSCRIBED',
          message: 'User has unsubscribed from email delivery',
        },
      };
      res.status(400).json(errorResponse);
      return;
    }

    if (err instanceof EmailNotPreferredError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'EMAIL_NOT_PREFERRED',
          message: 'Email delivery is not enabled in user preferences',
        },
      };
      res.status(400).json(errorResponse);
      return;
    }

    if (err instanceof PreferencesNotFoundError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'PREFERENCES_NOT_FOUND',
          message: 'User preferences not found',
        },
      };
      res.status(400).json(errorResponse);
      return;
    }

    if (err instanceof DeliveryAlreadyExistsError) {
      const errorResponse: ErrorResponseDto = {
        error: {
          code: 'DELIVERY_ALREADY_EXISTS',
          message: 'Email delivery already queued for this report',
        },
      };
      res.status(409).json(errorResponse);
      return;
    }

    // Generic error handling
    console.error('queueEmailDeliveryHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};
```

### Step 4: Create/Update Route File

**File**: `src/routes/report-deliveries.router.ts` (update existing file)

Add this route:

```typescript
/**
 * POST /api/reports/:id/deliveries/email
 * Queue email delivery for a report
 */
router.post('/:id/deliveries/email', queueEmailDeliveryHandler);
```

### Step 5: Register Handler in Controller Exports

**File**: `src/controllers/report-deliveries.controller.ts` (update export)

Add `queueEmailDeliveryHandler` to the controller exports for use in the router.

### Step 6: Update Main Application Routes

**File**: `src/index.ts` (verify existing route registration)

Ensure report-deliveries router is registered:

```typescript
app.use('/api/reports', reportDeliveriesRouter);
```

(This should already be there for the GET endpoints)

### Step 7: Update Type Exports (if needed)

**File**: `src/services/report-deliveries.service.ts` (export error classes)

Ensure error classes are exported so they can be imported in the controller:

```typescript
export {
  ReportNotFoundError,
  EmailUnsubscribedError,
  EmailNotPreferredError,
  PreferencesNotFoundError,
  DeliveryAlreadyExistsError,
};
```

### Step 8: Testing Implementation

**Manual Testing with cURL**:

```bash
# Test 1: Successful email delivery queue (202)
curl -X POST http://localhost:3000/api/reports/{report-uuid}/deliveries/email \
  -H "Authorization: Bearer {jwt-token}" \
  -H "Content-Type: application/json"

# Test 2: Invalid report UUID (400)
curl -X POST http://localhost:3000/api/reports/invalid-uuid/deliveries/email \
  -H "Authorization: Bearer {jwt-token}"

# Test 3: Report not found (404)
curl -X POST http://localhost:3000/api/reports/00000000-0000-0000-0000-000000000000/deliveries/email \
  -H "Authorization: Bearer {jwt-token}"

# Test 4: Duplicate delivery (409)
# Run same as Test 1 twice

# Test 5: Missing authentication (401)
curl -X POST http://localhost:3000/api/reports/{report-uuid}/deliveries/email
```

### Step 9: Build & Verify

```bash
# Compile TypeScript
npm run build

# Run linter
npm run lint

# Run tests (if integration tests exist)
npm test
```

### Step 10: Deploy

After all tests pass:

```bash
# Commit changes
git add src/

# Deploy to staging/production
# (Follow your CI/CD pipeline)
```

---

## 10. Summary of Files to Create/Modify

| File                                              | Action | Purpose                                             |
| ------------------------------------------------- | ------ | --------------------------------------------------- |
| `src/services/report-deliveries.service.ts`       | Modify | Add error classes and `queueEmailDelivery()` method |
| `src/controllers/report-deliveries.controller.ts` | Modify | Add `queueEmailDeliveryHandler()` controller        |
| `src/routes/report-deliveries.router.ts`          | Modify | Add POST route for email delivery                   |
| `src/index.ts`                                    | Verify | Ensure router is registered (should already be)     |

---

## 11. Code Review Checklist

- [ ] Error classes properly extend Error and have correct names
- [ ] Service method validates all business logic requirements
- [ ] Controller properly validates UUID before calling service
- [ ] Controller properly exports all error classes
- [ ] Router properly registers the POST endpoint
- [ ] Response uses 202 Accepted (not 201 Created)
- [ ] All error codes match specification
- [ ] HTTP status codes follow REST conventions
- [ ] Service uses user-scoped Supabase client for RLS enforcement
- [ ] All error scenarios from specification are handled
- [ ] Console logging includes context for debugging
- [ ] TypeScript types are properly imported and used
- [ ] Response DTOs match types.ts definitions

---

## 12. Dependencies

### Required Npm Packages

Already installed in project:

- `@supabase/supabase-js` - Supabase client
- `express` - Web framework
- `zod` - Schema validation

### No New Dependencies Required

This implementation leverages existing patterns and packages already in use throughout the codebase.
