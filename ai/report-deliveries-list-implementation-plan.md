# API Endpoint Implementation Plan: GET /api/report-deliveries

## 1. Endpoint Overview

### Purpose

Retrieve a paginated list of report deliveries for the authenticated user with optional filtering by report, channel, and status. This endpoint allows users to track how their reports were delivered across different channels and view delivery status history.

### Key Characteristics

- **Operation Type**: Read (GET) - Retrieves paginated list
- **Scope**: Current authenticated user's deliveries only (via RLS)
- **Filtering**: By report_id, channel (in_app/email), delivery status (queued/sent/opened)
- **Response**: Paginated response with total count
- **Success Status**: 200 OK
- **Authorization**: Requires valid JWT token
- **Rate Limiting**: Recommended but not enforced in spec

---

## 2. Request Details

### HTTP Method

GET

### URL Structure

```
/api/report-deliveries
```

### Request Headers

| Header          | Required | Format               | Description                   |
| --------------- | -------- | -------------------- | ----------------------------- |
| `Authorization` | Yes      | `Bearer <JWT_TOKEN>` | Supabase authentication token |

### Query Parameters

| Parameter   | Type    | Required | Default | Constraints                      | Description                          |
| ----------- | ------- | -------- | ------- | -------------------------------- | ------------------------------------ |
| `report_id` | string  | No       | -       | Valid UUID format (RFC 4122)     | Filter deliveries by specific report |
| `channel`   | string  | No       | -       | Enum: 'in_app', 'email'          | Filter deliveries by channel         |
| `status`    | string  | No       | -       | Enum: 'queued', 'sent', 'opened' | Filter deliveries by status          |
| `limit`     | integer | No       | 20      | Integer 1-100                    | Number of results per page           |
| `offset`    | integer | No       | 0       | Integer >= 0                     | Number of results to skip            |

### Example Requests

```bash
# List all deliveries for user
curl -X GET http://localhost:3000/api/report-deliveries \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Filter by specific report
curl -X GET "http://localhost:3000/api/report-deliveries?report_id=550e8400-e29b-41d4-a716-446655440000" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Filter by channel and status with pagination
curl -X GET "http://localhost:3000/api/report-deliveries?channel=email&status=sent&limit=50&offset=0" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."

# Complex filter: specific report, email channel only
curl -X GET "http://localhost:3000/api/report-deliveries?report_id=550e8400-e29b-41d4-a716-446655440000&channel=email" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

## 3. Response Details

### Success Response (200 OK)

**Status Code**: 200 OK

**Headers**:

```
Content-Type: application/json
```

**Response Body** (ListReportDeliveriesResponseDto):

```json
{
  "items": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "report_id": "660e8400-e29b-41d4-a716-446655440001",
      "user_id": "00000000-0000-0000-0000-000000000001",
      "channel": "in_app",
      "status": "opened",
      "queued_at": "2025-01-06T02:00:00Z",
      "sent_at": "2025-01-06T02:01:00Z",
      "opened_at": "2025-01-06T10:30:45Z",
      "created_at": "2025-01-06T02:00:00Z",
      "updated_at": "2025-01-06T10:30:45Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "report_id": "660e8400-e29b-41d4-a716-446655440001",
      "user_id": "00000000-0000-0000-0000-000000000001",
      "channel": "email",
      "status": "sent",
      "queued_at": "2025-01-06T02:00:00Z",
      "sent_at": "2025-01-06T02:05:00Z",
      "opened_at": null,
      "created_at": "2025-01-06T02:00:00Z",
      "updated_at": "2025-01-06T02:05:00Z"
    }
  ],
  "total": 2,
  "limit": 20,
  "offset": 0
}
```

### Response Field Descriptions

| Field        | Type                           | Nullable | Description                                    |
| ------------ | ------------------------------ | -------- | ---------------------------------------------- |
| `items`      | ReportDeliveryDto[]            | No       | Array of delivery records                      |
| `id`         | UUID                           | No       | Unique delivery record ID                      |
| `report_id`  | UUID                           | No       | Report this delivery is for                    |
| `user_id`    | UUID                           | No       | Owner of the report (denormalized for RLS)     |
| `channel`    | 'in_app' \| 'email'            | No       | Delivery channel used                          |
| `status`     | 'queued' \| 'sent' \| 'opened' | No       | Current delivery status                        |
| `queued_at`  | TIMESTAMPTZ                    | No       | When delivery was queued                       |
| `sent_at`    | TIMESTAMPTZ                    | Yes      | When delivery was sent (null if not yet sent)  |
| `opened_at`  | TIMESTAMPTZ                    | Yes      | When user opened delivery (null if not opened) |
| `created_at` | TIMESTAMPTZ                    | No       | Record creation timestamp                      |
| `updated_at` | TIMESTAMPTZ                    | No       | Record last update timestamp                   |
| `total`      | number                         | No       | Total count of matching deliveries             |
| `limit`      | number                         | No       | Pagination limit used                          |
| `offset`     | number                         | No       | Pagination offset used                         |

### Error Responses

#### 400 Bad Request - Query Parameter Validation Error

**When**: Invalid query parameters (bad UUID, invalid enum, out of range)

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid query parameters",
    "details": {
      "report_id": "Invalid UUID format",
      "channel": "Must be one of: 'in_app', 'email'",
      "limit": "Must be an integer between 1 and 100"
    }
  }
}
```

#### 401 Unauthorized - Missing or Invalid Authentication

**When**: Authorization header missing, invalid, or JWT expired

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

#### 500 Server Error - Database Failure

**When**: Unexpected database query error

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

### Request Query Schema

**File**: `src/validation/report-deliveries.ts`

```typescript
import { z } from 'zod';

export const ListReportDeliveriesQuerySchema = z.object({
  report_id: z.string().uuid({ message: 'report_id must be a valid UUID' }).optional(),

  channel: z
    .enum(['in_app', 'email'], {
      errorMap: () => ({
        message: "channel must be one of: 'in_app', 'email'",
      }),
    })
    .optional(),

  status: z
    .enum(['queued', 'sent', 'opened'], {
      errorMap: () => ({
        message: "status must be one of: 'queued', 'sent', 'opened'",
      }),
    })
    .optional(),

  limit: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 100, {
      message: 'limit must be an integer between 1 and 100',
    })
    .optional()
    .default(20)
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val)),

  offset: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => Number.isInteger(val) && val >= 0, {
      message: 'offset must be an integer >= 0',
    })
    .optional()
    .default(0)
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val)),
});

export type ListReportDeliveriesQuery = z.infer<typeof ListReportDeliveriesQuerySchema>;
```

### DTOs and Type Aliases

**File**: `src/types.ts` (already defined)

```typescript
export type ReportDeliveryDto = Tables<'report_deliveries'>;

export type ListReportDeliveriesQuery = {
  report_id?: UUID;
  channel?: DeliveryChannel;
  status?: DeliveryStatus;
  limit?: number;
  offset?: number;
};

export type ListReportDeliveriesResponseDto = PaginatedResponse<ReportDeliveryDto>;

export type DeliveryChannel = 'in_app' | 'email';
export type DeliveryStatus = 'queued' | 'sent' | 'opened';
```

---

## 5. Data Flow

### Step-by-Step Execution Flow

```
1. CLIENT REQUEST
   └─> GET /api/report-deliveries?channel=email&status=sent
       ├─ Headers: Authorization
       └─ Query: channel, status, limit, offset

2. AUTH MIDDLEWARE (authMiddleware)
   └─> Validate JWT
       ├─ Extract userId and JWT token
       └─ Attach to req.auth

3. ROUTE HANDLER (listReportDeliveriesHandler)
   └─> Request Validation
       ├─ Parse query parameters using ListReportDeliveriesQuerySchema
       └─ Return 400 if validation fails

4. SERVICE LAYER (ReportDeliveriesService.listReportDeliveries)
   ├─ Initialize query builder
   │  └─ Select all delivery columns
   │
   ├─ Apply filters (if provided)
   │  ├─ If report_id: .eq('report_id', reportId)
   │  ├─ If channel: .eq('channel', channel)
   │  └─ If status: .eq('status', status)
   │
   ├─ Build count query (same filters)
   │  └─ Execute: SELECT COUNT(*)
   │
   ├─ Apply pagination
   │  ├─ Order by: created_at DESC
   │  └─ Range: offset to offset+limit-1
   │
   └─ Execute queries
       ├─ Count query (for total)
       ├─ Data query (for items)
       └─ Handle errors

5. RESPONSE HANDLER
   └─> Success (200 OK)
       ├─ Headers: Content-Type: application/json
       ├─ Body: ListReportDeliveriesResponseDto
       └─ Return paginated results with total count
```

### Database Queries

**Query 1: Count Total Matching Deliveries**

```sql
SELECT COUNT(*) as count FROM report_deliveries
WHERE user_id = $1
  AND (report_id IS NULL OR report_id = $2)
  AND (channel IS NULL OR channel = $3)
  AND (status IS NULL OR status = $4)
```

**Query 2: Fetch Paginated Results**

```sql
SELECT * FROM report_deliveries
WHERE user_id = $1
  AND (report_id IS NULL OR report_id = $2)
  AND (channel IS NULL OR channel = $3)
  AND (status IS NULL OR status = $4)
ORDER BY created_at DESC
LIMIT $5
OFFSET $6
```

### Index Usage

- **Primary Query**: Uses index `idx_report_deliveries_user_channel_status`
  - Composite index on (user_id, channel, status)
  - Optimizes filtering by these three columns
  - Supports RLS filtering and optional filters

- **Sorting**: Uses implicit index on `created_at` DESC for ordering

- **Count Efficiency**: Supabase count queries optimized at DB level

---

## 6. Security Considerations

### 1. Authentication & Authorization

**Mechanism**: JWT-based (Supabase)

- **Required**: Bearer token in Authorization header
- **Validation**: Auth middleware extracts and validates JWT
- **User Isolation**: User-scoped Supabase client with RLS ensures users see only their deliveries
- **RLS Policy**: Database enforces `user_id = auth.uid()` on all queries

**Threat Mitigated**: Unauthorized access, user enumeration, privilege escalation

### 2. Row-Level Security (RLS)

**Implementation**:

```sql
-- Assumed RLS policy on report_deliveries table
CREATE POLICY "Users can view their own deliveries"
  ON public.report_deliveries FOR SELECT
  USING (auth.uid() = user_id);
```

**Benefit**: Even if application logic is bypassed, database enforces user isolation

**Threat Mitigated**: Data leakage, unauthorized access to other users' delivery data

### 3. Input Validation

**Multi-layer validation**:

a. **Query Parameter Schema** (Zod):

- UUID format validation
- Enum validation (whitelist approach)
- Integer range validation
- Returns 400 with detailed field errors on failure

b. **Type Safety**:

- TypeScript enforces correct types
- Supabase SDK uses parameterized queries

**Threat Mitigated**: SQL injection, invalid data processing, enum/type confusion

### 4. Rate Limiting

**Status**: Not enforced in this endpoint but recommended

**Suggested Implementation**:

```typescript
// Add rate limit middleware
const deliveriesLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per user
});
```

**Threat Mitigated**: DoS attacks, abuse of listing queries

### 5. Data Exposure Prevention

**Measures**:

- Only return fields defined in ReportDeliveryDto
- Never expose internal database schema details
- Generic error messages to client
- No sensitive data in error responses
- HTTPS enforced (TLS) for transmission

**Threat Mitigated**: Information disclosure, sensitive data leakage

### 6. Filter Bypass Prevention

**Whitelist Approach**:

- Only allow specific filter columns (report_id, channel, status)
- Validate enum values against hardcoded list
- Type-safe query building prevents unexpected filters

**Threat Mitigated**: Unauthorized filtering, information disclosure

### 7. Pagination Safety

**Constraints**:

- Max limit of 100 prevents full-table scans
- Default limit of 20 prevents resource exhaustion
- Integer validation prevents negative offsets

**Threat Mitigated**: Resource exhaustion, performance attacks

---

## 7. Error Handling

### Error Scenarios and Responses

| Error Scenario               | HTTP Status | Error Code       | Root Cause                            | User Message                                        | Resolution                              |
| ---------------------------- | ----------- | ---------------- | ------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| Missing Authorization header | 401         | UNAUTHORIZED     | No Bearer token provided              | "Authentication required"                           | Add Authorization header with valid JWT |
| Invalid/expired JWT          | 401         | UNAUTHORIZED     | JWT validation failed                 | "Authentication required"                           | Re-authenticate and get new token       |
| Invalid UUID in report_id    | 400         | VALIDATION_ERROR | UUID doesn't match RFC 4122           | "report_id must be a valid UUID"                    | Provide valid UUID string               |
| Invalid channel enum         | 400         | VALIDATION_ERROR | channel not 'in_app' or 'email'       | "channel must be one of: 'in_app', 'email'"         | Use valid channel value                 |
| Invalid status enum          | 400         | VALIDATION_ERROR | status not 'queued', 'sent', 'opened' | "status must be one of: 'queued', 'sent', 'opened'" | Use valid status value                  |
| Limit < 1                    | 400         | VALIDATION_ERROR | Limit below minimum                   | "limit must be between 1 and 100"                   | Set limit to valid range                |
| Limit > 100                  | 400         | VALIDATION_ERROR | Limit exceeds maximum                 | "limit must be between 1 and 100"                   | Reduce limit to max 100                 |
| Negative offset              | 400         | VALIDATION_ERROR | Offset is negative                    | "offset must be >= 0"                               | Use non-negative offset                 |
| Database connection error    | 500         | SERVER_ERROR     | DB unreachable                        | "An unexpected error occurred"                      | Retry; contact ops if persists          |
| Unexpected query error       | 500         | SERVER_ERROR     | Unhandled DB error                    | "An unexpected error occurred"                      | Check logs; contact support             |

### Logging Strategy

**Errors to Log** (with different levels):

1. **INFO Level** (Successful operations):
   - Example: `[INFO] User {userId} listed {count} deliveries with filters: channel={channel}, status={status}`
   - Use for monitoring/analytics

2. **WARN Level** (Validation/auth issues):
   - Example: `[WARN] Validation failed for GET /api/report-deliveries: {details}`
   - Example: `[WARN] Unauthorized access attempt: missing Authorization header`

3. **ERROR Level** (Database/unexpected failures):
   - Example: `[ERROR] Failed to list deliveries for user {userId}: {dbError}`
   - Example: `[ERROR] Unexpected error in listReportDeliveries: {exception}`
   - Include stack trace for debugging

**Logs Should NOT Include**:

- Full user data (only userId)
- JWT tokens
- Full query results
- Sensitive database schema details

---

## 8. Performance Considerations

### 1. Query Optimization

**Indexes Used**:

- **Primary**: `idx_report_deliveries_user_channel_status`
  - Composite index on (user_id, channel, status)
  - Expected: <10ms for filtered queries
- **Fallback**: Index on `user_id` for base filtering
  - Expected: <5ms for simple user-only queries

**Expected Query Times** (with indexes):

- No filters: <5ms
- With 1-2 filters: <10ms
- With all filters: <15ms
- Count query: <5ms

### 2. Pagination Strategy

**Best Practices Implemented**:

- Default limit of 20 prevents resource exhaustion
- Max limit of 100 prevents full-table scans
- Offset-based pagination (standard for REST APIs)
- Client implements "load more" pattern

**Optimization**:

- Consider cursor-based pagination for very large datasets (future enhancement)
- Currently acceptable with index on created_at DESC

### 3. Count Efficiency

**Current Approach**:

- Separate count query before data fetch
- Supabase optimizes count queries at database level
- Alternative: Use `SELECT COUNT(*) OVER()` window function (single query)

**Expected**: Total latency <20ms for count + data queries

### 4. Database Connection Pooling

**Configuration**:

- Supabase handles connection pooling
- User-scoped clients with JWT reduce overhead
- No persistent connections needed per request

### 5. Caching Opportunities (Future)

**Optional Enhancements**:

- Cache user's delivery count for 5 minutes
- Invalidate on new deliveries
- Not critical for initial implementation

### 6. Response Time Budget

**Total Expected Latency**: <50ms

- Auth middleware: ~5ms
- Validation: ~1ms
- DB count query: ~5ms
- DB data query: ~10ms
- Response serialization: ~2ms
- Buffer for network: ~27ms

---

## 9. Implementation Steps

### Phase 1: Validation Schema & Types

#### Step 1.1: Create Validation Schema

**File**: `src/validation/report-deliveries.ts`

```typescript
import { z } from 'zod';

/**
 * Schema for validating GET /api/report-deliveries query parameters
 *
 * Handles:
 * - report_id: optional UUID to filter by specific report
 * - channel: optional enum ('in_app' or 'email')
 * - status: optional enum ('queued', 'sent', or 'opened')
 * - limit: pagination limit 1-100 (default: 20)
 * - offset: pagination offset >=0 (default: 0)
 *
 * Query parameters come as strings from URL, so we coerce/transform them
 */
export const ListReportDeliveriesQuerySchema = z.object({
  report_id: z.string().uuid({ message: 'report_id must be a valid UUID' }).optional(),

  channel: z
    .enum(['in_app', 'email'], {
      errorMap: () => ({
        message: "channel must be one of: 'in_app', 'email'",
      }),
    })
    .optional(),

  status: z
    .enum(['queued', 'sent', 'opened'], {
      errorMap: () => ({
        message: "status must be one of: 'queued', 'sent', 'opened'",
      }),
    })
    .optional(),

  limit: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 100, {
      message: 'limit must be an integer between 1 and 100',
    })
    .optional()
    .default(20)
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val)),

  offset: z
    .union([z.number(), z.string()])
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val))
    .refine((val) => Number.isInteger(val) && val >= 0, {
      message: 'offset must be an integer >= 0',
    })
    .optional()
    .default(0)
    .transform((val) => (typeof val === 'string' ? parseInt(val, 10) : val)),
});

export type ListReportDeliveriesQuery = z.infer<typeof ListReportDeliveriesQuerySchema>;
```

### Phase 2: Service Layer Implementation

#### Step 2.1: Create Report Deliveries Service

**File**: `src/services/report-deliveries.service.ts`

```typescript
import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types.js';
import type { UUID, ReportDeliveryDto, ListReportDeliveriesResponseDto } from '../types.js';
import type { ListReportDeliveriesQuery } from '../validation/report-deliveries.js';

/**
 * ReportDeliveriesService handles report delivery listing
 * Manages filtering, pagination, and retrieval of user deliveries
 *
 * This service uses user-scoped Supabase clients to enforce RLS (Row-Level Security)
 * ensuring users can only access their own report deliveries
 */
export class ReportDeliveriesService {
  /**
   * Initialize service with Supabase client
   * @param userClient - User-scoped Supabase client (for RLS enforcement via JWT)
   */
  constructor(private userClient: SupabaseClient<Database>) {}

  /**
   * Retrieve paginated list of report deliveries for authenticated user with optional filtering
   *
   * @param userId - UUID of the authenticated user
   * @param query - ListReportDeliveriesQuery with optional filters
   * @returns ListReportDeliveriesResponseDto with paginated deliveries and metadata
   * @throws Error if database query fails
   */
  async listReportDeliveries(
    userId: UUID,
    query: ListReportDeliveriesQuery
  ): Promise<ListReportDeliveriesResponseDto> {
    const { report_id, channel, status, limit = 20, offset = 0 } = query;

    // Build the count query to get total matching deliveries
    let countQuery = this.userClient
      .from('report_deliveries')
      .select('id', { count: 'exact' })
      .eq('user_id', userId);

    // Build the data query to get paginated results
    let dataQuery = this.userClient.from('report_deliveries').select('*').eq('user_id', userId);

    // Apply optional filters
    if (report_id) {
      countQuery = countQuery.eq('report_id', report_id);
      dataQuery = dataQuery.eq('report_id', report_id);
    }

    if (channel) {
      countQuery = countQuery.eq('channel', channel);
      dataQuery = dataQuery.eq('channel', channel);
    }

    if (status) {
      countQuery = countQuery.eq('status', status);
      dataQuery = dataQuery.eq('status', status);
    }

    // Apply sorting (most recent first)
    dataQuery = dataQuery.order('created_at', { ascending: false });

    // Apply pagination
    dataQuery = dataQuery.range(offset, offset + limit - 1);

    // Execute count query
    const { error: countError, count } = await countQuery;
    if (countError) {
      console.error('ReportDeliveriesService.listReportDeliveries count error:', countError);
      throw new Error(`Failed to count deliveries: ${countError.message}`);
    }

    // Execute data query
    const { data: deliveries, error: dataError } = await dataQuery;
    if (dataError) {
      console.error('ReportDeliveriesService.listReportDeliveries data error:', dataError);
      throw new Error(`Failed to retrieve deliveries: ${dataError.message}`);
    }

    // Build and return paginated response DTO
    const total = count ?? 0;
    return {
      items: (deliveries || []) as ReportDeliveryDto[],
      total,
      limit,
      offset,
    };
  }
}
```

### Phase 3: Controller Implementation

#### Step 3.1: Create Controller Handler

**File**: `src/controllers/report-deliveries.controller.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { ListReportDeliveriesQuerySchema } from '../validation/report-deliveries.js';
import type { Database } from '../db/database.types.js';
import { ReportDeliveriesService } from '../services/report-deliveries.service.js';
import type { ErrorResponseDto } from '../types.js';
import { z } from 'zod';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

/**
 * GET /api/report-deliveries
 * Retrieves paginated list of report deliveries for the authenticated user with optional filtering
 *
 * Query Parameters:
 * - report_id: optional UUID to filter by specific report
 * - channel: optional enum ('in_app' or 'email')
 * - status: optional enum ('queued', 'sent', or 'opened')
 * - limit: pagination limit 1-100 (default: 20)
 * - offset: pagination offset >=0 (default: 0)
 *
 * Success Response:
 * - 200 OK: ListReportDeliveriesResponseDto with paginated deliveries
 *
 * Error Responses:
 * - 400: Query validation errors
 * - 401: Missing/invalid authentication
 * - 500: Server error
 */
export const listReportDeliveriesHandler = async (
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

    // 2. Validate query parameters
    let validatedQuery;
    try {
      validatedQuery = ListReportDeliveriesQuerySchema.parse(req.query);
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const details = Object.fromEntries(
          validationError.errors.map((err) => [err.path.join('.'), err.message])
        );
        const errorResponse: ErrorResponseDto = {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid query parameters',
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

    // 3. Create user-scoped client with JWT for RLS enforcement
    const userClient = createClient<Database>(supabaseUrl, jwt);
    const deliveriesService = new ReportDeliveriesService(userClient);

    // 4. Call service to retrieve deliveries
    const listResult = await deliveriesService.listReportDeliveries(userId, validatedQuery);

    // 5. Return paginated response
    res.status(200).json(listResult);
  } catch (err) {
    console.error('listReportDeliveriesHandler error:', err);
    const errorResponse: ErrorResponseDto = {
      error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' },
    };
    res.status(500).json(errorResponse);
  }
};
```

### Phase 4: Route Registration

#### Step 4.1: Create Report Deliveries Router

**File**: `src/routes/report-deliveries.router.ts`

```typescript
import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { listReportDeliveriesHandler } from '../controllers/report-deliveries.controller.js';

const router = Router();

/**
 * GET /api/report-deliveries
 * Retrieves paginated list of report deliveries for the authenticated user with optional filtering
 * Requires: Authorization header with Bearer token
 * Query parameters: report_id, channel, status, limit, offset
 */
router.get('/', authMiddleware, (req: Request, res: Response, _next: NextFunction) =>
  listReportDeliveriesHandler(req, res, _next)
);

export default router;
```

### Phase 5: Main Application Integration

#### Step 5.1: Register Router in Main App

**File**: `src/index.ts`

Add import and route registration:

```typescript
import reportDeliveriesRouter from './routes/report-deliveries.router.js';

// ... other routes ...

app.use('/api/report-deliveries', reportDeliveriesRouter);
```

---

## Summary of Changes by File

| File                                              | Action | Changes                                        |
| ------------------------------------------------- | ------ | ---------------------------------------------- |
| `src/validation/report-deliveries.ts`             | Create | Add `ListReportDeliveriesQuerySchema` and type |
| `src/services/report-deliveries.service.ts`       | Create | Add `ReportDeliveriesService` class            |
| `src/controllers/report-deliveries.controller.ts` | Create | Add `listReportDeliveriesHandler`              |
| `src/routes/report-deliveries.router.ts`          | Create | Add GET `/` route with auth middleware         |
| `src/index.ts`                                    | Modify | Import and register deliveries router          |

---

## Related Endpoints

- **GET /api/reports**: List user's reports
- **GET /api/reports/{id}**: Get specific report
- **POST /api/reports/generate**: Generate on-demand report
- **GET /api/report-deliveries**: ← **This endpoint** (list deliveries)

---

## References

- [Supabase JS Client](https://supabase.com/docs/reference/javascript/introduction)
- [Zod Validation](https://zod.dev/)
- [Supabase RLS](https://supabase.com/docs/guides/auth/row-level-security)
- [REST API Best Practices](https://restfulapi.net/)
- [RFC 7231 HTTP Semantics](https://tools.ietf.org/html/rfc7231)
