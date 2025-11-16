# Auto Report Generation - Flow Diagram

## High-Level Request Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  Client Request                                                       │
│  POST /api/reports/generate-auto                                     │
│  Headers: { Authorization: Bearer <JWT> }                            │
│  Body: (empty)                                                        │
│                                                                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  generateAutoReportHandler()                                         │
│  src/controllers/reports.controller.ts                              │
│                                                                       │
└────────────────────────────┬────────────────────────────────────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
                ▼            ▼            ▼
          (Step 1)      (Step 2)      (Step 3)
       Authenticate    Initialize   Fetch User
                      Clients      Preferences
                                        │
                                    active_categories
                                        │
                        ┌───────────────┴───────────────┐
                        │ Any active categories?        │
                        └───────────────┬───────────────┘
                                        │
                        ┌───────────────┴───────────────┐
                        │                               │
                    NO │                           YES  │
                        ▼                               ▼
                   Return 204              (Step 5)
                 (Silent Skip)         Fetch Timezone
                                       from profile
                                            │
                                        ▼
                                (Step 6) Validate
                                Categories in System
                                        │
                        ┌───────────────┴───────────────┐
                        │                               │
                    NO  │                           YES │
                        ▼                               ▼
                   Return 204              (Step 7)
                 (Silent Skip)         Check Weekly Limit
                                      (3 reports/week)
                                            │
                        ┌───────────────────┼───────────────────┐
                        │                   │                   │
                    YES │               NO  │               YES │
                (limit  │         (under     │         (at or
                 reached)│          limit)   │          over)
                        │                   │                   │
                        ▼                   ▼                   ▼
                   Return 204        (Step 8)            Return 204
                 (Silent Skip)    Fetch Notes        (Silent Skip)
                            from Active Categories
                                    │
                        ┌───────────┴───────────┐
                        │                       │
                    NO  │                   YES │
                (no      │              (notes  │
                 notes)  │              found)  │
                        │                       │
                        ▼                       ▼
                   Return 204          (Step 10)
                 (Silent Skip)      Call OpenRouter
                                   generateWeeklyReport()
                                            │
                                            │ LLM Response
                                            │ {
                                            │   html,
                                            │   text_version,
                                            │   llm_model,
                                            │   system_prompt_version
                                            │ }
                                            │
                                            ▼
                                    (Step 11)
                                 Insert Report to DB
                                with generated_by:
                                  'scheduled'
                                            │
                                            ▼
                        ┌───────────────────┴────────────────┐
                        │                                    │
                        │          Success?                  │
                        │                                    │
                    NO  │                                YES │
                        │                                    │
                        ▼                                    ▼
                  Return 500                        Return 201 Created
                (Server Error)                  with Location header
                                              + Full report JSON
```

---

## Detailed Decision Tree

```
                    START
                      │
                      ▼
            ┌──────────────────┐
            │ Authenticate     │ ← Check JWT
            │ User             │
            └────────┬─────────┘
                     │
            ┌────────▼────────┐
            │ No JWT?         │ ──YES──▶ 401 UNAUTHORIZED
            └────────┬────────┘
                    NO
                     │
            ┌────────▼──────────────────┐
            │ Fetch                     │
            │ preferences.             │
            │ active_categories        │
            └────────┬──────────────────┘
                     │
            ┌────────▼─────────┐
            │ Prefs not found? │ ──YES──▶ 204 NO CONTENT (skip)
            └────────┬─────────┘
                    NO
                     │
            ┌────────▼─────────────────┐
            │ active_categories       │
            │ empty or null?          │ ──YES──▶ 204 NO CONTENT (skip)
            └────────┬─────────────────┘
                    NO
                     │
            ┌────────▼──────────────────┐
            │ Fetch                     │
            │ profiles.timezone        │
            └────────┬──────────────────┘
                     │
            ┌────────▼──────────┐
            │ Profile not found?│ ──YES──▶ 204 NO CONTENT (skip)
            └────────┬──────────┘
                    NO
                     │
            ┌────────▼────────────────────┐
            │ Validate categories exist   │
            │ in system (active = true)   │
            └────────┬────────────────────┘
                     │
            ┌────────▼──────────────────┐
            │ No valid categories?       │ ──YES──▶ 204 NO CONTENT (skip)
            └────────┬──────────────────┘
                    NO
                     │
            ┌────────▼──────────────────────┐
            │ Check weekly limit           │
            │ Count: on_demand + scheduled │
            │ in this week                 │
            └────────┬──────────────────────┘
                     │
            ┌────────▼──────────┐
            │ Count >= 3?       │ ──YES──▶ 204 NO CONTENT (skip)
            └────────┬──────────┘
                    NO
                     │
            ┌────────▼──────────────────────┐
            │ Fetch notes from             │
            │ active categories            │
            │ (non-deleted, max 100)       │
            └────────┬──────────────────────┘
                     │
            ┌────────▼──────────┐
            │ Notes found?      │ ──NO──▶ 204 NO CONTENT (skip)
            └────────┬──────────┘
                    YES
                     │
            ┌────────▼────────────────────────┐
            │ Call OpenRouter service         │
            │ generateWeeklyReport()          │
            │ pass: notes, categories, tz    │
            └────────┬────────────────────────┘
                     │
            ┌────────▼──────────────────┐
            │ InsufficientDataError?    │ ──YES──▶ 204 NO CONTENT (skip)
            └────────┬──────────────────┘
                    NO
                     │
            ┌────────▼────────────────────┐
            │ Other LLM error?            │ ──YES──▶ 500 SERVER ERROR
            └────────┬────────────────────┘
                    NO
                     │
            ┌────────▼──────────────────────┐
            │ Insert report to DB          │
            │ generated_by: 'scheduled'    │
            └────────┬──────────────────────┘
                     │
            ┌────────▼────────────────┐
            │ Insert successful?      │ ──NO──▶ 500 SERVER ERROR
            └────────┬────────────────┘
                    YES
                     │
                     ▼
            201 CREATED
            Location: /api/reports/{id}
            + Report JSON in response
```

---

## OpenRouter Service Integration

```
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  generateAutoReportHandler                                   │
│  Has: notes[], categories[], timezone                        │
│                                                               │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Call with:
                 │ {
                 │   notes: [
                 │     { id, content, category_id, title }
                 │   ],
                 │   categories: [
                 │     { id, name }
                 │   ],
                 │   preferences: { timezone }
                 │ }
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  openRouterService.generateWeeklyReport()                    │
│                                                               │
│  1. Validate minimum notes provided                          │
│  2. Build system prompt:                                     │
│     "You are LifeSync AI...                                 │
│      Categories: [Family, Friends, Pets, Body, Mind...]     │
│      Timezone: User's timezone                              │
│      Analyze these notes and provide..."                    │
│                                                               │
│  3. Group notes by category:                                 │
│     {                                                         │
│       "Family": ["note1", "note2", ...],                     │
│       "Friends": ["note3", "note4", ...],                    │
│       ...                                                     │
│     }                                                         │
│                                                               │
│  4. Send to OpenRouter API with:                             │
│     - system prompt                                          │
│     - user message (grouped notes)                           │
│     - model: google/openai/gpt-4o-mini                       │
│     - temperature, max_tokens, etc.                          │
│                                                               │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ OpenRouter API
                 │ ──[HTTPS POST]──▶ OpenRouter Servers
                 │                  
                 │                  LLM analyzes:
                 │                  - Life balance
                 │                  - Strengths
                 │                  - Improvements
                 │                  - Recommendations
                 │
                 │◀─[Response]─────
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                                                               │
│  openRouterService Response:                                 │
│  {                                                            │
│    html: "<html><h1>Weekly Report</h1>...</html>",          │
│    text_version: "Weekly Report\n\nAnalysis...",            │
│    llm_model: "google/openai/gpt-4o-mini",                  │
│    system_prompt_version: "v1.0"                            │
│  }                                                            │
│                                                               │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Return to generateAutoReportHandler
                 │
                 ▼
      Save to reports table
      Return 201 Created
```

---

## Database Record Flow

```
Before:
  ┌─────────────────────┐
  │  preferences        │
  ├─────────────────────┤
  │ user_id: UUID       │
  │ active_categories:  │
  │  [UUID1, UUID2, ... ]  ◀─── User selected these
  │ report_dow: 1       │
  │ report_hour: 8      │
  └─────────────────────┘

  ┌─────────────────────┐
  │  profiles           │
  ├─────────────────────┤
  │ user_id: UUID       │
  │ timezone: 'UTC'     │ ◀─── Used for week calculation
  └─────────────────────┘

  ┌─────────────────────┐
  │  notes              │
  ├─────────────────────┤
  │ id: UUID            │
  │ user_id: UUID       │
  │ category_id: UUID1  │ ◀─── From active_categories
  │ content: "..."      │
  │ created_at: DATE    │
  │ deleted_at: null    │
  └─────────────────────┘


Processing:
  1. Fetch active_categories: [UUID1, UUID2, UUID3]
  2. Fetch timezone: "America/New_York"
  3. Query notes WHERE category_id IN (UUID1, UUID2, UUID3)
  4. Get results: [Note1, Note2, Note3, ...]
  5. Call OpenRouter with these notes
  6. Receive generated content


After:
  ┌─────────────────────────────────────────┐
  │  reports (NEW RECORD)                   │
  ├─────────────────────────────────────────┤
  │ id: NEW_UUID                            │
  │ user_id: UUID                           │
  │ generated_by: 'scheduled'               │ ◀─── Our endpoint
  │ html: "<html>...</html>"                │ ◀─── From OpenRouter
  │ text_version: "..."                     │ ◀─── From OpenRouter
  │ llm_model: "google/openai/gpt-4o-mini" │ ◀─── From OpenRouter
  │ system_prompt_version: "v1.0"           │ ◀─── From OpenRouter
  │ categories_snapshot: JSON               │ ◀─── Snapshot of active
  │ created_at: NOW                         │
  │ deleted_at: null                        │
  └─────────────────────────────────────────┘
```

---

## Request/Response Lifecycle

```
Client Browser / Server
       │
       │ 1. POST /api/reports/generate-auto
       │    Headers: { Authorization: Bearer eyJ... }
       │    Body: (empty)
       │
       ├─────────────────────────────────────────────────────►
       │
       │ API Server
       │     │
       │     ├─ authMiddleware → verify JWT ✓
       │     │
       │     ├─ generateAutoReportHandler()
       │     │    │
       │     │    ├─ Query DB: preferences
       │     │    ├─ Query DB: profiles
       │     │    ├─ Query DB: categories (validation)
       │     │    ├─ Query DB: count reports (weekly limit)
       │     │    ├─ Query DB: notes
       │     │    │
       │     │    ├─ Call OpenRouter API
       │     │    │    │
       │     │    │    └─ OpenRouter Service
       │     │    │         ├─ Format request
       │     │    │         ├─ Send to OpenRouter
       │     │    │         └─ Parse response
       │     │    │
       │     │    ├─ Insert DB: reports
       │     │    │
       │     │    └─ Build 201 response
       │     │
       │     └─ Response ready
       │
       │◄─────────────────────────────────────────────────────
       │ 2. HTTP/1.1 201 Created
       │    Location: /api/reports/report-uuid
       │    Content-Type: application/json
       │    
       │    {
       │      "id": "report-uuid",
       │      "generated_by": "scheduled",
       │      "html": "<html>...",
       │      ...
       │    }
       │
       └─ Client receives report data
```

---

## Silent Skip Scenarios

```
User Request Flow with Silent Skips:

                Start
                  │
                  ▼
    ┌─────────────────────────┐
    │ Authenticate            │
    │ (Check JWT)             │
    └─────────────┬───────────┘
                  │
              ✓ Valid
                  │
                  ▼
    ┌─────────────────────────┐     NO─ Preferences
    │ Fetch Preferences       │      │  not found?
    └─────────────┬───────────┘      │
                  │         ────┬─────┘
              ✓ Found            │
                  │              ▼
                  │          204 NO CONTENT
                  │          (Silent Skip #1)
                  ▼
    ┌─────────────────────────┐     NO─ Active
    │ Check active_categories │      │  categories?
    └─────────────┬───────────┘      │
                  │         ────┬─────┘
             ✓ Yes │             │
                  │              ▼
                  │          204 NO CONTENT
                  │          (Silent Skip #2)
                  │
                  ▼
    ┌─────────────────────────┐     NO─ Timezone
    │ Fetch Timezone          │      │  found?
    └─────────────┬───────────┘      │
                  │         ────┬─────┘
              ✓ Found │          │
                  │              ▼
                  │          204 NO CONTENT
                  │          (Silent Skip #3)
                  │
                  ▼
    ┌──────────────────────────┐    NO─ Categories
    │ Validate Categories      │     │  valid in
    │ in System                │     │  system?
    └─────────────┬────────────┘     │
                  │         ───┬──────┘
             ✓ Valid │         │
                  │              ▼
                  │          204 NO CONTENT
                  │          (Silent Skip #4)
                  │
                  ▼
    ┌──────────────────────────┐    NO─ Within
    │ Check Weekly Limit       │     │  limit?
    │ (on_demand + scheduled)  │     │
    └─────────────┬────────────┘     │
                  │         ───┬──────┘
              ✓ Yes │         │
                  │              ▼
                  │          204 NO CONTENT
                  │          (Silent Skip #5)
                  │
                  ▼
    ┌──────────────────────────┐    NO─ Notes
    │ Fetch Notes              │     │  exist?
    │ from Active Categories   │     │
    └─────────────┬────────────┘     │
                  │         ───┬──────┘
             ✓ Yes │         │
                  │              ▼
                  │          204 NO CONTENT
                  │          (Silent Skip #6)
                  │
                  ▼
    ┌──────────────────────────┐
    │ Call OpenRouter Service  │
    │ generateWeeklyReport()   │
    └─────────────┬────────────┘
                  │
        ┌─────────┴──────────┐
        │                    │
    ✓ Success       ✓ Insufficient Data
        │                    │
        ▼                    ▼
    Continue           204 NO CONTENT
                       (Silent Skip #7)
        │
        │
        ▼
    ┌──────────────────────────┐
    │ Save Report to DB        │
    │ (generated_by:'scheduled')
    └─────────────┬────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
    ✓ Success          ✗ Failed
        │                   │
        ▼                   ▼
    201 Created         500 Server Error
    + Report Data       + Error Response


All "Silent Skip" scenarios return 204 NO CONTENT
instead of errors, suitable for scheduled tasks!
```

---

## Key Takeaway

The beautiful design of this endpoint is that it returns **204 No Content** for all normal conditions where no report is generated:
- No categories selected
- No notes available
- Weekly limit reached
- Missing data

This makes it **perfect for scheduled/cron execution** where you don't want to handle errors for normal conditions. Only returns error (5xx) for actual system problems.

