# Notes API - Response Reference

## Create Note Endpoint: POST /api/notes

### Success Response (201 Created)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "650e8400-e29b-41d4-a716-446655440001",
  "category_id": "750e8400-e29b-41d4-a716-446655440002",
  "title": "My First Note",
  "content": "This is the content of my note...",
  "created_at": "2024-01-15T10:00:00Z",
  "updated_at": "2024-01-15T10:00:00Z",
  "deleted_at": null
}
```

**Headers**:
- `Location: /api/notes/{note_id}`

---

## Error Responses

### 401 Unauthorized - Missing/Invalid Authentication
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Authentication required"
  }
}
```

### 403 Category Not Active
When category is not in user's active_categories:
```json
{
  "error": {
    "code": "CATEGORY_NOT_ACTIVE",
    "message": "The specified category is not active in your preferences"
  }
}
```

### 403 Daily Limit Exceeded ⭐ UPDATED
When user exceeds max_daily_notes for category:
```json
{
  "error": {
    "code": "MAX_NOTES_FOR_CATEGORY_PER_DAY",
    "message": "The specified category reached limit for notes per day"
  }
}
```

### 422 Validation Error - Invalid Request Body
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request body validation failed",
    "details": {
      "category_id": "category_id must be a valid UUID",
      "content": "content must not be empty"
    }
  }
}
```

### 422 Validation Error - Category Not Found
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": {
      "category_id": "The specified category does not exist"
    }
  }
}
```

### 500 Internal Server Error
```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "An unexpected error occurred"
  }
}
```

---

## Error Status Code Summary

| Error Scenario | Status Code | Error Code |
|---|---|---|
| Missing/Invalid authentication | 401 | UNAUTHORIZED |
| Category not active | 403 | CATEGORY_NOT_ACTIVE |
| Daily limit exceeded | **403** | **MAX_NOTES_FOR_CATEGORY_PER_DAY** |
| Invalid UUID format | 422 | VALIDATION_ERROR |
| Missing required fields | 422 | VALIDATION_ERROR |
| Category doesn't exist | 422 | VALIDATION_ERROR |
| Server error | 500 | SERVER_ERROR |

---

## Implementation Details

### Category Validation
The API enforces:
1. **Category Exists**: Category must exist in the database
2. **Category Active**: Category must be in user's `preferences.active_categories` array
3. **Daily Limit**: User cannot exceed `preferences.max_daily_notes` notes per category per day

### Daily Limit Mechanism
- Limit resets daily based on **user's timezone** (from profile)
- Counted notes must be **not soft-deleted** (`deleted_at IS NULL`)
- Limit is **per-category** (different limits can be set per category if needed)

### Authentication
- Required: Bearer JWT token in Authorization header
- Validated: Token signature, expiration, and user claims
- Enforced: RLS (Row-Level Security) ensures users only access their own notes

---

## Usage Examples

### ✅ Success: Create Note
```bash
curl -X POST http://localhost:3000/api/notes \
  -H "Authorization: Bearer {jwt_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "category_id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "My Note",
    "content": "Note content here"
  }'
```

### ❌ Error: Daily Limit Reached
```bash
# Response: 403 Forbidden
{
  "error": {
    "code": "MAX_NOTES_FOR_CATEGORY_PER_DAY",
    "message": "The specified category reached limit for notes per day"
  }
}
```

### ❌ Error: Category Not Active
```bash
# Response: 403 Forbidden
{
  "error": {
    "code": "CATEGORY_NOT_ACTIVE",
    "message": "The specified category is not active in your preferences"
  }
}
```

---

## Last Updated
- **Date**: January 2024
- **Change**: Daily limit error response updated from 409 to 403 status code
- **Error Code**: Changed to `MAX_NOTES_FOR_CATEGORY_PER_DAY`

