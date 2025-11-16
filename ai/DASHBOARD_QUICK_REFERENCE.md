# Dashboard Endpoint - Quick Reference Guide

## Overview
- **Endpoint**: `GET /api/dashboard`
- **Purpose**: Aggregated dashboard data (progress per category, streaks, recent reports)
- **Authentication**: Required (Bearer JWT)
- **Caching**: 5 minutes (Cache-Control: private, max-age=300)

## Quick API Usage

### Request
```bash
GET /api/dashboard?timezone=Europe/Warsaw&since=2025-01-06
Authorization: Bearer <JWT>
```

### Response (200 OK)
```json
{
  "summary": {
    "active_categories": ["uuid1", "uuid2"],
    "notes_count": {"uuid1": 12, "uuid2": 8},
    "streak_days": 5
  },
  "recent_reports": [
    {"id": "uuid", "generated_by": "scheduled", "created_at": "2025-01-06T02:00:00Z"}
  ]
}
```

## Files to Create

| File | Purpose |
|------|---------|
| `src/validation/dashboard.ts` | Zod schemas for query validation |
| `src/services/dashboard.service.ts` | Business logic for data aggregation |
| `src/controllers/dashboard.controller.ts` | HTTP request/response handling |
| `src/routes/dashboard.router.ts` | Route definition |

## Files to Update

| File | Changes |
|------|---------|
| `src/index.ts` | Register dashboard router |
| `src/services/notes.service.ts` | Add cache invalidation on note changes |
| `src/services/reports.service.ts` | Add cache invalidation on report generation |

## Key Implementation Details

### Validation Schema
- `timezone`: Optional IANA timezone string
- `since`: Optional ISO date (YYYY-MM-DD), must be in past/today

### Service Methods
1. `getDashboard(userId, query)` - Main entry point
2. `getUserPreferences(userId)` - Fetch active categories
3. `getProfileTimezone(userId)` - Default timezone
4. `getNotesCounts(userId, since, activeCategories)` - Category-wise note counts
5. `calculateStreak(userId)` - Consecutive days with notes
6. `getRecentReports(userId)` - Last 10 reports

### Database Queries
1. Select preferences (user_id)
2. Select profile timezone (user_id)
3. Count notes grouped by category with date filter
4. Select distinct note dates for streak calculation
5. Select 10 most recent reports

### Error Handling
- **400**: Invalid query parameters (timezone format, date format)
- **401**: Missing/invalid authentication
- **500**: Server errors (database, unexpected exceptions)

### Cache Invalidation Triggers
- ✓ Note created
- ✓ Note updated
- ✓ Note deleted
- ✓ Report generated

## Streak Calculation Algorithm

```
Input: user_id, timezone
Output: Number of consecutive days from today backward with at least one note

1. Query distinct note dates in past 90 days (user's timezone)
2. Sort by date descending
3. Initialize: streak = 0, expected_date = today
4. For each date:
   - If date == expected_date: streak++
   - Else if date < expected_date: break
   - expected_date = date - 1 day
5. Return streak
```

### Edge Cases
- No notes → streak = 0
- Notes only in past → streak = 0
- All dates consecutive → streak = total days

## Timezone Handling

**SQL Pattern:**
```sql
SELECT DISTINCT DATE(created_at AT TIME ZONE $timezone)
FROM notes
WHERE user_id = $1 AND deleted_at IS NULL
ORDER BY DATE(created_at AT TIME ZONE $timezone) DESC
```

**Logic:**
1. If timezone in query → use that
2. Else → fetch from profile
3. Use timezone for date calculations (not UTC)

## Performance Targets

| Metric | Target |
|--------|--------|
| P50 Latency | < 200ms (with cache) |
| P95 Latency | < 500ms (cache miss) |
| P99 Latency | < 1000ms (worst case) |

## Database Indexes (Recommended)

```sql
-- Composite indexes for efficient queries
CREATE INDEX idx_notes_user_created_deleted 
  ON notes(user_id, created_at, deleted_at);

CREATE INDEX idx_reports_user_created_deleted 
  ON reports(user_id, created_at, deleted_at);

CREATE INDEX idx_preferences_user_id 
  ON preferences(user_id);
```

## Logging Points

- `[INFO]` Dashboard requested for user ${userId}
- `[DEBUG]` Dashboard query params: timezone=${tz}, since=${since}
- `[ERROR]` Dashboard service error: ${error.message}
- `[INFO]` Dashboard cache invalidated for user ${userId}

## Testing Checklist

- [ ] Valid request returns 200 with cache headers
- [ ] Missing auth returns 401
- [ ] Invalid timezone returns 400 with details
- [ ] Invalid date format returns 400 with details
- [ ] Cache-Control header set correctly
- [ ] Streak calculation correct for consecutive days
- [ ] Notes count aggregation accurate
- [ ] Recent reports limited to 10
- [ ] Only non-deleted items returned
- [ ] Cache invalidation triggers work

## Implementation Order

1. Create validation schema
2. Implement service (standalone, testable)
3. Create controller (request/response handling)
4. Create router
5. Register in main app (index.ts)
6. Add cache invalidation hooks
7. Add tests
8. Manual testing with curl
9. Code review
10. Merge to main

## Related Documentation

- Full Plan: `ai/dashboard-implementation-plan.md`
- API Plan: `api/api-plan.md` (Section 2.6)
- Database Plan: `api/db-plan.md`
- Type Definitions: `src/types.ts` (Lines 144-164)
