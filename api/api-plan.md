# REST API Plan

## 1. Resources
- **profiles**: User profile metadata (1:1 with `auth.users`)
- **preferences**: User preferences for categories, schedule, delivery channels (1:1 with `profiles`)
- **categories**: Note categories (public read-only, seeded defaults)
- **notes**: User notes in categories (soft delete)
- **reports**: Weekly and on-demand generated reports (soft delete)
- **report_deliveries**: Delivery tracking per report and channel
- **report_feedback**: User feedback per report (1:1)
- **analytics_events**: Client/API event analytics (6-month retention)

## 2. Endpoints

### 2.1 Auth & Session
Notes: Authentication uses Supabase JWT (Bearer). Backend validates JWT with Supabase, forwards user JWT to database to enforce RLS. Service role is used only for internal CRON.

- **POST** `/api/auth/sign-up`
  - **Description**: Register a new user with email and password; triggers Supabase Auth signup
  - **Request**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```
  - **Response**:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "email_confirmed_at": null
  },
  "session": {
    "access_token": "jwt_token",
    "refresh_token": "refresh_token",
    "expires_in": 3600,
    "token_type": "bearer"
  }
}
```
  - **Success**: 201 Created
  - **Errors**: 400 invalid email/password format, 409 email already registered

- **POST** `/api/auth/sign-in`
  - **Description**: Authenticate user with email and password; returns JWT tokens
  - **Request**:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```
  - **Response**:
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "email_confirmed_at": "2025-01-01T10:00:00Z"
  },
  "session": {
    "access_token": "jwt_token",
    "refresh_token": "refresh_token",
    "expires_in": 3600,
    "token_type": "bearer"
  }
}
```
  - **Success**: 200 OK
  - **Errors**: 400 invalid email/password format, 401 invalid credentials

- **POST** `/api/auth/sign-out`
  - **Description**: Sign out authenticated user (invalidates session server-side if tracking)
  - **Request**: (body optional; uses Authorization header)
```json
{}
```
  - **Response**:
```json
{
  "message": "Sign out successful"
}
```
  - **Success**: 200 OK
  - **Errors**: 401 Unauthorized

- **GET** `/api/me`
  - **Description**: Returns authenticated user context (minimal) and hydration flags
  - **Query**: none
  - **Response**:
```json
{
  "userId": "uuid",
  "email": "user@example.com",
  "emailVerified": true,
  "hasProfile": true,
  "hasPreferences": true
}
```
  - **Success**: 200 OK
  - **Errors**: 401 Unauthorized

### 2.2 Profiles
- **GET** `/api/profile`
  - **Description**: Get current user's profile
  - **Response**:
```json
{
  "user_id": "uuid",
  "timezone": "Europe/Warsaw",
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-02T10:00:00Z"
}
```
  - **Success**: 200 OK
  - **Errors**: 401, 404 if not initialized

- **PUT** `/api/profile`
  - **Description**: Update profile (timezone only)
  - **Request**:
```json
{
  "timezone": "Europe/Warsaw"
}
```
  - **Response**: Profile object (same as GET)
  - **Success**: 200 OK
  - **Errors**: 400 invalid timezone, 401

### 2.3 Preferences
- **GET** `/api/preferences`
  - **Description**: Get current user's preferences
  - **Response**:
```json
{
  "user_id": "uuid",
  "active_categories": ["uuid", "uuid"],
  "report_dow": 0,
  "report_hour": 2,
  "preferred_delivery_channels": ["in_app", "email"],
  "email_unsubscribed_at": null,
  "max_daily_notes": 4,
  "created_at": "2025-01-01T10:00:00Z",
  "updated_at": "2025-01-02T10:00:00Z"
}
```
  - **Success**: 200 OK
  - **Errors**: 401, 404 if not initialized

- **PUT** `/api/preferences`
  - **Description**: Update preferences; enforces constraints and triggers validation
  - **Request**:
```json
{
  "active_categories": ["uuid"],
  "report_dow": 0,
  "report_hour": 2,
  "preferred_delivery_channels": ["in_app"],
  "email_unsubscribed_at": null,
  "max_daily_notes": 4
}
```
  - **Response**: Preferences object (same as GET)
  - **Success**: 200 OK
  - **Errors**: 400/422 validation failure (max 3 categories; dow 0-6; hour 0-23; max_daily_notes 1-10; categories exist), 401

### 2.4 Categories
- **GET** `/api/categories`
  - **Description**: List active categories (public read-only)
  - **Query**:
    - `active` (boolean, default `true`)
    - `sort` (enum: `name_asc`, `name_desc`, default `name_asc`)
  - **Response**:
```json
{
  "items": [
    {"id": "uuid", "slug": "family", "name": "Family", "active": true, "created_at": "2025-01-01T10:00:00Z"}
  ],
  "total": 6,

}
```
  - **Success**: 200 OK
  - **Errors**: none (public)

### 2.5 Notes
- **GET** `/api/notes`
  - **Description**: List user notes with filters
  - **Query**:
    - `category_id` (uuid, optional, repeatable or comma-separated)
    - `from` (ISO datetime, optional)
    - `to` (ISO datetime, optional)
    - `include_deleted` (boolean, default false)
    - `limit` (int, default 20, max 100)
    - `offset` (int, default 0)
    - `sort` (enum: `created_at_desc` default, `created_at_asc`, `updated_at_desc`)
  - **Response**:
```json
{
  "items": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "category_id": "uuid",
      "title": "string|null",
      "content": "string",
      "created_at": "2025-01-01T10:00:00Z",
      "updated_at": "2025-01-02T10:00:00Z",
      "deleted_at": null
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```
  - **Success**: 200 OK
  - **Errors**: 401

- **POST** `/api/notes`
  - **Description**: Create a note; enforces active category and per-day per-category limit
  - **Request**:
```json
{
  "category_id": "uuid",
  "title": "string|null",
  "content": "string (<=1000 chars)"
}
```
  - **Response**: Note object
  - **Success**: 201 Created
  - **Errors**: 400/422 validation, 403 category not active in preferences, 409 daily limit reached, 401

- **GET** `/api/notes/{id}`
  - **Description**: Get a single note by id (owner only)
  - **Success**: 200 OK
  - **Errors**: 401, 404

- **PUT** `/api/notes/{id}`
  - **Description**: Update a note (title/content/category). Category changes re-check active category constraint
  - **Request**:
```json
{
  "category_id": "uuid",
  "title": "string|null",
  "content": "string (<=1000 chars)"
}
```
  - **Response**: Note object
  - **Success**: 200 OK
  - **Errors**: 400/422 validation, 403 invalid category for user, 401, 404

- **DELETE** `/api/notes/{id}`
  - **Description**: Soft delete note (sets `deleted_at`)
  - **Success**: 204 No Content
  - **Errors**: 401, 404

### 2.6 Dashboard
- **GET** `/api/dashboard`
  - **Description**: Aggregated dashboard data (progress per category, streaks, recent reports); cached 5 minutes; invalidated on note CRUD and report generation
  - **Query**:
    - `timezone` (default profile timezone)
    - `since` (default 4 weeks)
  - **Response**:
```json
{
  "summary": {
    "active_categories": ["uuid"],
    "notes_count": {"uuid": 12},
    "streak_days": 5
  },
  "recent_reports": [
    {"id": "uuid", "generated_by": "scheduled", "created_at": "2025-01-06T02:00:00Z"}
  ]
}
```
  - **Success**: 200 OK (with `Cache-Control: private, max-age=300`)
  - **Errors**: 401

### 2.7 Reports
- **GET** `/api/reports`
  - **Description**: List user reports with filtering
  - **Query**:
    - `week_start_local` (ISO date `YYYY-MM-DD`, optional; computed via profile timezone if not provided)
    - `generated_by` (enum: `scheduled`, `on_demand`, optional)
    - `include_deleted` (boolean, default false)
    - `limit` (int, default 20, max 100)
    - `offset` (int, default 0)
    - `sort` (enum: `created_at_desc` default, `created_at_asc`)
  - **Response**:
```json
{
  "items": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "generated_by": "scheduled",
      "html": "<html>...</html>",
      "text_version": "string|null",
      "pdf_path": "string|null",
      "llm_model": "string|null",
      "system_prompt_version": "string|null",
      "categories_snapshot": [],
      "created_at": "2025-01-06T02:00:00Z",
      "updated_at": "2025-01-06T02:00:00Z",
      "deleted_at": null
    }
  ],
  "total": 10,
  "limit": 20,
  "offset": 0
}
```
  - **Success**: 200 OK
  - **Errors**: 401

- **GET** `/api/reports/{id}`
  - **Description**: Get single report
  - **Success**: 200 OK
  - **Errors**: 401, 404

- **POST** `/api/reports/generate`
  - **Description**: Generate a new on-demand report (max 3/week); returns created report
  - **Idempotency**: Support `Idempotency-Key` header to avoid duplicates
  - **Request**:
```json
{
  "include_categories": ["uuid"],
}
```
  - **Response**: Report object (same shape as GET)
  - **Success**: 201 Created
  - **Errors**: 409 weekly on-demand limit reached, 400 invalid categories, 401

- **DELETE** `/api/reports/{id}`
  - **Description**: Soft delete report (owner only)
  - **Success**: 204 No Content
  - **Errors**: 401, 404

### 2.8 Report Deliveries
- **GET** `/api/report-deliveries`
  - **Description**: List deliveries for current user (optional filtering)
  - **Query**:
    - `report_id` (uuid, optional)
    - `channel` (enum: `in_app`, `email`, optional)
    - `status` (enum: `queued`, `sent`, `opened`, optional)
    - `limit` (int, default 20, max 100)
    - `offset` (int, default 0)
  - **Response**:
```json
{
  "items": [
    {
      "id": "uuid",
      "report_id": "uuid",
      "user_id": "uuid",
      "channel": "in_app",
      "status": "sent",
      "queued_at": "2025-01-06T02:00:00Z",
      "sent_at": "2025-01-06T02:01:00Z",
      "opened_at": null,
      "created_at": "2025-01-06T02:00:00Z",
      "updated_at": "2025-01-06T02:01:00Z"
    }
  ],
  "total": 2,
  "limit": 20,
  "offset": 0
}
```
  - **Success**: 200 OK
  - **Errors**: 401

- **POST** `/api/reports/{id}/deliveries/email`
  - **Description**: Request/queue email delivery for a report if user preferences include `email`
  - **Response**:
```json
{
  "delivery": {"id": "uuid", "status": "queued", "channel": "email"}
}
```
  - **Success**: 202 Accepted (queued)
  - **Errors**: 400 email unsubscribed, 409 existing delivery, 401, 404

- **POST** `/api/report-deliveries/{id}/mark-opened`
  - **Description**: Mark delivery as opened (used for in-app open tracking)
  - **Success**: 204 No Content
  - **Errors**: 401, 404

### 2.9 Report Feedback
- **POST** `/api/feedback`
  - **Description**: Submit feedback for a report (1:1). If exists, 409 unless `upsert=true`
  - **Query**: `upsert` (boolean, default false)
  - **Request**:
```json
{
  "report_id": "uuid",
  "rating": -1,
  "comment": "string|null"
}
```
  - **Response**:
```json
{
  "id": "uuid",
  "report_id": "uuid",
  "user_id": "uuid",
  "rating": -1,
  "comment": "string|null",
  "created_at": "2025-01-06T02:05:00Z",
  "updated_at": "2025-01-06T02:05:00Z"
}
```
  - **Success**: 201 Created (or 200 OK if `upsert=true`)
  - **Errors**: 400 rating not in [-1,0,1], 422 comment too long (>300), 409 already exists, 401, 404 report not found

- **GET** `/api/feedback/{report_id}`
  - **Description**: Get feedback for a report (owner only)
  - **Success**: 200 OK
  - **Errors**: 401, 404

### 2.10 Analytics Events
- **POST** `/api/analytics/events`
  - **Description**: Record an analytics event (source: `web` or `api`)
  - **Request**:
```json
{
  "event_name": "note_created",
  "source": "web",
  "schema_version": 1,
  "properties": {"category_id": "uuid"}
}
```
  - **Response**:
```json
{"id": 12345}
```
  - **Success**: 201 Created
  - **Errors**: 400 invalid payload, 401

- **GET** `/api/analytics/events`
  - **Description**: (Optional, authenticated user) List own events for debugging
  - **Query**: `event_name`, `from`, `to`, `limit`, `offset`
  - **Success**: 200 OK
  - **Errors**: 401

### 2.11 Internal (Service Role Only)
- **POST** `/internal/cron/reports/weekly-run`
  - **Description**: Generate scheduled weekly reports for due users (service role)
  - **Auth**: Service role header/token only
  - **Success**: 202 Accepted
  - **Errors**: 403 forbidden

- **POST** `/internal/cron/retention/cleanup`
  - **Description**: Hard delete data older than 6 months and remove PDFs
  - **Auth**: Service role header/token only
  - **Success**: 202 Accepted
  - **Errors**: 403 forbidden

## 3. Authentication and Authorization
- **Mechanism**: Bearer Supabase JWT sent by frontend. Backend validates JWT against Supabase and forwards the user JWT when querying the database to enforce RLS (`user_id = auth.uid()`).
- **RLS**: Enabled on user-owned tables; `categories` has public read-only policy.
- **Service Role**: Used only for internal CRON/report generation, email delivery processing, and retention cleanup; never exposed to user endpoints.
- **Session Enforcement**: All `/api/**` (except `/api/categories` and internal service routes) require `Authorization: Bearer <token>`.

## 4. Validation and Business Logic

### 4.1 Validation Rules (enforced by API + DB triggers)
- **profiles**
  - `timezone`: must be a valid IANA timezone string
- **preferences**
  - `active_categories`: array of UUIDs; max length 3; all must exist; no duplicates
  - `report_dow`: integer 0-6
  - `report_hour`: integer 0-23
  - `preferred_delivery_channels`: subset of [`in_app`, `email`]
  - `email_unsubscribed_at`: nullable timestamp; when set blocks email deliveries
  - `max_daily_notes`: integer 1-10
- **notes**
  - `content`: string length <= 1000
  - `category_id`: must be in user's `preferences.active_categories`
  - Daily limit: at most `max_daily_notes` per category per local day (uses profile timezone)
- **reports**
  - `generated_by`: enum [`scheduled`, `on_demand`]
  - Weekly uniqueness: at most one `scheduled` report per user per local week
  - Weekly on-demand limit: at most 3 per user per local week (includes soft-deleted)
- **report_feedback**
  - One per report; `rating` in {-1, 0, 1}; `comment` <= 300 chars
- **report_deliveries**
  - Unique per (`report_id`, `channel`)
  - Creating email delivery requires user not unsubscribed and channel present in preferences

### 4.2 Business Logic Implementation
- **JWT Validation**: Middleware validates Supabase JWT and extracts `user_id`; attaches to request context.
- **RLS Enforcement**: All database calls use the user JWT client so that RLS ensures row ownership automatically.
- **Notes Daily Limit**: Before insert, the API counts today’s notes for the category in the user’s timezone (using `util_local_date`) and compares to `max_daily_notes`; responds `409` if exceeded. DB triggers provide an extra safety net.
- **Report Generation**:
  - On-demand: API checks the number of on-demand reports this local week (using `util_local_week_start`) and rejects with `409` on limit exceed; otherwise orchestrates LLM generation and inserts `reports` and default in-app `report_deliveries`.
  - Scheduled: Internal CRON selects due users based on `report_dow`, `report_hour`, and timezone; ensures one scheduled report/week.
- **Deliveries**: Creating `reports` auto-inserts in-app delivery. Email delivery endpoint enqueues a job only if `email` is allowed and not unsubscribed.
- **Feedback**: `POST /api/feedback` enforces single feedback per report; supports `upsert=true` to allow edits.
- **Dashboard Cache**: 5-minute cache stored server-side (keyed by `user_id`); invalidated on note create/update/delete and on report generation.
- **Retention**: Internal endpoint deletes data older than 6 months across relevant tables and removes associated PDFs.
- **Analytics**: API emits analytics events for CRUD and report actions; stored with 6-month retention.
- **Pagination & Sorting**: Limit/offset with max limits; default sort by indexed columns (e.g., `created_at DESC`).
- **Rate Limiting**: Per-IP and per-user limits (e.g., `POST /api/reports/generate` tighter rate), 429 responses.
- **Idempotency**: Accept `Idempotency-Key` on `POST /api/reports/generate` and email delivery endpoint to prevent duplicate work.

### 4.3 Index-Aware Querying
- **notes**: Use `idx_notes_user_created_at` and `idx_notes_user_category_created_at` for listing and filtering by `category_id` and date range with `created_at` order.
- **reports**: Use `idx_reports_user_created_at` and `idx_reports_user_generated_by_created_at` for list and filters.
- **report_deliveries**: Use `idx_report_deliveries_user_channel_status` for channel/status filtering.
- **analytics_events**: Use `idx_analytics_events_user_created_at` and `idx_analytics_events_event` for event/time filters.

### 4.4 Error Codes & Messages (common)
- `400 Bad Request`: Invalid request payload or parameters
- `401 Unauthorized`: Missing/invalid JWT
- `403 Forbidden`: Access denied (e.g., email unsubscribed)
- `404 Not Found`: Resource does not exist or not owned by user
- `409 Conflict`: Business rule violation (e.g., daily limit, weekly limit, duplicate delivery)
- `422 Unprocessable Entity`: Field-level validation errors (lengths, enums)
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Unexpected failure

### 4.5 Response and Error Shape
- **Success envelope** (list): `{ "items": [...], "total": n, "limit": n, "offset": n }`
- **Success envelope** (single): object only, no extra wrapper
- **Error envelope**:
```json
{
  "error": {
    "code": "string",
    "message": "human readable",
    "details": {"field": "reason"}
  }
}
```

### 4.6 Security Considerations
- Validate and sanitize all inputs; JSON schema validation per route
- Enforce CORS for the frontend origin only
- Use HTTPS everywhere; HSTS enabled at the edge
- Store service role secret in server env only; never expose to clients
- Logging with PII redaction; structured logs
- Audit key actions via `analytics_events`
- Protect internal routes with service role auth and network restrictions (if possible)

### 4.7 OpenAPI & Tooling
- Maintain an OpenAPI 3.1 spec reflecting the above routes and schemas
- Use request/response validators generated from the OpenAPI schema
- Include examples for each route and schemas in the spec
