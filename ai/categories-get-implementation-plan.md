# API Endpoint Implementation Plan: GET /api/categories

## 1. Endpoint Overview

The **GET `/api/categories`** endpoint provides a public, read-only listing of note categories. This endpoint enables frontend applications to display available category options to users without requiring authentication. The endpoint supports filtering by active status and sorting by category name, returning a paginated response with category metadata including ID, slug, name, active status, and creation timestamp.

**Key Characteristics**:

- Public access (no authentication required)
- Read-only operation
- Supports filtering and sorting
- Paginated response with consistent envelope
- Caching-friendly due to public nature

---

## 2. Request Details

### HTTP Method

- **GET** `/api/categories`

### URL Structure

```
GET /api/categories?active=true&sort=name_asc&limit=20&offset=0
```

### Query Parameters

| Parameter | Type    | Required | Default    | Validation                | Description                        |
| --------- | ------- | -------- | ---------- | ------------------------- | ---------------------------------- |
| `active`  | boolean | No       | `true`     | Valid boolean value       | Filter categories by active status |
| `sort`    | enum    | No       | `name_asc` | `name_asc` \| `name_desc` | Sort order of results              |
| `limit`   | integer | No       | `20`       | 1-100                     | Maximum number of items per page   |
| `offset`  | integer | No       | `0`        | ≥0                        | Number of items to skip from start |

### Request Headers

- **No authentication header required** (public endpoint)
- Standard HTTP headers (Accept, User-Agent, etc.)

### Request Body

- **None** (GET request with query parameters only)

---

## 3. Used Types

### Type Definitions (from `src/types.ts`)

```typescript
// DTO for category response items
export type CategoryDto = Tables<'categories'>;
// Resolves to:
// {
//   id: UUID;
//   slug: string;
//   name: string;
//   active: boolean;
//   created_at: string; // ISO datetime
// }

// Query parameters schema
export type ListCategoriesQuery = {
  active?: boolean; // default true
  sort?: CategorySort; // default 'name_asc'
};

// Sort enum type
export type CategorySort = 'name_asc' | 'name_desc';

// Paginated response envelope
export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

// Full response type
export type ListCategoriesResponseDto = PaginatedResponse<CategoryDto>;

// Error response (for edge cases)
export type ErrorResponseDto = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};
```

### Validation Schema (to be created: `src/validation/categories.ts`)

```typescript
import { z } from 'zod';

export const ListCategoriesQuerySchema = z.object({
  active: z
    .string()
    .toLowerCase()
    .transform((val) => val === 'true')
    .refine((val) => typeof val === 'boolean', 'active must be a valid boolean')
    .optional()
    .default('true'),

  sort: z
    .enum(['name_asc', 'name_desc'], {
      errorMap: () => ({ message: 'sort must be "name_asc" or "name_desc"' }),
    })
    .optional()
    .default('name_asc'),

  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => Number.isInteger(val) && val >= 1 && val <= 100, {
      message: 'limit must be an integer between 1 and 100',
    })
    .optional()
    .default('20'),

  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => Number.isInteger(val) && val >= 0, {
      message: 'offset must be an integer >= 0',
    })
    .optional()
    .default('0'),
});

export type ListCategoriesQuery = z.infer<typeof ListCategoriesQuerySchema>;
```

---

## 4. Response Details

### Success Response (200 OK)

```json
{
  "items": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "slug": "family",
      "name": "Family",
      "active": true,
      "created_at": "2025-01-01T10:00:00Z"
    },
    {
      "id": "223e4567-e89b-12d3-a456-426614174001",
      "slug": "friends",
      "name": "Friends",
      "active": true,
      "created_at": "2025-01-01T10:00:00Z"
    },
    {
      "id": "323e4567-e89b-12d3-a456-426614174002",
      "slug": "pets",
      "name": "Pets",
      "active": true,
      "created_at": "2025-01-01T10:00:00Z"
    },
    {
      "id": "423e4567-e89b-12d3-a456-426614174003",
      "slug": "body",
      "name": "Body",
      "active": true,
      "created_at": "2025-01-01T10:00:00Z"
    },
    {
      "id": "523e4567-e89b-12d3-a456-426614174004",
      "slug": "mind",
      "name": "Mind",
      "active": true,
      "created_at": "2025-01-01T10:00:00Z"
    },
    {
      "id": "623e4567-e89b-12d3-a456-426614174005",
      "slug": "passions",
      "name": "Passions",
      "active": true,
      "created_at": "2025-01-01T10:00:00Z"
    }
  ],
  "total": 6,
  "limit": 20,
  "offset": 0
}
```

### Empty Result Response (200 OK)

```json
{
  "items": [],
  "total": 0,
  "limit": 20,
  "offset": 0
}
```

### HTTP Status Codes

| Status                        | Scenario                                                   | Response Format                 |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------- |
| **200 OK**                    | Successfully retrieved categories (including empty result) | `ListCategoriesResponseDto`     |
| **400 Bad Request**           | Invalid query parameters (e.g., malformed sort enum)       | `ErrorResponseDto` with details |
| **500 Internal Server Error** | Unexpected database or server error                        | `ErrorResponseDto`              |

### Error Response Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid query parameters",
    "details": {
      "sort": "sort must be \"name_asc\" or \"name_desc\""
    }
  }
}
```

---

## 5. Data Flow

### Request Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Express Application                           │
├─────────────────────────────────────────────────────────────────┤
│  1. HTTP GET /api/categories?active=true&sort=name_asc          │
├─────────────────────────────────────────────────────────────────┤
│  Middleware Chain:                                               │
│  ├─ CORS (if applicable)                                         │
│  ├─ JSON Parser                                                  │
│  └─ [No Auth Middleware - public endpoint]                      │
├─────────────────────────────────────────────────────────────────┤
│  Router: /api/categories                                         │
│  └─ GET / → listCategoriesHandler                               │
├─────────────────────────────────────────────────────────────────┤
│  Controller Layer (listCategoriesHandler):                       │
│  ├─ Parse query parameters from req.query                       │
│  ├─ Validate parameters with ListCategoriesQuerySchema          │
│  ├─ Handle validation errors (400)                              │
│  └─ Call CategoriesService.listCategories()                     │
├─────────────────────────────────────────────────────────────────┤
│  Service Layer (CategoriesService):                              │
│  ├─ Initialize admin Supabase client (no RLS needed)            │
│  ├─ Build parameterized query:                                  │
│  │  - SELECT columns: id, slug, name, active, created_at        │
│  │  - WHERE active = $1 (if filter applied)                     │
│  │  - ORDER BY (name ASC or DESC based on sort param)           │
│  │  - LIMIT $2 OFFSET $3 (pagination)                           │
│  ├─ Execute query against 'categories' table                    │
│  ├─ Get total count (for pagination metadata)                   │
│  ├─ Build ListCategoriesResponseDto envelope                    │
│  └─ Return paginated response                                   │
├─────────────────────────────────────────────────────────────────┤
│  Response to Client:                                             │
│  └─ 200 OK with ListCategoriesResponseDto                       │
└─────────────────────────────────────────────────────────────────┘
```

### Detailed Data Flow Steps

1. **Request Reception**: Client sends GET request with optional query parameters
2. **Query Parsing**: Express parses query string into `req.query` object
3. **Validation**: Zod schema validates and coerces query parameters
4. **Error Handling**: If validation fails, return 400 with error details
5. **Service Initialization**: Controller creates `CategoriesService` with admin client
6. **Query Building**: Service constructs Supabase query with filters, sorting, and pagination
7. **Database Execution**: Supabase SDK executes parameterized query
8. **Response Building**: Service transforms database rows into response DTO
9. **Pagination Metadata**: Service includes total count, limit, and offset
10. **Response Return**: Controller returns 200 with response DTO as JSON

### Database Interactions

**Table**: `categories`

```sql
SELECT
  id,
  slug,
  name,
  active,
  created_at
FROM categories
WHERE active = $1  -- Only if filter applied
ORDER BY name ASC  -- Or DESC based on sort parameter
LIMIT $2 OFFSET $3
```

**Total Count Query**:

```sql
SELECT COUNT(*) as count
FROM categories
WHERE active = $1  -- Only if filter applied
```

---

## 6. Security Considerations

### Authentication and Authorization

- **No Authentication Required**: Endpoint is publicly accessible
- **No Authorization Checks**: No user context needed
- **Public RLS Policy**: Categories table has public read-only policy (per API plan section 3.0)

### Input Validation

- **Query Parameter Validation**: Strict validation with Zod schema
  - `active`: Coerced to boolean (handles string 'true'/'false')
  - `sort`: Enum validation against allowed values
  - `limit` and `offset`: Integer validation with bounds
- **Reject Invalid Input**: Return 400 Bad Request for malformed parameters
- **Type Safety**: TypeScript ensures type correctness at compile time

### SQL Injection Prevention

- **Parameterized Queries**: Use Supabase SDK's parameterized queries (no string concatenation)
- **Input Sanitization**: Zod validation sanitizes and validates all inputs before database use
- **Enum Validation**: `sort` parameter limited to predefined enum values

### Data Exposure

- **Public Data Only**: Categories contain no sensitive user information
- **Minimal Metadata**: Response includes only necessary fields (id, slug, name, active, created_at)
- **No User Context**: Response same for all users (cacheable)

### Rate Limiting (Recommended)

- **Per-IP Rate Limiting**: Apply at API gateway level (e.g., 100 req/min for public endpoints)
- **DDoS Protection**: Pagination prevents resource exhaustion via large result requests
- **Caching**: Response is highly cacheable due to public nature (recommend 5-10 minute TTL)

### HTTPS and Transport Security

- **HTTPS Only**: All endpoints must use HTTPS (enforce via HSTS header)
- **No Credentials**: Public endpoint doesn't need credential transmission

---

## 7. Error Handling

### Error Scenarios and Responses

| Scenario                           | HTTP Status | Error Code         | Message                  | Details                               |
| ---------------------------------- | ----------- | ------------------ | ------------------------ | ------------------------------------- |
| Valid request with results         | 200         | N/A                | N/A                      | Returns paginated categories          |
| Valid request, no matches          | 200         | N/A                | N/A                      | Empty items array, total=0            |
| Invalid sort value                 | 400         | `VALIDATION_ERROR` | Invalid query parameters | `sort` field with specific enum error |
| Invalid active value               | 400         | `VALIDATION_ERROR` | Invalid query parameters | `active` field with boolean error     |
| Invalid limit (negative/too large) | 400         | `VALIDATION_ERROR` | Invalid query parameters | `limit` field with range error        |
| Invalid offset (negative)          | 400         | `VALIDATION_ERROR` | Invalid query parameters | `offset` field with range error       |
| Database connection error          | 500         | `SERVER_ERROR`     | Unexpected server error  | No details exposed to client          |
| Malformed query string             | 400         | `VALIDATION_ERROR` | Invalid query parameters | Field-specific errors                 |

### Error Response Structure

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": {
      "field_name": "Specific validation error"
    }
  }
}
```

### Logging Strategy

- **Info Level**: Log successful requests with query parameters (for analytics)
- **Warn Level**: Log validation failures (potential user error or attack)
- **Error Level**: Log database failures and unexpected exceptions
- **No PII Logging**: Query parameters don't contain user identification

### Error Recovery

- **Client Retry**: Implement exponential backoff for 500 errors
- **Graceful Degradation**: Return empty array if database fails (optional, depends on business requirements)
- **Caching**: Cache successful responses to reduce database load

---

## 8. Performance Considerations

### Database Optimization

- **Index Strategy**: Leverage existing `categories` table indexes
  - Query uses `WHERE active = true` and `ORDER BY name` → ensures indexes on `(active, name)` or separate indexes exist
  - Pagination uses `LIMIT/OFFSET` → efficient for small pages
- **Query Optimization**:
  ```sql
  -- Optimal query pattern
  SELECT id, slug, name, active, created_at
  FROM categories
  WHERE active = true  -- Highly selective filter (6 categories, likely all active)
  ORDER BY name ASC    -- Index-friendly sort
  LIMIT 20 OFFSET 0    -- Efficient pagination
  ```

### Caching Strategy

- **HTTP Cache Headers**: Set aggressive caching headers for public response
  ```
  Cache-Control: public, max-age=600  -- 10 minutes
  ETag: "category-list-hash"          -- For cache validation
  ```
- **Server-Side Cache** (Optional): Cache results in Redis for 5-10 minutes
  - Key: `categories:active:{active}:sort:{sort}`
  - Invalidate on category changes (rare, typically only via CRON)
  - Reduces database queries significantly

### Response Payload Optimization

- **Payload Size**: ~1.5 KB for full 6-category list (very small)
- **Data Transfer**: Minimal impact on network bandwidth
- **Compression**: Enable gzip compression at HTTP layer

### Pagination Optimization

- **Default Limit**: 20 items per page (reduces large result set risk)
- **Max Limit**: 100 items per page (prevents abuse)
- **Offset Strategy**: Efficient for small offsets; consider keyset pagination for large datasets if needed later

### Scalability Considerations

- **Current Scale**: 6 default categories + extensible → small data set
- **Future Growth**: If categories exceed 100,000 items, consider:
  - Materialized view for frequently accessed subsets
  - Full-text search on name/slug
  - Separate read replica for public queries
- **Load Distribution**: Public endpoint can be cached aggressively, reducing backend load

### Monitoring and Alerting

- **Track Request Count**: Monitor query frequency for DDoS detection
- **Database Performance**: Track query execution time
- **Cache Hit Rate**: Monitor cache effectiveness if caching implemented
- **Error Rate**: Alert on sustained 500 error rate (>1%)

---

## 9. Implementation Steps

### Phase 1: Foundation (Validation Layer)

**Step 1.1**: Create validation schema

- **File**: `src/validation/categories.ts`
- **Content**:
  - Zod schema for `ListCategoriesQuery` with all query parameters
  - Enum validation for `sort` parameter
  - Integer validation for `limit` (1-100) and `offset` (≥0)
  - Boolean coercion for `active` parameter
  - Default values for all parameters
  - Export inferred TypeScript type

**Step 1.2**: Update types (if needed)

- **File**: `src/types.ts`
- **Changes**: Verify types are properly exported
  - `CategorySort`
  - `ListCategoriesQuery`
  - `ListCategoriesResponseDto`
  - `CategoryDto`

**Dependencies**: None (standalone validation)

---

### Phase 2: Service Layer

**Step 2.1**: Create categories service

- **File**: `src/services/categories.service.ts`
- **Content**:
  - `CategoriesService` class
  - Method: `listCategories(query: ListCategoriesQuery): Promise<ListCategoriesResponseDto>`
  - Initialization with admin Supabase client (no RLS needed)
  - Implementation details:
    - Build Supabase query with `.select()` for specific columns
    - Apply `.eq('active', query.active)` filter if needed
    - Apply sorting: `.order('name', { ascending: query.sort === 'name_asc' })`
    - Apply pagination: `.range(query.offset, query.offset + query.limit - 1)`
    - Fetch total count with separate `.count()` query
    - Build response DTO with items array, total, limit, offset
  - Error handling: Log and rethrow database errors as generic 500 errors
  - Custom error classes: None (public endpoint, simple errors)

**Dependencies**:

- `@supabase/supabase-js`
- `src/db/database.types.ts`
- `src/types.ts`

---

### Phase 3: Controller Layer

**Step 3.1**: Create categories controller

- **File**: `src/controllers/categories.controller.ts`
- **Content**:
  - `listCategoriesHandler` function (Express request/response handler)
  - Implementation steps:
    1. Extract query parameters from `req.query`
    2. Validate with Zod schema (ListCategoriesQuerySchema)
    3. Handle validation errors → return 400 with error details
    4. Create CategoriesService instance
    5. Call `service.listCategories(validated)`
    6. Return 200 with response DTO
  - Error handling:
    - Zod validation errors → 400 Bad Request
    - Database errors → 500 Internal Server Error
    - Log errors appropriately
  - Helper functions:
    - `isStructuralError(error: ZodError): boolean` - Distinguish 400 vs 422 (optional for public endpoint)
    - `extractZodErrors(error: ZodError): Record<string, string>` - Build error details

**Dependencies**:

- `express` (Request, Response types)
- `zod` (ZodError)
- `src/services/categories.service.ts`
- `src/validation/categories.ts`
- `src/types.ts`

---

### Phase 4: Routing Layer

**Step 4.1**: Create categories router

- **File**: `src/routes/categories.router.ts`
- **Content**:
  - Import Express Router
  - Define GET route: `router.get('/', listCategoriesHandler)`
  - No authentication middleware (public endpoint)
  - Export router

**Step 4.2**: Register router in main application

- **File**: `src/index.ts`
- **Changes**:
  - Import categories router
  - Register: `app.use('/api/categories', categoriesRouter)`
  - Position: After other API routes, before error handling middleware

**Dependencies**:

- `express`
- `src/controllers/categories.controller.ts`

---

### Phase 5: Testing and Documentation

**Step 5.1**: Create integration tests

- **File**: `src/routes/categories.router.integration.spec.ts`
- **Test Cases**:
  1. GET /api/categories → 200 with all active categories
  2. GET /api/categories?active=false → 200 with inactive categories
  3. GET /api/categories?sort=name_desc → 200 sorted descending
  4. GET /api/categories?limit=2&offset=1 → 200 with pagination
  5. GET /api/categories?sort=invalid → 400 with validation error
  6. GET /api/categories?limit=abc → 400 with validation error
  7. GET /api/categories (empty database) → 200 with empty items
  8. Database error scenario → 500 with generic error

**Step 5.2**: Update API documentation

- **File**: `CURL_QUICK_REFERENCE_CATEGORIES.md` (new)
- **Content**:
  - cURL examples for common requests
  - Query parameter combinations
  - Success and error response examples

**Step 5.3**: Update main documentation

- **File**: `docs/CATEGORIES_API_REFERENCE.md` (new)
- **Content**:
  - Endpoint details
  - Request/response examples
  - Common use cases

**Dependencies**:

- Test framework (existing in project)
- Supabase test client setup

---

### Phase 6: Build and Deployment

**Step 6.1**: Compile TypeScript

```bash
npm run build
```

- Generates `dist/` JavaScript files with source maps
- Verifies type safety

**Step 6.2**: Verify generated code

- **Files to check**:
  - `dist/controllers/categories.controller.js`
  - `dist/services/categories.service.js`
  - `dist/routes/categories.router.js`
  - `dist/validation/categories.js`

**Step 6.3**: Run integration tests

```bash
npm run test
```

- Ensures all endpoints work correctly
- Validates error scenarios

**Step 6.4**: Manual endpoint testing

```bash
# Test basic request
curl "http://localhost:3000/api/categories"

# Test with query parameters
curl "http://localhost:3000/api/categories?active=true&sort=name_asc"

# Test error handling
curl "http://localhost:3000/api/categories?sort=invalid"
```

**Step 6.5**: Performance validation

- Verify query execution time < 100ms
- Check pagination efficiency
- Validate cache behavior (if implemented)

---

### Implementation Order Summary

```
1. Validation Schema (src/validation/categories.ts)
   ↓
2. Service Layer (src/services/categories.service.ts)
   ↓
3. Controller Handler (src/controllers/categories.controller.ts)
   ↓
4. Router/Routes (src/routes/categories.router.ts)
   ↓
5. Register in Main App (src/index.ts)
   ↓
6. Test Suite (src/routes/categories.router.integration.spec.ts)
   ↓
7. Build & Compile (npm run build)
   ↓
8. Test & Validate (npm run test)
   ↓
9. Deploy
```

---

## 10. Code Patterns and Examples

### Pattern: Query Parameter Validation

Following the project's established pattern from preferences and profile endpoints:

```typescript
// Controller extracts and validates query parameters
try {
  const validated = ListCategoriesQuerySchema.parse(req.query);
  // Use validated parameters
} catch (err) {
  if (err instanceof ZodError) {
    // Handle validation error
  }
}
```

### Pattern: Service Layer Structure

Consistent with PreferencesService and ProfileService:

```typescript
export class CategoriesService {
  constructor(private adminClient: SupabaseClient<Database>) {}

  async listCategories(query: ListCategoriesQuery): Promise<ListCategoriesResponseDto> {
    // Implementation
  }
}
```

### Pattern: Error Response

Consistent error envelope across all endpoints:

```typescript
const errorResponse: ErrorResponseDto = {
  error: {
    code: 'ERROR_CODE',
    message: 'Human readable message',
    details: {
      /* optional */
    },
  },
};
res.status(400).json(errorResponse);
```

### Pattern: Middleware Order

Express middleware chain (public endpoint version):

```typescript
app.use(cors()); // CORS
app.use(express.json()); // Body parser
app.use(supabaseMiddleware); // Supabase client injection (optional)
// NO auth middleware (public endpoint)
app.use('/api/categories', categoriesRouter);
app.use(errorHandler); // Global error handler
```

---

## 11. Dependencies and Imports

### Required Npm Packages

- `@supabase/supabase-js` (already in project)
- `express` (already in project)
- `zod` (already in project)
- `typescript` (already in project)

### Files to Create

1. `src/validation/categories.ts`
2. `src/services/categories.service.ts`
3. `src/controllers/categories.controller.ts`
4. `src/routes/categories.router.ts`
5. `src/routes/categories.router.integration.spec.ts`

### Files to Modify

1. `src/index.ts` - Register router
2. Potentially `src/types.ts` - Verify type exports

### Type Imports Summary

```typescript
// From Supabase database types
import type { Database, Tables } from './db/database.types.js';

// From application types
import type {
  UUID,
  CategoryDto,
  ListCategoriesQuery,
  ListCategoriesResponseDto,
  CategorySort,
  ErrorResponseDto,
} from './types.js';

// From external libraries
import { SupabaseClient, createClient } from '@supabase/supabase-js';
import { z, ZodError } from 'zod';
import { Request, Response } from 'express';
```

---

## 12. Checklist for Implementation Completion

- [ ] Validation schema created and tested
- [ ] Service layer implemented with list method
- [ ] Controller handler created with error handling
- [ ] Router created and configured
- [ ] Router registered in main application
- [ ] TypeScript compiles without errors
- [ ] All imports resolved correctly
- [ ] Basic integration test passes (GET request returns 200)
- [ ] Query parameter validation works (400 on invalid input)
- [ ] Sorting works correctly (both asc and desc)
- [ ] Pagination works correctly (limit and offset)
- [ ] Error scenarios return appropriate status codes
- [ ] Source maps generated for debugging
- [ ] Documented in API reference
- [ ] cURL examples provided
- [ ] Performance tested (response < 100ms)
- [ ] Endpoint ready for production deployment

---

## 13. Related Documentation

- **API Plan**: `api/api-plan.md` (section 2.4 for full specification)
- **Database Plan**: `api/db-plan.md` (categories table schema)
- **Types Reference**: `src/types.ts` (type definitions)
- **Related Endpoints**:
  - GET `/api/preferences` (similar authenticated pattern)
  - GET `/api/profile` (similar authenticated pattern)
  - POST `/api/notes` (validates categories)

---

## Notes for Development Team

1. **Public Endpoint**: No authentication middleware needed; this reduces request processing overhead
2. **Caching Opportunity**: Response is identical for all users; consider HTTP caching headers (Cache-Control, ETag)
3. **Simple Error Handling**: This endpoint has minimal error scenarios compared to user-scoped endpoints
4. **Index Coverage**: Ensure database has indexes on `categories(active)` and `categories(active, name)` for optimal query performance
5. **Future Extensions**: If categories grow beyond simple filtering/sorting, consider:
   - Full-text search on name/description
   - Hierarchical category support
   - Category tags or metadata
