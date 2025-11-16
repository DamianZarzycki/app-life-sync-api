# Sign-Up Endpoint Quick Reference

## Overview
- **Endpoint**: `POST /api/auth/sign-up`
- **Purpose**: Register new users with email and password
- **Status Code**: 201 Created (not 200)
- **Location**: `/api/auth/sign-up`

## Quick Facts

| Aspect | Detail |
|--------|--------|
| **Method** | POST |
| **Auth Required** | No (public endpoint) |
| **Success Status** | 201 Created |
| **Request Body** | `{ email: string, password: string }` |
| **Response Body** | `{ user: {}, session: {} }` |
| **Rate Limit** | 10 attempts per 15 minutes per IP |

## Error Codes

| Status | Code | Reason |
|--------|------|--------|
| 400 | VALIDATION_ERROR | Invalid email format, empty password, missing fields |
| 409 | EMAIL_EXISTS | Email already registered in system |
| 422 | WEAK_PASSWORD | Password doesn't meet strength requirements |
| 429 | RATE_LIMITED | Too many registration attempts from this IP |
| 500 | SERVER_ERROR | Supabase unavailable or unexpected error |

## Implementation Checklist

### Phase 1: Core Implementation
- [ ] Add `SignUpRequestSchema` to `/src/validation/auth.ts`
- [ ] Add `signUp()` method to `/src/services/auth.service.ts`
- [ ] Add `signUpHandler()` to `/src/controllers/auth.controller.ts`
- [ ] Update `/src/routes/auth.router.ts` with `POST /sign-up` route

### Phase 2: Security & Configuration
- [ ] Add rate limiting middleware to sign-up route
- [ ] Verify `express-rate-limit` in `package.json`
- [ ] Verify environment variables in `.env`
- [ ] Import `SignUpRequestSchema` in controller

### Phase 3: Testing
- [ ] Manual test: successful sign-up (201)
- [ ] Manual test: duplicate email (409)
- [ ] Manual test: invalid email (400)
- [ ] Manual test: empty password (400)
- [ ] Manual test: rate limiting (429)

### Phase 4: Verification
- [ ] Verify user created in `auth.users` table
- [ ] Verify profile auto-created with default timezone
- [ ] Verify preferences auto-created with defaults
- [ ] Create unit tests for handler
- [ ] Create integration tests

### Phase 5: Documentation & Deployment
- [ ] Update API documentation (OpenAPI/Swagger)
- [ ] Deploy to staging environment
- [ ] QA testing in staging
- [ ] Deploy to production
- [ ] Monitor error rates in production

## Key Implementation Details

### Schema Changes Needed
In `/src/validation/auth.ts`, add:
```typescript
export const SignUpRequestSchema = z.object({
  email: z
    .string({ required_error: 'email is required' })
    .email('email must be a valid email address'),
  password: z
    .string({ required_error: 'password is required' })
    .min(1, 'password must not be empty'),
});

export type SignUpRequest = z.infer<typeof SignUpRequestSchema>;
```

### Service Method Needed
In `/src/services/auth.service.ts`, add `signUp()` method that:
1. Calls `supabaseClient.auth.signUp(email, password)`
2. Handles errors and maps to appropriate HTTP status codes
3. Returns `SignInResponseDto` (reuse existing type)

### Handler Implementation
In `/src/controllers/auth.controller.ts`, add `signUpHandler` that:
1. Validates request with `SignUpRequestSchema.parse(req.body)`
2. Calls `authService.signUp(email, password)`
3. Returns 201 with Location header and response body
4. Handles errors: 400, 409, 422, 500

### Router Update
In `/src/routes/auth.router.ts`:
```typescript
import { signUpHandler } from '../controllers/auth.controller.js';

router.post('/sign-up', signUpLimiter, signUpHandler);
```

## Error Handling Strategy

### Validation Errors (400)
- Missing or invalid email
- Empty password
- Caught by Zod schema

### Duplicate Email (409)
- Detect: "user already exists" or "duplicate key" in error message
- Return generic message: "Email address is already registered"
- Prevents account enumeration

### Weak Password (422)
- Detect: "password" or "strength" in error message
- Return: "Password does not meet strength requirements"
- Let Supabase enforce strength rules

### Server Error (500)
- Log full error details to console
- Return generic message to client
- Alert monitoring system

## Security Considerations

### Rate Limiting
- **Goal**: Prevent automated account creation spam
- **Setting**: 10 sign-ups per 15 minutes per IP
- **Fallback**: Could switch to email-based (5 per 24hrs) if IP-based insufficient

### Account Enumeration Protection
- Use same error message for "email exists" vs other validation errors
- Only 409 signals email already exists (acceptable - email must be unique)
- Don't reveal whether user verified or pending verification

### Password Security
- Never log passwords
- Never echo password back to client
- Let Supabase handle hashing (bcrypt)
- Enforce minimum strength (Supabase configured)

### Transport Security
- HTTPS required in production
- JWT tokens expire after 1 hour
- Refresh tokens stored in HTTP-only cookies

## Database Expectations

### Automatic Records Created
When sign-up succeeds, Supabase Auth creates:
1. **auth.users** - User record with id, email, encrypted password
2. **public.profiles** (via trigger) - Default timezone = UTC
3. **public.preferences** (via trigger) - Default settings:
   - active_categories: all available categories
   - report_dow: 1 (Monday)
   - report_hour: 8 (8 AM UTC)
   - preferred_delivery_channels: ["in_app"]
   - max_daily_notes: some default (e.g., 10)

### Email Verification
- If configured in Supabase: verification email sent automatically
- Frontend should inform user to check email
- `email_confirmed_at` is null until user verifies
- Sign-in works even with unconfirmed email (depends on config)

## Performance Targets

- **Response Time Target**: < 200ms p95, < 500ms p99
- **Expected Range**: 100-300ms (Supabase network round-trip)
- **Bottlenecks**: Supabase latency, email sending (async, doesn't block)

## Monitoring & Alerts

Configure alerts for:
1. **Error Rate > 5%** - Something broken with signup flow
2. **P95 Response Time > 500ms** - Supabase issues or high load
3. **Rate Limiter Triggers** - Potential brute force attack
4. **Email Delivery Failures** - Verification email not sending

## Testing Curl Commands

```bash
# Successful sign-up
curl -X POST http://localhost:3000/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "Pass123!"}'

# Duplicate email (expect 409)
curl -X POST http://localhost:3000/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "Different456!"}'

# Invalid email (expect 400)
curl -X POST http://localhost:3000/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email": "notanemail", "password": "Pass123!"}'

# Empty password (expect 400)
curl -X POST http://localhost:3000/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email": "user2@example.com", "password": ""}'

# Rate limit test (10+ rapid requests)
for i in {1..15}; do
  curl -X POST http://localhost:3000/api/auth/sign-up \
    -H "Content-Type: application/json" \
    -d "{\"email\": \"user$i@example.com\", \"password\": \"Pass123!\"}"
done
```

## Dependencies Required

- `@supabase/supabase-js`: ^2.x.x (already in project)
- `express`: ^4.x.x (already in project)
- `zod`: ^3.x.x (already in project)
- `express-rate-limit`: ^6.x.x (may need to install)

Install if missing:
```bash
npm install express-rate-limit
```

## Reference Documentation

Full implementation plan: `/api/sign-up-implementation-plan.md` (1304 lines)

Key sections:
- Section 1: Endpoint Overview
- Section 2: Request Details
- Section 3: Used Types (DTOs)
- Section 4: Response Details (status codes, examples)
- Section 5: Data Flow (sequence diagrams)
- Section 6: Security Considerations (threats, mitigations)
- Section 7: Error Handling (all error scenarios)
- Section 8: Performance (bottlenecks, optimization)
- Section 9: Implementation Steps (13 detailed steps)

## Contact & Support

Implementation based on:
- Existing sign-in endpoint pattern (`POST /api/auth/sign-in`)
- LifeSync database schema with auto-created profiles/preferences
- Supabase Auth best practices
- OWASP Top 10 security guidelines
