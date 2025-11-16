# Auto Report Generation Implementation ✅

**Status**: Complete  
**Date**: November 11, 2025  
**Location**: 
- `/src/controllers/reports.controller.ts` - New handler function
- `/src/routes/reports.router.ts` - New route endpoint

---

## Overview

A new endpoint that **automatically generates a report based on user preferences** without requiring any request body input.

### Key Characteristics
- ✅ Fetches user's **active_categories** from preferences
- ✅ Fetches user's **timezone** from profile  
- ✅ Generates report from notes in active categories
- ✅ Respects weekly limit (max 3 reports/week)
- ✅ Silently skips (204 No Content) if no categories/notes
- ✅ Saves as `generated_by: 'scheduled'` type
- ✅ Uses OpenRouter service with enhanced context

---

## Endpoint

```
POST /api/reports/generate-auto
Authorization: Bearer <JWT_TOKEN>
```

### Request
- **No request body required**
- **No query parameters**
- **Headers**: 
  - `Authorization: Bearer <jwt_token>` (required)

### Response

**Success (201 Created)**:
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "generated_by": "scheduled",
  "html": "<html>...</html>",
  "text_version": "...",
  "llm_model": "google/openai/gpt-4o-mini",
  "system_prompt_version": "v1.0",
  "categories_snapshot": [...],
  "created_at": "2025-11-11T10:30:00Z",
  ...
}
Location: /api/reports/{id}
```

**Silent Skip (204 No Content)**:
Returned when:
- User has no preferences
- No active categories selected
- No notes exist for active categories
- Weekly limit reached
- Profile not found
- Category validation fails

**Error (401)**: Missing/invalid authentication  
**Error (409)**: Weekly limit exceeded (returns full error details)  
**Error (500)**: Unexpected server error

---

## Implementation Details

### Function: `generateAutoReportHandler()`

**Location**: `src/controllers/reports.controller.ts:205-436`

**Workflow (12 Steps)**:

1. **Authenticate** - Verify JWT token
2. **Initialize clients** - Create Supabase user-scoped client & OpenRouter service
3. **Fetch preferences** - Get `active_categories` from preferences table
4. **Check active categories** - Ensure user has selected categories
5. **Fetch timezone** - Get timezone from profile table
6. **Validate categories** - Ensure active categories exist in system
7. **Check weekly limit** - Count reports this week (on_demand + scheduled)
8. **Fetch notes** - Get all notes from active categories (max 100, non-deleted)
9. **Check minimum notes** - Ensure there are notes to generate from
10. **Generate via OpenRouter** - Call LLM with grouped notes
11. **Insert report** - Save to database with `generated_by: 'scheduled'`
12. **Return report** - 201 Created with Location header

### Key Features

#### Silent Skipping (204 No Content)
Returns 204 instead of error for graceful skipping when:
- No preferences found
- No active categories
- No valid system categories
- No notes available
- Category validation fails
- Notes fetch fails
- Insufficient data for LLM

```typescript
if (!activeCategories || activeCategories.length === 0) {
  console.log(`[INFO] User ${userId} has no active categories, skipping auto report`);
  res.status(204).send();
  return;
}
```

#### Weekly Limit Enforcement
Counts both `on_demand` and `scheduled` reports:
```typescript
const { count } = await userClient
  .from('reports')
  .select('id', { count: 'exact' })
  .eq('user_id', userId)
  .in('generated_by', ['on_demand', 'scheduled'])  // Both types counted
  .gte('created_at', weekStart)
  .lte('created_at', weekEnd);

if (count >= 3) {
  res.status(204).send();  // Skip silently
  return;
}
```

#### Timezone-Aware Week Calculation
```typescript
const now = new Date();
const userDate = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
const dayOfWeek = userDate.getDay();
const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;

const monday = new Date(userDate);
monday.setDate(userDate.getDate() - daysToMonday);
// Calculate Sunday similarly...
```

#### OpenRouter Integration
```typescript
reportContent = await openRouterService.generateWeeklyReport(
  notes,                    // All notes from active categories
  validatedCategories,      // Active categories with metadata
  { timezone }              // User's timezone context
);
```

The OpenRouter service will:
- Group notes by category
- Build system prompt highlighting active categories
- Send to LLM for analysis
- Return formatted HTML + text

---

## Data Flow

```
POST /api/reports/generate-auto
    ↓
authenticate user
    ↓
fetch preferences.active_categories
    ↓
fetch profile.timezone
    ↓
validate categories exist in system
    ↓
check weekly limit (on_demand + scheduled)
    ↓
fetch notes from active categories
    ↓
call openRouterService.generateWeeklyReport()
    ├─ Group notes by category
    ├─ Build system prompt with category focus
    ├─ Call OpenRouter LLM API
    └─ Return HTML + text
    ↓
insert report with generated_by: 'scheduled'
    ↓
return 201 Created or 204 No Content
```

---

## Silent Skipping Reasons

The handler returns **204 No Content** (silent skip) for:

| Scenario | Reason | Log Level |
|----------|--------|-----------|
| No preferences | User profile incomplete | INFO |
| No active categories | User hasn't selected categories | INFO |
| No valid system categories | Categories don't exist or inactive | INFO |
| Weekly limit reached | User at 3 reports/week limit | INFO |
| No notes available | No notes in active categories | INFO |
| Profile not found | User profile missing | INFO |
| Category validation error | Database query failed | ERROR |
| Notes fetch error | Database query failed | ERROR |
| Insufficient data for LLM | OpenRouter service returned error | INFO |

This approach allows **scheduled triggers** (cron jobs) to run without handling error states for normal conditions.

---

## Route Registration

**File**: `src/routes/reports.router.ts:23-25`

```typescript
router.post('/generate-auto', authMiddleware, (req: Request, res: Response, _next: NextFunction) =>
  generateAutoReportHandler(req, res, _next)
);
```

Placed before `/generate` route to ensure path specificity.

---

## Integration with Preferences

This handler works with the user's **preferences** table:

```typescript
{
  user_id: UUID,
  active_categories: UUID[],        // Primary input
  report_dow: number,               // For future scheduled delivery
  report_hour: number,              // For future scheduled delivery
  preferred_delivery_channels: [...],
  max_daily_notes: number,
  ...
}
```

Users select which categories to focus on via `PATCH /api/preferences`:
```json
{
  "active_categories": ["cat-uuid-1", "cat-uuid-2", "cat-uuid-3"]
}
```

---

## Use Cases

### 1. Scheduled Report Generation
A cron job runs this endpoint daily/weekly:
```bash
curl -X POST https://api.lifesynk.app/api/reports/generate-auto \
  -H "Authorization: Bearer USER_JWT_TOKEN" \
  # No body needed!
```

Response: 201 if report created, 204 if skipped

### 2. On-Demand Preference-Based Generation
User clicks "Generate using my preferences" button:
```javascript
const response = await fetch('/api/reports/generate-auto', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### 3. Multi-User Batch Generation
Generate reports for all users in a single operation:
```typescript
// For each user:
POST /api/reports/generate-auto with their JWT
// Some succeed (201), some skip (204), all handled gracefully
```

---

## Error Handling

### Graceful Degradation
The handler logs all skips so admins can monitor:
```
[INFO] User {id} preferences not found, skipping auto report generation
[INFO] User {id} has no active categories, skipping auto report
[INFO] User {id} has no notes for active categories, skipping auto report
[INFO] User {id} at weekly report limit (3/3), skipping auto report
```

### Critical Errors (Non-Silent)
Returns 500 and logs if:
- OpenRouter service fails (not InsufficientDataError)
- Report insertion fails
- Other unexpected errors

---

## Testing Checklist

- [ ] Fetch preferences correctly
- [ ] Handle missing preferences gracefully
- [ ] Fetch timezone from profile
- [ ] Validate active categories exist
- [ ] Respect weekly limit
- [ ] Fetch notes for active categories only
- [ ] Call OpenRouter service with correct data
- [ ] Save report with `generated_by: 'scheduled'`
- [ ] Return 201 with Location header on success
- [ ] Return 204 for all silent skip scenarios
- [ ] Return 401 for missing auth
- [ ] Return 500 for real errors
- [ ] Test with timezone edge cases
- [ ] Test with multiple categories
- [ ] Test with no notes
- [ ] Test when weekly limit reached

---

## Future Enhancements

1. **Scheduled Execution**: Integrate with cron job handler using `report_dow` and `report_hour` from preferences
2. **Focus Weighting**: Modify system prompt to weight active categories more heavily
3. **Email Delivery**: Automatically send generated reports to user's email
4. **Analytics**: Track auto-generation success/skip rates
5. **Customization**: Allow users to set "always focus on these categories"
6. **Performance**: Cache report generation for identical category sets within same hour

---

## Summary

✅ **Implementation Complete**

The `generateAutoReportHandler` endpoint provides a user-preference-driven report generation mechanism that:
- Requires NO request body
- Silently skips inappropriate scenarios
- Respects weekly limits
- Integrates seamlessly with OpenRouter
- Logs all actions for monitoring
- Maintains backward compatibility with existing `/generate` endpoint

**Ready for**: Scheduled execution, user preference-based generation, batch processing

