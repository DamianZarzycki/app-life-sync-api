# PUT /api/preferences - Endpoint Testing Guide

## Quick Start

### Setup
1. Start the API server: `npm run dev`
2. Get a valid JWT token from `/api/auth/sign-in` or use mock mode (dev environment)
3. Ensure you have categories created in the database

---

## Test Cases with cURL Examples

### 1. ✅ Successful Update (200 OK)

```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": ["550e8400-e29b-41d4-a716-446655440000"],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```

**Expected Response (200 OK)**:
```json
{
  "user_id": "user-uuid-here",
  "active_categories": ["550e8400-e29b-41d4-a716-446655440000"],
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

### 2. ✅ Valid Update with Empty Categories (200 OK)

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

**Expected Response (200 OK)**: Same as above with empty categories array

---

### 3. ✅ Valid Update with Email Unsubscribed (200 OK)

```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": ["550e8400-e29b-41d4-a716-446655440000"],
    "report_dow": 1,
    "report_hour": 14,
    "preferred_delivery_channels": ["in_app"],
    "email_unsubscribed_at": "2025-01-15T15:30:00Z",
    "max_daily_notes": 3
  }'
```

---

### 4. ❌ Missing Required Field (400 Bad Request)

```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": ["550e8400-e29b-41d4-a716-446655440000"],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null
    // Missing max_daily_notes
  }'
```

**Expected Response (400 Bad Request)**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body validation failed",
    "details": {
      "max_daily_notes": "max_daily_notes is required"
    }
  }
}
```

---

### 5. ❌ Invalid Field Type (400 Bad Request)

```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": ["550e8400-e29b-41d4-a716-446655440000"],
    "report_dow": "zero",
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```

**Expected Response (400 Bad Request)**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body validation failed",
    "details": {
      "report_dow": "report_dow must be an integer"
    }
  }
}
```

---

### 6. ❌ Value Out of Range (422 Unprocessable Entity)

```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": ["550e8400-e29b-41d4-a716-446655440000"],
    "report_dow": 7,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```

**Expected Response (422 Unprocessable Entity)**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Preference validation failed",
    "details": {
      "report_dow": "report_dow must be between 0 and 6"
    }
  }
}
```

---

### 7. ❌ Invalid Enum Value (422 Unprocessable Entity)

```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": ["550e8400-e29b-41d4-a716-446655440000"],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "sms"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```

**Expected Response (422 Unprocessable Entity)**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Preference validation failed",
    "details": {
      "preferred_delivery_channels.1": "preferred_delivery_channels must contain only \"in_app\" or \"email\""
    }
  }
}
```

---

### 8. ❌ Too Many Categories (422 Unprocessable Entity)

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

**Expected Response (422 Unprocessable Entity)**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Preference validation failed",
    "details": {
      "active_categories": "active_categories must have a maximum of 3 categories"
    }
  }
}
```

---

### 9. ❌ Non-Existent Category UUID (422 Unprocessable Entity)

```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": ["00000000-0000-0000-0000-000000000099"],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```

**Expected Response (422 Unprocessable Entity)**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Preference validation failed",
    "details": {
      "active_categories": "The following category IDs do not exist: 00000000-0000-0000-0000-000000000099"
    }
  }
}
```

---

### 10. ❌ Missing Authorization Header (401 Unauthorized)

```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": ["550e8400-e29b-41d4-a716-446655440000"],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```

**Expected Response (401 Unauthorized)** - From auth middleware:
```json
{
  "error": {
    "code": "AUTH_HEADER_MISSING",
    "message": "Authorization header is required"
  }
}
```

---

### 11. ❌ Invalid JWT Token (401 Unauthorized)

```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer invalid_token_here" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": ["550e8400-e29b-41d4-a716-446655440000"],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```

**Expected Response (401 Unauthorized)**:
```json
{
  "error": {
    "code": "JWT_INVALID",
    "message": "Invalid credentials"
  }
}
```

---

### 12. ❌ Preferences Not Found (404 Not Found)

This scenario is rare since preferences are created with the user profile. However, if a record is deleted:

```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer VALID_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": ["550e8400-e29b-41d4-a716-446655440000"],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }'
```

**Expected Response (404 Not Found)**:
```json
{
  "error": {
    "code": "PREFERENCES_NOT_FOUND",
    "message": "User preferences not found"
  }
}
```

---

## Testing with Development Mode

In development, you can use mock users without a valid JWT:

```bash
# With mock user (defaults to 00000000-0000-0000-0000-000000000001)
curl -X PUT http://localhost:3000/api/preferences \
  -H "X-Mock-User-Id: 00000000-0000-0000-0000-000000000001" \
  -H "X-Mock-Email: test@example.com" \
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

---

## Validation Field Reference

### report_dow (Day of Week)
- **Valid Range**: 0-6
- **Mapping**: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday

### report_hour (Hour of Day)
- **Valid Range**: 0-23
- **Format**: 24-hour UTC/timezone-aware format
- **Examples**: 0=midnight, 9=9am, 14=2pm, 23=11pm

### max_daily_notes
- **Valid Range**: 1-10
- **Description**: Maximum number of notes allowed per category per day

### active_categories
- **Type**: Array of UUID strings
- **Max Length**: 3
- **Min Length**: 0 (can be empty)
- **Format**: Valid UUID format required

### preferred_delivery_channels
- **Allowed Values**: "in_app", "email"
- **Min Length**: 1 (must have at least one)
- **Duplicates**: Not allowed

### email_unsubscribed_at
- **Type**: ISO 8601 datetime string or null
- **Null**: Indicates user is subscribed
- **Example**: "2025-01-15T15:30:00Z"

---

## Integration Testing Checklist

- [ ] Test with valid JWT token
- [ ] Test with mock JWT (dev mode)
- [ ] Test with empty categories array
- [ ] Test with 3 categories (max)
- [ ] Test with only in_app delivery
- [ ] Test with only email delivery
- [ ] Test with both channels
- [ ] Test all report_dow values (0-6)
- [ ] Test all report_hour ranges (0, 12, 23)
- [ ] Test all max_daily_notes ranges (1, 5, 10)
- [ ] Test with unsubscribed date
- [ ] Verify updated_at timestamp changes
- [ ] Verify other fields remain unchanged
- [ ] Test concurrent updates (last-write-wins)
- [ ] Verify RLS prevents cross-user access

---

## Performance Testing

### Expected Response Times
- JWT validation: ~50ms
- Category validation: ~50ms
- Database update: ~50-100ms
- Total: ~200-500ms per request

### Load Testing Example
```bash
# Using Apache Bench (ab)
ab -n 100 -c 10 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -p payload.json \
  -T application/json \
  http://localhost:3000/api/preferences
```

---

## Troubleshooting

### 500 Internal Server Error
- Check server logs for detailed error
- Verify Supabase connection is active
- Ensure SERVICE_KEY is configured
- Check database is running

### 422 with "active_categories do not exist"
- Verify category UUIDs exist in database
- Check categories are not soft-deleted
- Use admin panel to verify categories

### JWT validation fails
- Ensure Authorization header format is: `Bearer <token>`
- Verify token hasn't expired
- Check SUPABASE_URL and SERVICE_KEY env vars

### Requests hang or timeout
- Check network connectivity
- Verify Supabase backend is healthy
- Check for query performance issues
