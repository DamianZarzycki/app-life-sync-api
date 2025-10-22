# CURL Quick Reference - PUT /api/preferences

## Setup

Replace these placeholders in the curl commands:
- `YOUR_JWT_TOKEN` - Get from `/api/auth/sign-in` or use dev mode
- `http://localhost:3000` - API server URL

## Dev Mode (No JWT Required)

For testing in development, use these headers instead of the Authorization header:
```
-H "X-Mock-User-Id: 00000000-0000-0000-0000-000000000001"
-H "X-Mock-Email: test@example.com"
```

---

## ✅ SUCCESS CASES (200 OK)

### 1. Basic Valid Request
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```

### 2. Email-Only Delivery
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 3,
    "report_hour": 9,
    "preferred_delivery_channels": ["email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 5
  }'
```

### 3. In-App Only Delivery
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 1,
    "report_hour": 14,
    "preferred_delivery_channels": ["in_app"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 3
  }'
```

### 4. With Email Unsubscribed Timestamp
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 5,
    "report_hour": 18,
    "preferred_delivery_channels": ["in_app"],
    "email_unsubscribed_at": "2025-01-15T10:30:00Z",
    "max_daily_notes": 7
  }'
```

### 5. Maximum Boundaries
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 6,
    "report_hour": 23,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 10
  }'
```

### 6. Minimum Boundaries
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 0,
    "report_hour": 0,
    "preferred_delivery_channels": ["in_app"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 1
  }'
```

---

## ❌ ERROR CASES

### 400 Bad Request - Missing Required Field
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null
  }'
```
Expected: `"error": { "code": "VALIDATION_ERROR", "message": "Request body validation failed" }`

### 400 Bad Request - Wrong Type
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": "monday",
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```

### 422 Unprocessable Entity - Value Out of Range (report_dow)
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 7,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```
Expected: `"report_dow": "report_dow must be between 0 and 6"`

### 422 Unprocessable Entity - Value Out of Range (report_hour)
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 0,
    "report_hour": 24,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```
Expected: `"report_hour": "report_hour must be between 0 and 23"`

### 422 Unprocessable Entity - Value Out of Range (max_daily_notes)
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 11
  }'
```
Expected: `"max_daily_notes": "max_daily_notes must be between 1 and 10"`

### 422 Unprocessable Entity - Invalid Enum Value
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "sms"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```
Expected: `"preferred_delivery_channels": "preferred_delivery_channels must contain only \"in_app\" or \"email\""`

### 422 Unprocessable Entity - Empty Delivery Channels
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": [],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```
Expected: `"preferred_delivery_channels": "preferred_delivery_channels must have at least one channel"`

### 422 Unprocessable Entity - Too Many Categories
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [
      "550e8400-e29b-41d4-a716-446655440000",
      "550e8400-e29b-41d4-a716-446655440001",
      "550e8400-e29b-41d4-a716-446655440002",
      "550e8400-e29b-41d4-a716-446655440003"
    ],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```
Expected: `"active_categories": "active_categories must have a maximum of 3 categories"`

### 401 Unauthorized - Missing Auth Header
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```
Expected: `"error": { "code": "AUTH_HEADER_MISSING" }`

### 401 Unauthorized - Invalid JWT
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer invalid_token_xyz" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```
Expected: `"error": { "code": "JWT_INVALID" }`

### 404 Not Found - Preferences Don't Exist
(This is rare since preferences are created with user profile. To test, you'd need a user with deleted preferences.)

```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```
Expected: `"error": { "code": "PREFERENCES_NOT_FOUND" }`

---

## Tips for Testing

### Format JSON Output
Add `| jq` to pretty-print responses:
```bash
curl ... | jq
```

### Get HTTP Status Code Only
```bash
curl -s -o /dev/null -w "%{http_code}\n" ...
```

### Save Response to File
```bash
curl ... -o response.json
```

### Use Dev Mode (No JWT)
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "X-Mock-User-Id: 00000000-0000-0000-0000-000000000001" \
  -H "X-Mock-Email: test@example.com" \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

### Verbose Output
Add `-v` flag to see headers, timing, etc:
```bash
curl -v ...
```

### Test All at Once
Run the provided bash script:
```bash
cd app-life-sync-api
chmod +x test-preferences.sh
./test-preferences.sh [OPTIONAL_JWT_TOKEN]
```

---

## Expected Response Format (200 OK)

```json
{
  "user_id": "00000000-0000-0000-0000-000000000001",
  "active_categories": [],
  "report_dow": 0,
  "report_hour": 2,
  "preferred_delivery_channels": ["in_app", "email"],
  "email_unsubscribed_at": null,
  "max_daily_notes": 4,
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T15:30:00Z"
}
```

---

## Field Constraints Quick Reference

| Field | Type | Min | Max | Values |
|-------|------|-----|-----|--------|
| active_categories | UUID[] | 0 | 3 | UUIDs |
| report_dow | Integer | 0 | 6 | Mon-Sun |
| report_hour | Integer | 0 | 23 | 24-hour |
| preferred_delivery_channels | String[] | 1 | 2 | in_app, email |
| email_unsubscribed_at | DateTime | - | - | ISO 8601 or null |
| max_daily_notes | Integer | 1 | 10 | Per category/day |

