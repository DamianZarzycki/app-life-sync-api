# API Endpoint Implementation Plan: Dashboard

## 1. Endpoint Overview

**Endpoint**: `GET /api/dashboard`

**Purpose**: Retrieve aggregated dashboard data for authenticated users, including progress metrics across categories, streak information, and recent reports. This endpoint provides a real-time snapshot of user activity and report history with optional filtering by timezone and date range.

**Key Features**:
- Returns all active categories with their names and note counts
- Note counts aggregated per category within a configurable date range
- Calculates consecutive-day streak for motivation tracking
- Returns recent report metadata (up to 10 most recent)
- Supports optional timezone and date range customization
- Response cached for 5 minutes to reduce database load
- Cache invalidated on note CRUD operations and report generation

---

## 2. Request Details

### HTTP Method & URL
- **Method**: `GET`
- **URL Structure**: `/api/dashboard`

### Query Parameters

| Parameter | Type | Required | Default | Validation | Description |
|-----------|------|----------|---------|-----------|-------------|
| `timezone` | string | No | Profile timezone | Valid IANA timezone or empty | User's timezone for streak calculation; used to determine local date boundaries |
| `since` | string | No | 4 weeks ago | ISO date (YYYY-MM-DD) or empty | Date range start for aggregating notes; format must be ISO 8601 |

### Request Headers
- **Authorization**: `Bearer <JWT>` (Required)
  - Validated by `authMiddleware`
  - Token must belong to an authenticated user

### Request Body
- None (GET request)

---

## 3. Used Types

### DTOs (from `src/types.ts`)

```typescript
// Query parameters
export type DashboardQuery = {
  timezone?: string;      // default profile timezone
  since?: string;         // ISO date range start (default 4 weeks)
};

// Category summary with name and note count
export type CategorySummaryDto = {
  id: UUID;               // Category ID
  name: string;           // Category name
  notes_count: number;    // Note count for this category in the date range
};

// Response shape
export type DashboardSummaryDto = {
  categories: CategorySummaryDto[];       // All active categories with note counts
  streak_days: number;                    // Consecutive days with at least one note
};

export type RecentReportDto = Pick<
  Tables<'reports'>,
  'id' | 'generated_by' | 'created_at'
>;

export type DashboardDto = {
  summary: DashboardSummaryDto;
  recent_reports: RecentReportDto[];
};
```

### Validation Schemas (to be created in `src/validation/dashboard.ts`)

```typescript
// Query parameter validation
export const DashboardQuerySchema = z.object({
  timezone: z
    .string()
    .refine(/* validate IANA timezone */)
    .optional(),
  since: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
    .refine((date) => !isNaN(Date.parse(date)), 'must be valid date')
    .optional(),
});

export type DashboardQuery = z.infer<typeof DashboardQuerySchema>;
```

---

## 4. Response Details

### Success Response (200 OK)

```json
{
  "summary": {
    "categories": [
      {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "name": "Health",
        "notes_count": 12
      },
      {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "name": "Work",
        "notes_count": 8
      },
      {
        "id": "770e8400-e29b-41d4-a716-446655440004",
        "name": "Personal",
        "notes_count": 0
      }
    ],
    "streak_days": 5
  },
  "recent_reports": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "generated_by": "scheduled",
      "created_at": "2025-01-06T02:00:00Z"
    },
    {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "generated_by": "on_demand",
      "created_at": "2025-01-05T14:30:00Z"
    }
  ]
}
```

### Response Headers
```
Cache-Control: private, max-age=300
Content-Type: application/json
```

### Error Responses

#### 400 Bad Request
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid query parameters",
    "details": {
      "timezone": "Invalid timezone format",
      "since": "Invalid date format, must be YYYY-MM-DD"
    }
  }
}
```

#### 401 Unauthorized
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

#### 500 Server Error
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

### Request Flow

```
1. HTTP GET /api/dashboard?timezone=Europe/Warsaw&since=2025-01-06
   ↓
2. authMiddleware validates JWT
   ↓
3. dashboardHandler extracts and validates query parameters
   ↓
4. DashboardService instantiated with user-scoped Supabase client
   ↓
5. Service queries database:
   a. Fetch user preferences (for timezone and future use)
   b. Get profile timezone if not provided in query
   c. Fetch all active categories from system with names
   d. Query notes table: count by category within date range
   e. Calculate streak: find consecutive days with notes
   f. Fetch recent reports (non-deleted, sorted by created_at desc)
   ↓
6. Aggregate and transform data:
   - Combine category info with note counts
   - Build CategorySummaryDto array with id, name, and notes_count
   ↓
7. Response with 200 OK + Cache-Control headers
```

### Database Queries

#### Query 1: Get User Preferences
```sql
SELECT active_categories, user_id
FROM preferences
WHERE user_id = $1
```

#### Query 2: Get Profile Timezone (if not provided in query)
```sql
SELECT timezone
FROM profiles
WHERE user_id = $1
```

#### Query 3: Get All Active Categories
```sql
SELECT id, name
FROM categories
WHERE active = true
ORDER BY name ASC
```

#### Query 4: Get Note Counts per Category
```sql
SELECT category_id
FROM notes
WHERE 
  user_id = $1 
  AND deleted_at IS NULL
  AND created_at >= $2::date  -- since parameter
```

#### Query 5: Calculate Streak
```sql
SELECT DISTINCT DATE(created_at)
FROM notes
WHERE 
  user_id = $1 
  AND deleted_at IS NULL
  AND created_at >= (NOW() - INTERVAL '90 days')
ORDER BY DATE(created_at) DESC
```

#### Query 6: Get Recent Reports
```sql
SELECT id, generated_by, created_at
FROM reports
WHERE 
  user_id = $1 
  AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 10
```

---

## 6. Security Considerations

### Authentication
- **Requirement**: All requests must include valid `Authorization: Bearer <JWT>` header
- **Enforcement**: `authMiddleware` validates JWT before handler execution
- **Failure**: Returns 401 Unauthorized if missing or invalid

### Authorization
- **Row-Level Security (RLS)**: User-scoped Supabase client ensures:
  - Users can only see their own preferences
  - Users can only see their own notes
  - Users can only see their own reports
- **JWT Scope**: Each request uses user's JWT for implicit user_id filtering

### Data Exposure
- **Minimized Surface**: Response contains only aggregated/metadata:
  - Note counts per category (not full note content)
  - Report metadata only (not full report HTML)
  - Category IDs only (not sensitive category data)
- **Timezone Parameter**: No validation that timezone belongs to user (non-sensitive, user-provided input)

### Rate Limiting
- **Standard Rate Limit**: Applied via existing `rateLimit.middleware`
- **Dashboard-Specific**: No additional rate limiting needed (read-only, low-cost operation)

### Cache Security
- **Cache-Control**: Set to `private` to prevent shared cache storage
- **max-age=300**: 5-minute TTL per specification
- **Invalidation**: Must be cleared on:
  - Note creation/update/deletion
  - Report generation

---

## 7. Error Handling

### Validation Errors (400 Bad Request)

| Scenario | Code | Message | Details |
|----------|------|---------|---------|
| Invalid timezone format | `VALIDATION_ERROR` | Invalid query parameters | `{ timezone: "..." }` |
| Invalid date format | `VALIDATION_ERROR` | Invalid query parameters | `{ since: "..." }` |
| Since date is in future | `VALIDATION_ERROR` | Invalid query parameters | `{ since: "..." }` |

### Authentication Errors (401 Unauthorized)

| Scenario | Code | Message |
|----------|------|---------|
| Missing Authorization header | `UNAUTHORIZED` | Authentication required |
| Invalid/expired JWT | `UNAUTHORIZED` | Authentication required |

### Server Errors (500 Internal Server Error)

| Scenario | Code | Message |
|----------|------|---------|
| Preferences not found | `SERVER_ERROR` | An unexpected error occurred |
| Database connection error | `SERVER_ERROR` | An unexpected error occurred |
| Unexpected exception | `SERVER_ERROR` | An unexpected error occurred |

### Error Handling Strategy

```typescript
try {
  // 1. Validate auth
  if (!req.auth) → 401 Unauthorized
  
  // 2. Validate query parameters
  DashboardQuerySchema.parse(req.query)
  → if error → 400 Validation Error
  
  // 3. Instantiate service with user client
  const service = new DashboardService(userClient)
  
  // 4. Get dashboard data
  const result = await service.getDashboard(userId, validatedQuery)
  
  // 5. Return with cache headers
  res.status(200)
    .set('Cache-Control', 'private, max-age=300')
    .json(result)
    
} catch (err) {
  // Log error for monitoring
  console.error('dashboardHandler error:', err)
  
  // Return generic 500
  res.status(500).json({
    error: { code: 'SERVER_ERROR', message: 'An unexpected error occurred' }
  })
}
```

---

## 8. Performance Considerations

### Query Optimization
1. **Index Strategy**:
   - Composite index on `notes(user_id, created_at, deleted_at)` for efficient filtering
   - Composite index on `reports(user_id, created_at, deleted_at)` for recent reports
   - Index on `preferences(user_id)` for quick lookup

2. **Query Efficiency**:
   - Use `GROUP BY category_id` with `COUNT(*)` aggregation at database level
   - Limit recent reports to 10 records
   - Use `LIMIT 90 days` for streak calculation to avoid full table scan

### Caching Strategy
1. **HTTP Cache** (Client-side):
   - `Cache-Control: private, max-age=300` (5 minutes)
   - Each user gets own cache (private)
   - Automatic expiration after 5 minutes

2. **Cache Invalidation Triggers**:
   - **On note creation**: Clear dashboard cache
   - **On note update**: Clear dashboard cache
   - **On note deletion**: Clear dashboard cache
   - **On report generation**: Clear dashboard cache
   - Implementation: Add cache-busting logic to notes and reports services

3. **Optional Server-Side Cache** (Redis/Memcached):
   - Consider caching dashboard results in Redis with 5-minute TTL
   - Key: `dashboard:${userId}`
   - Invalidation: On same triggers as HTTP cache
   - Trade-off: Adds complexity, needed only if high load

### Database Load Management
1. **Connection Pooling**: Rely on Supabase connection pooling
2. **Query Batching**: Consider combining preferences + profile queries if possible
3. **Pagination**: Recent reports limited to 10 (not paginated)
4. **Materialized Views**: Not recommended (adds maintenance overhead)

### Latency Targets
- **P50**: < 200ms (with cache hit)
- **P95**: < 500ms (with cache miss, fresh query)
- **P99**: < 1000ms (worst case with multiple retries)

---

## 9. Implementation Steps

### Step 1: Create Validation Schema (`src/validation/dashboard.ts`)

**Purpose**: Define Zod schemas for query parameter validation

**Create file**: `src/validation/dashboard.ts`

**Contents**:
- `DashboardQuerySchema`: Validates timezone (optional, must be valid IANA timezone) and since (optional, ISO date YYYY-MM-DD)
- Export `DashboardQuery` type

**Validation Rules**:
- Timezone: Valid IANA timezone string (optional)
- Since: ISO date format YYYY-MM-DD (optional), must be in past or today

**Reference**: Similar to `src/validation/reports.ts`

---

### Step 2: Create Dashboard Service (`src/services/dashboard.service.ts`)

**Purpose**: Implement business logic for dashboard data aggregation

**Create file**: `src/services/dashboard.service.ts`

**Core Methods**:

#### `getDashboard(userId: UUID, query: DashboardQuery): Promise<DashboardDto>`
- Main entry point
- Orchestrates all sub-operations:
  1. Fetch user preferences
  2. Determine timezone
  3. Determine date range (since parameter)
  4. Fetch all active categories with names
  5. Get note counts for all categories
  6. Calculate streak
  7. Fetch recent reports
  8. Combine category info with note counts
  9. Return complete dashboard response

#### `getUserPreferences(userId: UUID): Promise<Preferences>`
- Fetch user preferences (active_categories)
- Error: Throw if preferences not found

#### `getProfileTimezone(userId: UUID): Promise<string>`
- Fetch profile timezone
- Used if timezone not provided in query

#### `getAllCategories(): Promise<Array<{ id: UUID; name: string }>>`
- Fetch all active categories from the system
- Return: Array of categories with id and name, sorted by name ascending

#### `getNotesCounts(userId: UUID, since: Date): Promise<Record<UUID, number>>`
- Query notes table grouped by category
- Filter: user_id, created_at >= since, deleted_at IS NULL
- Count notes for ALL categories (not just active ones)
- Return: Map of category_id → count

#### `calculateStreak(userId: UUID): Promise<number>`
- Query distinct dates with notes
- Find consecutive days from today going backward
- Return: Number of consecutive days

#### `getRecentReports(userId: UUID): Promise<RecentReportDto[]>`
- Fetch 10 most recent non-deleted reports
- Sort by created_at DESC
- Return: Array of report metadata

**Error Handling**:
- Create custom error classes if needed (e.g., `PreferencesNotFoundError`)
- Let database errors bubble up to controller

**Reference**: Pattern from `src/services/reports.service.ts` and `src/services/notes.service.ts`

---

### Step 3: Create Dashboard Controller (`src/controllers/dashboard.controller.ts`)

**Purpose**: HTTP request/response handling

**Create file**: `src/controllers/dashboard.controller.ts`

**Handler**: `getDashboardHandler(req: Request, res: Response, next: NextFunction): Promise<void>`

**Implementation Steps**:
1. Verify authentication (`req.auth` exists)
   - If missing: Return 401 Unauthorized
2. Validate query parameters using `DashboardQuerySchema`
   - If invalid: Return 400 Validation Error with details
3. Create user-scoped Supabase client from JWT
4. Instantiate `DashboardService`
5. Call `getDashboard(userId, validatedQuery)`
6. Return 200 OK with `Cache-Control: private, max-age=300` header
7. Catch errors:
   - Zod validation errors: 400 with details
   - All other errors: 500 with generic message
   - Log all errors to console

**Response Headers**:
- `Cache-Control: private, max-age=300`
- `Content-Type: application/json` (added by Express automatically)

**Reference**: Pattern from `src/controllers/reports.controller.ts`

---

### Step 4: Create Dashboard Router (`src/routes/dashboard.router.ts`)

**Purpose**: Define HTTP routes

**Create file**: `src/routes/dashboard.router.ts`

**Routes**:
```typescript
router.get('/', authMiddleware, getDashboardHandler)
```

**Route Details**:
- `GET /api/dashboard`
- Requires `authMiddleware`
- Delegates to `getDashboardHandler`

**Reference**: Pattern from `src/routes/reports.router.ts`

---

### Step 5: Register Router in Main Application (`src/index.ts`)

**Purpose**: Mount dashboard router in Express app

**Updates to `src/index.ts`**:
1. Import dashboard router
2. Add route registration: `app.use('/api/dashboard', dashboardRouter)`
3. Ensure positioned after `supabaseMiddleware`

---

### Step 6: Add Cache Invalidation Hooks

**Purpose**: Clear dashboard cache on related data changes

**Files to Update**:

#### `src/services/notes.service.ts`
- After `createNote()`: Trigger cache invalidation for user's dashboard
- After `updateNoteById()`: Trigger cache invalidation
- After `deleteNoteById()`: Trigger cache invalidation

#### `src/services/reports.service.ts`
- After `generateReport()`: Trigger cache invalidation for user's dashboard

**Invalidation Strategy**:
- Add helper function: `invalidateDashboardCache(userId: UUID)`
- Implementation (simple approach):
  - If using HTTP cache only: Pass header to client indicating cache needs refresh
  - If adding Redis cache: Delete key `dashboard:${userId}` from Redis
- Log cache invalidation for debugging

---

### Step 7: (Optional) Add Redis Cache

**Purpose**: Reduce database queries with server-side caching

**Only if high load is observed**

**Implementation**:
1. Add Redis client initialization
2. In `getDashboard()`:
   - Check Redis for `dashboard:${userId}`
   - If hit: Return cached data
   - If miss: Fetch from DB, store in Redis with 5-min TTL
3. Update invalidation hooks to delete Redis key

---

### Step 8: Testing

**Unit Tests** (`src/services/dashboard.service.test.ts`):
- Test `getNotesCounts()` with various date ranges
- Test `calculateStreak()` with consecutive and non-consecutive dates
- Test `getDashboard()` integration

**Integration Tests** (`src/routes/dashboard.router.test.ts`):
- Test 200 response with valid auth and query
- Test 401 without auth
- Test 400 with invalid timezone/date
- Test cache headers present

**Manual Testing**:
```bash
# Valid request - returns all categories with names and note counts
curl -H "Authorization: Bearer <JWT>" \
  "http://localhost:3000/api/dashboard?timezone=Europe/Warsaw&since=2025-01-06"

# Sample response:
# {
#   "summary": {
#     "categories": [
#       { "id": "...", "name": "Health", "notes_count": 5 },
#       { "id": "...", "name": "Work", "notes_count": 12 },
#       { "id": "...", "name": "Personal", "notes_count": 0 }
#     ],
#     "streak_days": 3
#   },
#   "recent_reports": [...]
# }

# Without auth - should return 401
curl "http://localhost:3000/api/dashboard"

# Invalid date format - should return 400
curl -H "Authorization: Bearer <JWT>" \
  "http://localhost:3000/api/dashboard?since=2025-01-06T00:00:00"
```

---

## 10. Additional Considerations

### Streak Calculation Algorithm

**Goal**: Count consecutive days (from today backwards) where user has at least one note

**Algorithm**:
```
1. Query all distinct note dates in past 90 days (optimization)
2. Sort dates in descending order (most recent first)
3. Initialize streak_count = 0, expected_date = today
4. For each date in sorted list:
   a. If date == expected_date: increment streak_count
   b. Else if date < expected_date: break (streak broken)
   c. Set expected_date = date - 1 day
5. Return streak_count
```

**Edge Cases**:
- No notes: streak = 0
- Notes only from past: streak = 0 (broken at today)
- All days consecutive: count total days

### Timezone Handling

**Purpose**: Calculate streak in user's local timezone, not UTC

**Implementation**:
1. Get timezone from query or profile
2. Use timezone to determine local date boundaries
3. Example: For Europe/Warsaw timezone:
   - A note created at 23:30 UTC on Jan 6 is counted as Jan 6 in Warsaw
   - Daily streak resets at midnight in user's timezone

**SQL Adjustment**:
```sql
-- Convert to user's timezone before grouping by date
SELECT DISTINCT DATE(created_at AT TIME ZONE $timezone)
FROM notes
WHERE user_id = $1 AND deleted_at IS NULL
```

### Cache Invalidation Strategy

**Current Approach**: HTTP cache headers only
- Simple to implement
- No additional infrastructure
- 5-minute TTL ensures eventual consistency

**When to Upgrade**: If dashboard cache accuracy is critical:
- Implement server-side Redis cache
- Use event-driven invalidation (publish/subscribe)
- Consider database triggers for immediate invalidation

### Monitoring & Logging

**Log Points**:
1. `[INFO]` Dashboard requested for user ${userId}
2. `[DEBUG]` Dashboard query params: timezone=${timezone}, since=${since}
3. `[ERROR]` Dashboard service error: ${error.message}
4. `[INFO]` Dashboard cache invalidated for user ${userId}

**Metrics to Track**:
- Dashboard endpoint response time (P50, P95, P99)
- Cache hit rate
- Database query time breakdown
- Error rate by error code
