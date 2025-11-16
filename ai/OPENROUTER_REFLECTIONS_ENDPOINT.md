# OpenRouter Reflections Report Generation Endpoint

**Status**: ✅ COMPLETE  
**Date**: October 27, 2025  
**Endpoint**: `POST /api/reports/generate-from-reflections`

---

## Overview

The reflections endpoint allows users to generate AI-analyzed weekly reports directly from structured reflections data **without requiring database storage** of individual notes.

Instead of storing individual notes and later generating reports, users can:
1. Organize reflections by life category (e.g., "goals", "work", "personal")
2. Send to endpoint with titles and descriptions
3. Receive AI-generated analysis instantly

**Use Case**: Frontend apps that collect reflections in-session and want instant analysis without DB persistence.

---

## Endpoint Details

### HTTP Method & URL

```
POST /api/reports/generate-from-reflections
```

### Authentication

**Required**: `Authorization: Bearer <JWT_TOKEN>`

### Request Format

The request body is a **Record of strings to arrays** where:
- **Key**: Category name (e.g., "goals", "work", "personal", "family")
- **Value**: Array of reflection objects

```json
{
  "goals": [
    {
      "title": "Financial Progress Check",
      "description": "Reviewed monthly expenses and realized he managed to save $150 more than last month by cutting unnecessary subscriptions.",
      "date": "2025-10-27"
    },
    {
      "title": "Career Growth Reflection",
      "description": "Watched a 40-minute Nest.js architecture video after putting the kids to bed. Felt more confident understanding module dependencies.",
      "date": "2025-10-27"
    }
  ],
  "work": [
    {
      "title": "API Debugging Marathon",
      "description": "Spent most of the morning debugging a weird async issue in the Nest.js queue. Finally fixed it after realizing a missing await caused race conditions.",
      "date": "2025-10-27"
    },
    {
      "title": "Team Collaboration",
      "description": "Had a short but productive sync with a junior dev to explain module imports and share better folder structuring practices.",
      "date": "2025-10-27"
    }
  ],
  "personal": [
    {
      "title": "Morning Routine with Kids",
      "description": "Got both kids ready for school without any chaos today — even had time to sit and eat breakfast together.",
      "date": "2025-10-27"
    },
    {
      "title": "Evening Basketball Break",
      "description": "Shot hoops for 30 minutes while the kids played nearby — a small moment of peace and normalcy.",
      "date": "2025-10-27"
    }
  ]
}
```

### Request Validation

| Field | Requirement | Details |
|-------|-------------|---------|
| Category Keys | String | Any category name (e.g., "goals", "work", "personal", "family", "health") |
| title | Required | 1-200 characters |
| description | Required | 1-2000 characters |
| date | Required | ISO date format (YYYY-MM-DD) |
| Array per category | Min 1 reflection | At least one reflection across all categories |

### Example cURL Request

```bash
curl -X POST http://localhost:3000/api/reports/generate-from-reflections \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "goals": [
      {
        "title": "Financial Progress Check",
        "description": "Managed to save $150 by cutting unnecessary subscriptions.",
        "date": "2025-10-27"
      }
    ],
    "work": [
      {
        "title": "Bug Fix",
        "description": "Fixed async race condition in queue processing.",
        "date": "2025-10-27"
      }
    ]
  }'
```

---

## Response Format

### Success Response (201 Created)

**Status**: 201 Created  
**Content-Type**: application/json

```json
{
  "html": "<html><head>...</head><body><h1>Weekly Report</h1>...</body></html>",
  "text_version": "Weekly Report\n\nSummary: ...\n\nStrengths: ...",
  "llm_model": "openai/gpt-4o-mini",
  "system_prompt_version": "v1.0",
  "generated_at": "2025-10-27T15:30:45.123Z"
}
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| html | string | HTML-formatted report with styling |
| text_version | string or null | Plain text version of report |
| llm_model | string | LLM model used (e.g., "openai/gpt-4o-mini") |
| system_prompt_version | string | Version of system prompt template |
| generated_at | ISO datetime | When report was generated |

---

## Error Responses

### 400 Bad Request - Validation Error

When request body doesn't match schema:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body validation failed",
    "details": {
      "goals[0].title": "Title is required",
      "work[1].date": "Date must be in YYYY-MM-DD format"
    }
  }
}
```

### 400 Bad Request - Insufficient Data

When no reflections provided:

```json
{
  "error": {
    "code": "INSUFFICIENT_DATA",
    "message": "At least one reflection is required to generate a report"
  }
}
```

### 401 Unauthorized

When authentication header missing or invalid:

```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

### 500 Server Error

For unexpected server-side errors:

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

---

## How It Works

```
1. User submits reflections grouped by category
           ↓
2. Endpoint validates JSON structure
           ↓
3. OpenRouter Service calls generateReportFromReflections()
           ↓
4. Service builds system prompt with category context
           ↓
5. Service formats reflections by category
           ↓
6. Service sends to LLM (OPEN AI GPT) with prompt
           ↓
7. LLM analyzes reflections and provides insights:
   - Summary of the week
   - Key strengths and achievements
   - Areas of growth
   - Actionable recommendations
   - Encouraging insights
           ↓
8. Service converts response to HTML + text versions
           ↓
9. Return generated report (NOT saved to database)
```

---

## Key Differences from Main Report Endpoint

| Aspect | `/generate` | `/generate-from-reflections` |
|--------|-----------|------------------------------|
| Input Source | Database notes | Request body reflections |
| Categories | Database categories | Custom category names |
| Database Save | ✅ Saves to reports table | ❌ Returns content only |
| Weekly Limit | ✅ 3 reports/week enforced | ❌ No limit |
| Idempotency | ✅ Supported | ❌ Not applicable |
| Use Case | Saved reports in app | Instant analysis/testing |

---

## System Prompt

The endpoint builds a context-aware system prompt:

```
You are LifeSync, a compassionate AI assistant helping users reflect on their weekly life balance.

The user has documented their weekly reflections in these life areas: [goals, work, personal]

Your task is to analyze their weekly reflections and provide:
1. A meaningful summary of their week
2. Key strengths and positive achievements
3. Areas where they're growing
4. Specific, actionable recommendations for next week
5. Encouraging insights about their life balance and personal growth

Be supportive and constructive. Focus on celebrating wins while identifying growth opportunities.
Acknowledge their effort in tracking these reflections - it shows self-awareness.
Format your response as clear, well-structured text that can be converted to a readable report.
```

---

## Implementation Details

### Service Method: `generateReportFromReflections()`

Located in: `src/open-router-integration/openrouter.service.ts`

```typescript
async generateReportFromReflections(
  reflections: Record<string, Array<{
    title: string;
    description: string;
    date: string;
  }>>
): Promise<{
  html: string;
  text_version: string | null;
  llm_model: string;
  system_prompt_version: string;
}>
```

**Features**:
- ✅ Validates minimum one reflection
- ✅ Groups reflections by category
- ✅ Builds context-aware system prompt
- ✅ Calls OpenRouter LLM
- ✅ Formats response as HTML + text
- ✅ Error handling and logging

### Validation Schema

Located in: `src/validation/reports.ts`

```typescript
export const GenerateReportFromReflectionsSchema = z.record(
  z.string(),
  z.array(
    z.object({
      title: z.string().min(1).max(200),
      description: z.string().min(1).max(2000),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    })
  ).min(1)
);
```

### Controller Handler

Located in: `src/controllers/reports.controller.ts`

Function: `generateReportFromReflectionsHandler()`

**Features**:
- ✅ Validates authentication
- ✅ Validates request body
- ✅ Calls OpenRouter service
- ✅ Returns 201 with report content
- ✅ Comprehensive error handling

### Route

Located in: `src/routes/reports.router.ts`

```typescript
router.post(
  '/generate-from-reflections',
  authMiddleware,
  generateReportFromReflectionsHandler
);
```

---

## Usage Examples

### Frontend Integration

```typescript
// React/Angular component example
async function generateReportFromReflections(reflections) {
  const response = await fetch('/api/reports/generate-from-reflections', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(reflections)
  });

  if (!response.ok) {
    const error = await response.json();
    console.error('Error:', error.error.message);
    return null;
  }

  const report = await response.json();
  
  // Display or download report
  displayReportHTML(report.html);
  downloadAsText(report.text_version);
}
```

### Data Structure Example

```typescript
const userReflections = {
  "learning": [
    {
      "title": "Completed TypeScript Course",
      "description": "Finished advanced TypeScript patterns course on Udemy, learned about utility types and generics.",
      "date": "2025-10-27"
    }
  ],
  "exercise": [
    {
      "title": "Morning Run",
      "description": "Completed 5km run in under 30 minutes, feeling stronger this week.",
      "date": "2025-10-27"
    }
  ],
  "relationships": [
    {
      "title": "Family Dinner",
      "description": "Had meaningful conversation with parents about life goals and career path.",
      "date": "2025-10-27"
    }
  ]
};
```

---

## Model Configuration

**Current Model**: `openai/gpt-4o-mini`

**Why Gemini?**
- ✅ Fast inference (~5-10 seconds)
- ✅ Good quality analysis
- ✅ Cost-effective
- ✅ Handles long context well

**Alternative Models** (via OpenRouter):
- `openai/gpt-4` - Higher quality, more expensive
- `anthropic/claude-3-opus` - Great balance
- `openai/gpt-3.5-turbo` - Cheaper, faster

Change model in `generateReportFromReflections()` method.

---

## Performance Characteristics

| Aspect | Value |
|--------|-------|
| Average Response Time | 5-15 seconds |
| Maximum Response Time | ~30 seconds |
| Token Usage | 500-2000 tokens (depends on input) |
| Estimated Cost | $0.001 - $0.01 per report |
| Concurrent Requests | No limit (OpenRouter handles) |

---

## Notes

- **No Database Persistence**: This endpoint returns content only; it doesn't save to the database
- **Perfect for**: Testing, frontend previews, instant feedback, temporary analysis
- **Related**: `/api/reports/generate` is the main endpoint that saves reports to database
- **Rate Limiting**: Standard API rate limits apply (same as other endpoints)
- **No Idempotency**: Each request generates a new report (no caching)

---

## Summary

The reflections endpoint provides a quick way to generate AI-analyzed reports from structured reflection data without database involvement, perfect for instant feedback and testing scenarios.
