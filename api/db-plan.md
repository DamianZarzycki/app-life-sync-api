# Database Schema Plan - LifeSync

## 1. Database Schema Overview

### Architecture Notes
- **Supabase Auth**: `auth.users` table is fully managed by Supabase
- **Backend Middleware**: Node.js/Express backend acts as middleware between Frontend and Supabase
- **JWT Flow**: Frontend → Backend (validates JWT) → Supabase (with user JWT)
- **Service Role**: Backend uses service role for system operations (CRON, reports)

### Core Tables

#### `profiles`
- **Purpose**: User profile information (1:1 with auth.users)
- **Columns**:
  - `user_id` (UUID, PK, FK → auth.users.id)
  - `timezone` (TEXT, NOT NULL, DEFAULT 'UTC')
  - `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
  - `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
- **Constraints**: Valid timezone check
- **Note**: Created automatically when user signs up (trigger or backend logic)

#### `categories`
- **Purpose**: Note categories (extensible, seeded with 6 defaults)
- **Columns**:
  - `id` (UUID, PK, DEFAULT gen_random_uuid())
  - `slug` (TEXT, NOT NULL, UNIQUE)
  - `name` (TEXT, NOT NULL)
  - `active` (BOOLEAN, NOT NULL, DEFAULT true)
  - `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())

#### `preferences`
- **Purpose**: User preferences (1:1 with profiles)
- **Columns**:
  - `user_id` (UUID, PK, FK → profiles.user_id)
  - `active_categories` (UUID[], NOT NULL, DEFAULT '{}')
  - `report_dow` (SMALLINT, NOT NULL, DEFAULT 0) -- 0=Monday
  - `report_hour` (SMALLINT, NOT NULL, DEFAULT 2) -- 0-23
  - `preferred_delivery_channels` (delivery_channel_type[], NOT NULL, DEFAULT ['in_app'])
  - `email_unsubscribed_at` (TIMESTAMPTZ, NULL)
  - `max_daily_notes` (SMALLINT, NOT NULL, DEFAULT 4)
  - `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
  - `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
- **Constraints**: 
  - Max 3 active categories
  - Report hour 0-23
  - Report day 0-6
  - Max daily notes 1-10

#### `notes`
- **Purpose**: User notes by category
- **Columns**:
  - `id` (UUID, PK, DEFAULT gen_random_uuid())
  - `user_id` (UUID, NOT NULL, FK → auth.users.id)
  - `category_id` (UUID, NOT NULL, FK → categories.id)
  - `title` (TEXT, NULL)
  - `content` (TEXT, NOT NULL)
  - `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
  - `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
  - `deleted_at` (TIMESTAMPTZ, NULL) -- Soft delete
- **Constraints**: Content max 1000 characters

#### `reports`
- **Purpose**: Weekly reports (scheduled + on-demand)
- **Columns**:
  - `id` (UUID, PK, DEFAULT gen_random_uuid())
  - `user_id` (UUID, NOT NULL, FK → auth.users.id)
  - `generated_by` (generated_by_type, NOT NULL) -- 'scheduled' or 'on_demand'
  - `html` (TEXT, NOT NULL)
  - `text_version` (TEXT, NULL)
  - `pdf_path` (TEXT, NULL)
  - `llm_model` (TEXT, NULL)
  - `system_prompt_version` (TEXT, NULL)
  - `categories_snapshot` (JSONB, NOT NULL, DEFAULT '[]')
  - `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
  - `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
  - `deleted_at` (TIMESTAMPTZ, NULL) -- Soft delete

#### `report_deliveries`
- **Purpose**: Report delivery tracking (unique per report+channel)
- **Columns**:
  - `id` (UUID, PK, DEFAULT gen_random_uuid())
  - `report_id` (UUID, NOT NULL, FK → reports.id)
  - `user_id` (UUID, NOT NULL, FK → auth.users.id) -- Denormalized for RLS
  - `channel` (delivery_channel_type, NOT NULL) -- 'in_app' or 'email'
  - `status` (delivery_status_type, NOT NULL, DEFAULT 'queued') -- 'queued', 'sent', 'opened'
  - `queued_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
  - `sent_at` (TIMESTAMPTZ, NULL)
  - `opened_at` (TIMESTAMPTZ, NULL)
  - `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
  - `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
- **Constraints**: UNIQUE(report_id, channel)

#### `report_feedback`
- **Purpose**: User feedback on reports (1:1 with reports)
- **Columns**:
  - `id` (UUID, PK, DEFAULT gen_random_uuid())
  - `report_id` (UUID, NOT NULL, UNIQUE, FK → reports.id)
  - `user_id` (UUID, NOT NULL, FK → auth.users.id)
  - `rating` (SMALLINT, NOT NULL) -- -1, 0, 1
  - `comment` (TEXT, NULL)
  - `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
  - `updated_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())
- **Constraints**: 
  - Rating in (-1, 0, 1)
  - Comment max 300 characters

#### `analytics_events`
- **Purpose**: Event analytics (temporary, 6-month retention)
- **Columns**:
  - `id` (BIGSERIAL, PK)
  - `user_id` (UUID, NOT NULL, FK → auth.users.id)
  - `event_name` (TEXT, NOT NULL)
  - `source` (TEXT, NOT NULL) -- 'web', 'api'
  - `schema_version` (SMALLINT, NOT NULL, DEFAULT 1)
  - `properties` (JSONB, NOT NULL, DEFAULT '{}')
  - `created_at` (TIMESTAMPTZ, NOT NULL, DEFAULT now())

### Enums

```sql
CREATE TYPE generated_by_type AS ENUM ('scheduled', 'on_demand');
CREATE TYPE delivery_channel_type AS ENUM ('in_app', 'email');
CREATE TYPE delivery_status_type AS ENUM ('queued', 'sent', 'opened');
```

## 2. Relationships

- `profiles` 1:1 `auth.users` (profiles.user_id → auth.users.id)
- `preferences` 1:1 `profiles` (preferences.user_id → profiles.user_id)
- `categories` 1:N `notes` (notes.category_id → categories.id)
- `notes` N:1 `auth.users` (notes.user_id → auth.users.id)
- `reports` N:1 `auth.users` (reports.user_id → auth.users.id)
- `report_deliveries` N:1 `reports` (report_deliveries.report_id → reports.id)
- `report_deliveries` N:1 `auth.users` (report_deliveries.user_id → auth.users.id)
- `report_feedback` 1:1 `reports` (report_feedback.report_id → reports.id)
- `report_feedback` N:1 `auth.users` (report_feedback.user_id → auth.users.id)
- `analytics_events` N:1 `auth.users` (analytics_events.user_id → auth.users.id)

## 3. Business Logic & Triggers

### Key Business Rules

1. **Note Categories**: Users can only add notes to categories in their `preferences.active_categories` (max 3)
2. **Daily Limits**: Max 4 notes per category per day (calculated in user's timezone)
3. **Report Limits**: 
   - 1 scheduled report per week (unique per user+week)
   - Max 3 on-demand reports per week (includes soft-deleted)
4. **Delivery**: In-app delivery created automatically; email delivery optional based on preferences
5. **Retention**: 6-month hard deletion of all data and PDF files

### Trigger Functions

- `preferences_validate_active_categories()`: Validates active_categories array (no duplicates, all exist)
- `notes_validate_category_against_preferences()`: Ensures notes only added to active categories
- `notes_enforce_daily_limit()`: Enforces daily note limit per category
- `reports_enforce_unique_scheduled_per_week()`: Ensures only 1 scheduled report per week
- `reports_enforce_on_demand_weekly_limit()`: Enforces 3 on-demand reports per week limit
- `reports_auto_insert_in_app_delivery()`: Auto-creates in-app delivery for each report

## 4. Indexes

```sql
-- Categories
CREATE INDEX idx_categories_active ON public.categories (active);

-- Notes
CREATE INDEX idx_notes_user_category_created_at ON public.notes (user_id, category_id, created_at DESC);
CREATE INDEX idx_notes_user_created_at ON public.notes (user_id, created_at DESC);
CREATE INDEX idx_notes_user_not_deleted ON public.notes (user_id) WHERE deleted_at IS NULL;

-- Reports
CREATE INDEX idx_reports_user_created_at ON public.reports (user_id, created_at DESC);
CREATE INDEX idx_reports_user_generated_by_created_at ON public.reports (user_id, generated_by, created_at DESC);
CREATE INDEX idx_reports_not_deleted ON public.reports (user_id) WHERE deleted_at IS NULL;

-- Report Deliveries
CREATE INDEX idx_report_deliveries_user_channel_status ON public.report_deliveries (user_id, channel, status);
CREATE INDEX idx_report_deliveries_report ON public.report_deliveries (report_id);

-- Report Feedback
CREATE INDEX idx_report_feedback_user ON public.report_feedback (user_id);

-- Analytics Events
CREATE INDEX idx_analytics_events_user_created_at ON public.analytics_events (user_id, created_at DESC);
CREATE INDEX idx_analytics_events_event ON public.analytics_events (event_name);
```

## 5. Row Level Security (RLS)

### RLS Policies

All user tables have RLS enabled with policies:
- `user_id = auth.uid()` for authenticated users
- `categories` has public SELECT access only
- System operations use `service_role` (bypasses RLS)

### Policy Examples

```sql
-- Categories (public read-only)
CREATE POLICY categories_select_all ON public.categories
FOR SELECT TO public USING (true);

-- User data (owner only)
CREATE POLICY profiles_owner_all ON public.profiles
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
```

## 6. Helper Functions

### Time Zone Functions

```sql
-- Get local date from timestamp and timezone
CREATE FUNCTION util_local_date(ts TIMESTAMPTZ, tz TEXT)
RETURNS DATE AS $$
  SELECT (ts AT TIME ZONE tz)::DATE
$$ LANGUAGE SQL STABLE;

-- Get week start (Monday) from timestamp and timezone
CREATE FUNCTION util_local_week_start(ts TIMESTAMPTZ, tz TEXT)
RETURNS DATE AS $$
  -- Implementation returns Monday of the week
$$ LANGUAGE PLPGSQL STABLE;
```

## 7. Views

### `report_weeks`
- **Purpose**: Support week-based filtering of reports
- **Columns**: report_id, user_id, generated_by, created_at, week_start_local, timezone
- **Usage**: Ad-hoc week calculations without materialization

## 8. Data Retention

- **Retention Period**: 6 months
- **Cleanup Method**: CRON job at 02:00 UTC
- **Scope**: Hard deletion of:
  - Notes older than 6 months
  - Reports older than 6 months
  - Report deliveries older than 6 months
  - Report feedback older than 6 months
  - Analytics events older than 6 months
  - Corresponding PDF files

## 9. Implementation Notes

### Authentication & Authorization Flow
1. **Frontend** → sends JWT to **Backend**
2. **Backend** → validates JWT with Supabase
3. **Backend** → forwards request to Supabase with user JWT
4. **Supabase** → applies RLS policies based on `auth.uid()`
5. **System operations** (CRON, reports) → use service role key (bypasses RLS)

### Backend Responsibilities
- JWT validation and user context
- Business logic enforcement (limits, validation)
- Report generation and scheduling
- Email delivery management
- Data retention cleanup (6-month CRON)
- API rate limiting and security

### Scheduler Considerations
- Weekly report generation at user's preferred day/time (timezone-aware)
- Default: Monday 02:00 in user's timezone
- Backend handles timezone mapping for global users
- Service role used for scheduled operations

### User Onboarding
- Users without `preferences` cannot add notes (trigger blocks)
- Backend enforces preference setup during onboarding
- Profile creation handled by backend on first login

### Performance
- No FTS in MVP (can be added later)
- No database caching (handled by UI)
- Ad-hoc time calculations minimize data redundancy
- Backend can implement additional caching layers

### Security
- JWT-based authentication through Supabase
- Backend validates all requests before forwarding
- RLS policies as additional security layer
- Service role for system operations only

## 10. Migration Strategy

1. Create extensions and enums
2. Create helper functions
3. Create tables with constraints
4. Create triggers and functions
5. Create indexes
6. Enable RLS and create policies
7. Seed default categories
8. Set up retention CRON job in backend
9. Configure report scheduler in backend
10. Set up backend middleware with Supabase client

## 11. Backend Integration Points

### Supabase Client Configuration
```javascript
// Backend uses two Supabase clients:
// 1. User client (with user JWT) - for user operations
// 2. Service client (with service role key) - for system operations
```

### Key Backend Endpoints
- `POST /api/notes` - Create note (validates limits, forwards to Supabase)
- `GET /api/dashboard` - Get user dashboard data
- `POST /api/reports/generate` - Generate on-demand report
- `GET /api/reports` - Get user reports with filtering
- `POST /api/preferences` - Update user preferences
- `POST /api/feedback` - Submit report feedback

### System Operations (Service Role)
- Weekly report generation (CRON job)
- Data retention cleanup (CRON job)
- Email delivery processing
- Analytics data processing

This schema supports all requirements from the PRD while maintaining scalability, security, and performance for the LifeSync application with proper backend middleware architecture.
