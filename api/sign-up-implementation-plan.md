# API Endpoint Implementation Plan: POST /api/auth/sign-up

## 1. Endpoint Overview

The `POST /api/auth/sign-up` endpoint enables new users to register with the LifeSync application by providing an email address and password. Upon successful registration, Supabase Auth creates a new user account in the `auth.users` table and returns authenticated session tokens along with user information. This endpoint is the primary entry point for user registration.

**Purpose**: Enable new users to create accounts with email and password, establishing an initial authenticated session

**Resource**: Authentication / User Registration

**Idempotency**: Not idempotent (repeated calls with the same email will fail after first successful registration with 409 Conflict)

**Related Endpoint**: `POST /api/auth/sign-in` (user login after account creation)

---

## 2. Request Details

### HTTP Method

**POST**

### URL Structure

```
POST /api/auth/sign-up
```

### Parameters

#### Required (Request Body)

- **email** (string, required)
  - User's email address for account registration
  - Constraint: Must be a valid email format (RFC 5322 simplified)
  - Constraint: Must be unique across system (enforced by Supabase Auth)
  - Example: `"newuser@example.com"`

- **password** (string, required)
  - User's plaintext password for account
  - Constraint: Non-empty string; Supabase enforces password strength rules
  - Constraint: Minimum 6 characters required by Supabase (may vary by configuration)
  - Constraint: May require complexity (numbers, special chars, uppercase) per Supabase policy
  - Example: `"SecurePassword123!"`

#### Optional

- None (API accepts only email and password as per specification)

### Request Body Structure

```json
{
  "email": "newuser@example.com",
  "password": "SecurePassword123!"
}
```

### Request Example

```bash
curl -X POST http://localhost:3000/api/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{
    "email": "newuser@example.com",
    "password": "SecurePassword123!"
  }'
```

---

## 3. Used Types

### Request DTO (Command Model)

```typescript
// From validation/auth.ts - ADD to existing file
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

### Response DTOs (Already Exist in types.ts)

```typescript
// Reuse existing types from types.ts
export type SignInSessionDto = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'bearer';
};

export type SignInUserDto = {
  id: UUID;
  email: string;
  email_confirmed_at: string | null;
};

export type SignInResponseDto = {
  user: SignInUserDto;
  session: SignInSessionDto;
};
```

### Related Types

- `UUID` - String type alias for UUID values from Supabase
- `ErrorResponseDto` - Standard error response format used across API

---

## 4. Response Details

### Success Response (201 Created)

**HTTP Status**: 201 Created

**Response Headers**:
- `Location: /api/auth/me` (optional, indicates where user info can be retrieved)
- `Content-Type: application/json`

**Response Body Structure**:

```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "newuser@example.com",
    "email_confirmed_at": null
  },
  "session": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refresh_token": "sbr_1234567890abcdef...",
    "expires_in": 3600,
    "token_type": "bearer"
  }
}
```

**Field Descriptions**:

- `user.id`: UUID of newly created user
- `user.email`: Email address registered for account
- `user.email_confirmed_at`: ISO 8601 timestamp when email was confirmed, or `null` if not yet confirmed (typical for new accounts)
- `session.access_token`: JWT token for authenticating subsequent API requests (Bearer token)
- `session.refresh_token`: Token for obtaining new access tokens when current expires
- `session.expires_in`: Seconds until access token expiration (typically 3600 = 1 hour)
- `session.token_type`: Always `"bearer"` (HTTP Bearer authentication scheme)

**Note**: On sign-up, `email_confirmed_at` is typically `null` unless Supabase is configured to auto-confirm emails. Frontend should inform user to check email for confirmation link.

### Error Responses

#### 400 Bad Request - Invalid Input

**Scenario**: Email missing, invalid format, password empty, or malformed JSON

**Response**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email must be a valid email address",
    "details": {
      "field": "email",
      "reason": "invalid_format"
    }
  }
}
```

**Possible error codes and messages**:

- `email is required` - Missing email field
- `email must be a valid email address` - Invalid email format
- `password is required` - Missing password field
- `password must not be empty` - Empty password string

#### 409 Conflict - Email Already Registered

**Scenario**: Email address already exists in the system

**Response**:

```json
{
  "error": {
    "code": "EMAIL_EXISTS",
    "message": "Email address is already registered"
  }
}
```

**Handling Notes**:
- Supabase returns a specific error when email exists
- Backend maps this to 409 Conflict status code
- Generic message used to prevent account enumeration

#### 422 Unprocessable Entity - Password Strength Insufficient

**Scenario**: Password fails Supabase password strength requirements

**Response**:

```json
{
  "error": {
    "code": "WEAK_PASSWORD",
    "message": "Password does not meet strength requirements"
  }
}
```

**Typical Requirements** (configurable by Supabase):
- Minimum 6 characters
- May require: uppercase, lowercase, numbers, special characters

#### 500 Internal Server Error

**Scenario**: Supabase service unavailable, network error, or unexpected server error

**Response**:

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "Unexpected server error"
  }
}
```

#### 429 Too Many Requests - Rate Limited

**Scenario**: Too many sign-up attempts from same IP or email within time window

**Response**:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many registration attempts. Please try again later."
  }
}
```

---

## 5. Data Flow

### Sequence Diagram

```
Client/Frontend                Backend                    Supabase Auth
        |                         |                            |
        |-- POST /api/auth/sign-up|                            |
        |  {email, password}      |                            |
        |                         |                            |
        |                         |-- signUp(email, password)--|
        |                         |  (service role or anon key)|
        |                         |                            |
        |                         |<-- {user, session, error}--|
        |                         |                            |
        |<-- 201 Created ---------|
        |  {user, session}        |
```

### Data Flow Steps

1. **Request Reception**
   - Frontend sends HTTP POST request to `/api/auth/sign-up`
   - Request body contains email and password in JSON format
   - Content-Type header should be `application/json`
   - Rate limiting middleware checks request source (IP/email)

2. **Input Validation**
   - Backend middleware parses request body as JSON
   - Zod schema validates email format (RFC 5322 simplified)
   - Zod schema validates password non-empty
   - If validation fails, return 400 Bad Request immediately
   - If validation passes, proceed to Supabase auth

3. **Supabase User Creation**
   - Backend calls `supabaseClient.auth.signUp(email, password)`
   - Supabase validates password strength against configured rules
   - Supabase checks if email already exists in `auth.users` table
   - Supabase creates new user record with UUID primary key
   - Supabase generates JWT access token and refresh token
   - If configured, Supabase sends email verification link

4. **Automatic User Data Initialization**
   - Supabase Auth Trigger (if configured): Creates `profiles` record with default timezone (UTC)
   - Supabase Auth Trigger (if configured): Creates `preferences` record with default settings
   - These operations happen server-side via Supabase triggers (transparent to backend)

5. **Response Mapping**
   - Extract user info: id, email, email_confirmed_at
   - Extract session info: access_token, refresh_token, expires_in, token_type
   - Map to SignInResponseDto structure (same contract as sign-in)

6. **Success Response**
   - Return 201 Created HTTP status (not 200)
   - Set Location header to `/api/auth/me` (optional)
   - Return SignInResponseDto with user and session data
   - Frontend receives tokens and stores them for future authenticated requests
   - Frontend may display message to user about email verification

### Error Flow - Validation Failure

1. Zod schema parsing fails (invalid email, empty password, missing fields)
2. Validation error handler formats error message
3. Return 400 Bad Request with validation error details
4. No attempt to contact Supabase

### Error Flow - Email Already Exists

1. Supabase returns error indicating email exists
2. Backend catches error and maps to 409 status
3. Return generic error message: "Email address is already registered"
4. Do not reveal account details to prevent enumeration

### Error Flow - Password Strength Failed

1. Supabase validates password against strength policy
2. If insufficient, Supabase returns password strength error
3. Backend maps to 422 Unprocessable Entity status
4. Return message: "Password does not meet strength requirements"
5. Frontend should inform user of requirements

### Error Flow - Server Error

1. Network error, Supabase unavailable, or unexpected exception
2. Log error details to console for debugging
3. Return 500 Server Error with generic message to client
4. Frontend should retry with exponential backoff

---

## 6. Security Considerations

### Authentication & Authorization

- **No authentication required** for this endpoint (sign-up is the registration mechanism)
- This endpoint is **public** and accessible without prior JWT
- Response tokens enable authentication for all subsequent requests
- Rate limiting is critical to prevent automated account creation abuse

### Input Validation & Sanitization

- **Email validation**: Must be valid email format (Zod + browser validation on frontend)
  - Reject empty strings, invalid formats, extremely long strings
  - Frontend should normalize email to lowercase before submission
  - Backend validates once more to prevent bypass

- **Password validation**: Non-empty string required at API layer
  - Supabase enforces password strength (minimum length, complexity, entropy)
  - No additional backend validation needed
  - Plaintext password transmitted only over HTTPS to Supabase
  - Never echo password back to client

- **No HTML/JavaScript in inputs** (JSON payload + Content-Type validation mitigates XSS)

- **No SQL Injection Risk** (Supabase SDK uses parameterized auth APIs, not SQL queries)

### Data Protection

- **Transport Security**: Must use HTTPS in production
  - HTTP-only production deployment must be rejected
  - TLS 1.2+ required; older versions rejected
  - API gateway should enforce strict HTTPS

- **Token Storage**: Tokens returned are JWTs signed by Supabase
  - Frontend should store securely:
    - **Recommended**: HTTP-only cookies (XSS-protected)
    - **Alternative**: localStorage (XSS-vulnerable but more convenient)
    - **Avoid**: sessionStorage (lost on page close, limited use cases)

- **Password Handling**: Passwords never logged or displayed
  - Passwords sent only to Supabase auth service via HTTPS
  - Supabase handles password hashing using bcrypt (industry standard)
  - Backend never stores or processes plaintext passwords after transmission
  - Error messages must not reveal password-related details

- **Response Data**: No sensitive information exposed
  - Only return fields in SignInResponseDto contract
  - Do not expose internal database IDs, metadata, or auxiliary fields
  - Do not return other users' information

### Threat Mitigation

#### Brute Force / Account Creation Spam

- **Threat**: Attacker creates multiple accounts rapidly using scripted requests
- **Mitigation**:
  - Implement rate limiting middleware for `/api/auth/sign-up` endpoint
  - **Recommended**: Max 10 sign-up attempts per 15-minute window per IP address
  - **Alternative**: Per-email limit (5 attempts per 24 hours) to prevent enumeration
  - Use `express-rate-limit` with Redis backend for distributed rate limiting
  - Rate limiting enforced per backend.mdc guidelines
  - Return 429 Too Many Requests when limit exceeded

#### Account Enumeration

- **Threat**: Attacker determines if email exists by comparing sign-up vs sign-in error responses
- **Mitigation**:
  - Return same HTTP status code (201) for successful registrations regardless of whether profile/preferences creation succeeds
  - Return 409 Conflict only when email already registered (acceptable information: email must be unique)
  - Generic error messages do not reveal account details
  - Do not include user verification status in error messages

#### Email Spoofing / Fake Accounts

- **Threat**: Attacker registers with disposable/invalid email addresses to create spam accounts
- **Mitigation**:
  - Supabase handles email verification via verification links sent to email
  - Backend can require email verification before certain operations (configurable business rule)
  - Email verification link expires after 24 hours
  - Rate limiting per email prevents rapid re-registrations

#### Credential Stuffing (Pre-Registration)

- **Threat**: Attacker uses leaked credentials from other services to pre-register accounts
- **Mitigation**:
  - Rate limiting prevents rapid-fire registration attempts
  - Password strength requirements (Supabase enforces) reduce reuse likelihood
  - Monitor for suspicious sign-up patterns (many signups from same IP, geographic anomalies)
  - Consider implementing CAPTCHA on signup form for high-risk deployments

#### Man-in-the-Middle (MITM)

- **Threat**: Attacker intercepts credentials and tokens in transit
- **Mitigation**:
  - HTTPS/TLS 1.2+ required in production (infrastructure level)
  - Tokens expire after fixed duration (typically 1 hour)
  - Refresh token rotation recommended (Supabase feature)
  - Strict Transport Security (HSTS) header enforced by API gateway

#### Token Misuse / Account Takeover

- **Threat**: Stolen tokens used to impersonate user
- **Mitigation**:
  - Access tokens expire after short duration (1 hour)
  - Tokens include user ID claim (verified on each request by auth middleware)
  - Backend validates token signature on each request via auth middleware
  - Logout invalidates session server-side (if implemented via Supabase)
  - Refresh token stored securely in HTTP-only cookie (XSS-protected)

#### Password Strength Bypass

- **Threat**: Weak passwords allow brute-force attacks on Supabase Auth
- **Mitigation**:
  - Supabase enforces configurable password strength (minimum length, complexity)
  - Backend does not weaken Supabase policies
  - Frontend displays password strength indicator (UX guidance)
  - Common passwords rejected by Supabase (if configured)

### OWASP Top 10 Alignments

- **A01:2021 - Broken Access Control**: Sign-up is public endpoint; no role-based access. Auth middleware enforces on protected endpoints.
- **A02:2021 - Cryptographic Failures**: HTTPS enforced; JWT signed by Supabase; passwords hashed by bcrypt.
- **A03:2021 - Injection**: Zod validation prevents injection attacks; no SQL queries at API layer.
- **A04:2021 - Insecure Design**: Follow Supabase auth best practices; rate limiting implemented.
- **A05:2021 - Security Misconfiguration**: Validate environment variables at startup; enforce TLS in production.
- **A07:2021 - Identification and Authentication**: Supabase Auth handles user identification; JWT claims verify identity.
- **A09:2021 - Using Components with Known Vulnerabilities**: Keep Supabase SDK, Express, and dependencies updated.
- **A10:2021 - Broken Logging & Monitoring**: Errors logged to console; avoid logging passwords or tokens.

### Rate Limiting Configuration

- **Endpoint**: `/api/auth/sign-up`
- **Limit**: 10 sign-up attempts per 15-minute window per IP address
- **Alternative**: 5 sign-up attempts per 24-hour window per email (if using email-based limiting)
- **Response on Limit**: 429 Too Many Requests with message "Too many registration attempts. Please try again later."
- **Implementation**: `express-rate-limit` middleware with optional Redis backend

---

## 7. Error Handling

### Validation Errors (400 Bad Request)

#### Missing Email Field

**Trigger**: Request body lacks `email` property

**Error Response**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email is required"
  }
}
```

**Handling**: Zod schema validation catches this; return 400 immediately

**Logging**: `console.log('Sign-up validation error: missing email')`

#### Invalid Email Format

**Trigger**: Email value is not a valid email address (e.g., "notanemail", "user@", "@example.com")

**Error Response**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email must be a valid email address"
  }
}
```

**Handling**: Zod `z.email()` validator; return 400 immediately

**Logging**: `console.log('Sign-up validation error: invalid email format')`

#### Missing Password Field

**Trigger**: Request body lacks `password` property

**Error Response**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "password is required"
  }
}
```

**Handling**: Zod schema validation catches this; return 400 immediately

**Logging**: `console.log('Sign-up validation error: missing password')`

#### Empty Password

**Trigger**: Password value is empty string

**Error Response**:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "password must not be empty"
  }
}
```

**Handling**: Zod `.min(1)` validator; return 400 immediately

**Logging**: `console.log('Sign-up validation error: empty password')`

### Registration Errors (409 Conflict)

#### Email Already Registered

**Trigger**: Email already exists in `auth.users` table (user previously signed up or was invited)

**Error Response**:

```json
{
  "error": {
    "code": "EMAIL_EXISTS",
    "message": "Email address is already registered"
  }
}
```

**Handling**: Catch Supabase error mentioning "email" or "already_registered"; map to 409

**Logging**: `console.log('Sign-up failed: email already exists')`  (log email without password)

**Note**: Generic message prevents account enumeration

### Password Strength Errors (422 Unprocessable Entity)

#### Weak Password

**Trigger**: Password fails Supabase password strength requirements

**Error Response**:

```json
{
  "error": {
    "code": "WEAK_PASSWORD",
    "message": "Password does not meet strength requirements"
  }
}
```

**Handling**: Catch Supabase error mentioning "password" or "strength"; map to 422

**Logging**: `console.log('Sign-up failed: password strength insufficient')`

**Typical Requirements**:
- Minimum 6 characters (Supabase default; may be configurable)
- May require: uppercase letters, lowercase letters, numbers, special characters

### Server Errors (500 Internal Server Error)

#### Supabase Service Unavailable

**Trigger**: Network error, Supabase API timeout, or Supabase down

**Error Response**:

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "Unexpected server error"
  }
}
```

**Handling**: Catch network/timeout errors; log full error details

**Logging**:
```typescript
console.error('Sign-up error: Supabase unavailable', err);
```

**Recovery**: Frontend should retry with exponential backoff (initial 1s delay, max 30s)

#### Missing Environment Variables

**Trigger**: `SUPABASE_URL` or `SUPABASE_ANON_KEY` not set at server startup

**Error Response**: Server fails to start; error logged to console during initialization

**Handling**: Validation in `AuthService` constructor prevents runtime errors

**Prevention**: Docker/deployment scripts verify environment setup before starting server

#### Unexpected Exception in Handler

**Trigger**: Unhandled exception in request handler (programming error)

**Error Response**:

```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "Unexpected server error"
  }
}
```

**Handling**: Try/catch block in handler catches all exceptions; logs full error stack

**Logging**:
```typescript
console.error('Sign-up handler error', err);
```

#### Rate Limit Exceeded

**Trigger**: Too many sign-up requests from same IP within time window

**Error Response**:

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many registration attempts. Please try again later."
  }
}
```

**HTTP Status**: 429 Too Many Requests (set by `express-rate-limit` middleware)

**Handling**: Middleware intercepts request before handler; returns 429 automatically

**Logging**: Rate limiter logs excessive requests; backend may store metrics

### Logging Strategy

**Success Logging**:
```typescript
console.log(`Sign-up successful: ${email}`);
```

**Validation Error Logging**:
```typescript
console.log(`Sign-up validation error: ${fieldName} - ${reason}`);
```

**Email Conflict Logging**:
```typescript
console.log(`Sign-up failed: email already registered`);
```

**Password Strength Logging**:
```typescript
console.log(`Sign-up failed: password strength insufficient`);
```

**Server Error Logging**:
```typescript
console.error('Sign-up handler error', err);
```

**Important**: Never log request body (contains password), only log email and error reason

---

## 8. Performance Considerations

### Potential Bottlenecks

#### 1. Supabase Auth Service Latency

- **Issue**: Network latency to Supabase auth service (typically 50-200ms)
- **Impact**: Each sign-up takes 100-300ms minimum due to Supabase round-trip
- **Mitigation**:
  - Supabase SDK uses connection pooling (handled transparently)
  - Add request timeout (5 seconds recommended) to prevent hanging
  - Monitor response times with observability tool
  - Consider Supabase edge functions for reduced latency (future optimization)

#### 2. Email Verification Email Sending

- **Issue**: Supabase sends email verification link if configured; email service latency (1-5 seconds)
- **Impact**: Complete sign-up flow may take 5-10 seconds if email is synchronous
- **Mitigation**:
  - Supabase handles email sending asynchronously (doesn't block sign-up response)
  - Response is returned immediately; email sent in background
  - Monitor email delivery metrics in Supabase dashboard

#### 3. Database Trigger Execution (Profile/Preferences Creation)

- **Issue**: Supabase triggers create `profiles` and `preferences` records on auth user creation
- **Impact**: Adds latency if triggers are complex or synchronous
- **Mitigation**:
  - Supabase handles triggers internally (transparent to backend)
  - Triggers are typically fast (~10-50ms) for simple inserts
  - If bottleneck identified, optimize triggers in Supabase dashboard

#### 4. Rate Limiting Overhead

- **Issue**: Rate limiting middleware checks per request
- **Impact**: Negligible overhead (~1-5ms) for in-memory limiting
- **Mitigation**:
  - Use in-memory rate limiter for single-instance deployment
  - If scaling to multiple instances, use Redis backend for distributed limiting
  - Redis latency is ~1-5ms per check (acceptable)

#### 5. JSON Parsing and Validation

- **Issue**: Express and Zod parse and validate request body
- **Impact**: Minimal overhead (~5-10ms) for small payloads
- **Mitigation**:
  - Zod schema is optimized (compiled once on startup)
  - JSON payload is small (email ~50 bytes, password ~50 bytes)
  - No optimization needed for typical traffic

### Optimization Strategies

#### Request Validation Caching

- Zod schema is compiled once on module load (automatic)
- Minimal optimization needed

#### Connection Reuse

- Supabase SDK maintains connection pooling (transparent)
- Backend doesn't need optimization here

#### Response Compression

- Enable gzip compression in Express middleware
- Applied to all responses automatically; reduces token size by ~40%

#### Monitoring & Observability

- Track auth endpoint response times
- Monitor Supabase API latency
- Alert on error rates exceeding 5% threshold
- Use APM tools (e.g., Datadog, New Relic, or open-source alternatives)

#### Caching Strategy

- Sign-up responses are not cacheable (user creation must be unique per request)
- No cache headers should be set

### Load Testing Recommendations

1. **Concurrent Requests**: Test endpoint with 100+ concurrent sign-up requests
2. **Rate Limiting**: Verify rate limiting triggers at configured limits (e.g., 10/15min)
3. **Database Connection Pool**: Monitor pool exhaustion during load test
4. **Timeout Behavior**: Test timeout behavior when Supabase is slow (>5 seconds)
5. **Error Handling**: Verify graceful degradation under Supabase errors
6. **Metrics**: Baseline response time (target <200ms p95, <500ms p99)

**Load Testing Commands**:
```bash
# Using Apache Bench
ab -n 1000 -c 100 -p payload.json -T application/json http://localhost:3000/api/auth/sign-up

# Using wrk
wrk -t 4 -c 100 -d 30s -s script.lua http://localhost:3000/api/auth/sign-up
```

---

## 9. Implementation Steps

### Step 1: Add SignUpRequest Schema to Validation

**File**: `/src/validation/auth.ts`

**Action**: Add Zod schema for sign-up request validation to existing file

Add after the `SignInRequestSchema` definition:

```typescript
// Zod schema for sign-up request
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

### Step 2: Add signUp Method to AuthService

**File**: `/src/services/auth.service.ts`

**Action**: Add new method to existing AuthService class

Add after the existing `signIn` method:

```typescript
/**
 * Sign up a new user with email and password
 * Creates a new account in Supabase Auth
 * Returns user info and session tokens on success
 *
 * @param email - User's email address (must be unique)
 * @param password - User's plaintext password
 * @returns SignInResponseDto with user and session information
 * @throws Error if email already exists or Supabase returns error
 */
async signUp(email: string, password: string): Promise<SignInResponseDto> {
  const { data, error } = await this.supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  if (!data.user) {
    throw new Error('Invalid authentication response from Supabase');
  }

  // Note: data.session may be null if email confirmation is required
  // Check Supabase configuration for email verification behavior
  const session = data.session || null;

  if (!session) {
    throw new Error('No session returned after sign-up. Email verification may be required.');
  }

  // Map Supabase response to SignInResponseDto
  return {
    user: {
      id: data.user.id,
      email: data.user.email ?? '',
      email_confirmed_at: data.user.email_confirmed_at ?? null,
    },
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in ?? 3600,
      token_type: 'bearer',
    },
  };
}
```

### Step 3: Add Sign-Up Handler to Auth Controller

**File**: `/src/controllers/auth.controller.ts`

**Action**: Add new handler function to existing file

Add after the existing `signInHandler` definition:

```typescript
/**
 * Handler for POST /api/auth/sign-up
 * Registers a new user with email and password
 * Returns user info and JWT tokens on success
 *
 * Handles:
 * - Input validation (email format, password non-empty)
 * - Supabase authentication errors (email exists, weak password)
 * - Server errors (network, unexpected exceptions)
 */
export const signUpHandler = async (req: Request, res: Response) => {
  try {
    // Validate request body against schema
    const request = SignUpRequestSchema.parse(req.body);

    // Call auth service to register with Supabase
    const response = await authService.signUp(request.email, request.password);

    // Log successful sign-up
    console.log(`Sign-up successful: ${request.email}`);

    // Return 201 Created with sign-up response
    return res.status(201).set('Location', '/api/auth/me').json(response);
  } catch (err) {
    // Handle Zod validation errors
    if (err instanceof ZodError) {
      const errorMessage = err.errors[0]?.message ?? 'Validation failed';
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: errorMessage,
        },
      });
    }

    // Handle Supabase authentication errors
    if (err instanceof Error) {
      const errorMessage = err.message.toLowerCase();

      // Email already registered
      if (
        errorMessage.includes('user already exists') ||
        errorMessage.includes('duplicate key') ||
        errorMessage.includes('already registered')
      ) {
        console.log('Sign-up failed: email already registered');
        return res.status(409).json({
          error: {
            code: 'EMAIL_EXISTS',
            message: 'Email address is already registered',
          },
        });
      }

      // Weak password
      if (
        errorMessage.includes('password') ||
        errorMessage.includes('strength') ||
        errorMessage.includes('weak')
      ) {
        console.log('Sign-up failed: password strength insufficient');
        return res.status(422).json({
          error: {
            code: 'WEAK_PASSWORD',
            message: 'Password does not meet strength requirements',
          },
        });
      }
    }

    // Handle server errors
    console.error('Sign-up handler error', err);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Unexpected server error',
      },
    });
  }
};
```

### Step 4: Update Auth Router

**File**: `/src/routes/auth.router.ts`

**Action**: Add POST sign-up route to existing router

Update the imports and add the sign-up route:

```typescript
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getMeHandler, signInHandler, signUpHandler } from '../controllers/auth.controller.js';

const router = Router();

// Public endpoints (no auth required)
router.post('/sign-in', signInHandler);
router.post('/sign-up', signUpHandler);

// Protected endpoint (auth required)
router.get('/me', authMiddleware, getMeHandler);

export default router;
```

### Step 5: Add Rate Limiting for Sign-Up

**File**: `/src/routes/auth.router.ts`

**Action**: Add rate limiter to sign-up endpoint if not already implemented globally

```typescript
import rateLimit from 'express-rate-limit';

// Rate limit: 10 attempts per 15 minutes per IP
const signUpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per windowMs
  message: 'Too many registration attempts. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const router = Router();

router.post('/sign-in', signInHandler);
router.post('/sign-up', signUpLimiter, signUpHandler); // Apply rate limiter

router.get('/me', authMiddleware, getMeHandler);

export default router;
```

### Step 6: Verify Dependencies

**File**: `package.json`

**Action**: Ensure required packages are installed

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.x.x",
    "express": "^4.x.x",
    "zod": "^3.x.x",
    "express-rate-limit": "^6.x.x"
  }
}
```

**Install if missing**:
```bash
npm install express-rate-limit
```

### Step 7: Verify Environment Variables

**File**: `.env`

**Action**: Ensure required environment variables are present

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key
NODE_ENV=development
PORT=3000
```

### Step 8: Test Sign-Up Implementation

**Manual Testing**:

1. **Start backend server**:
   ```bash
   npm run dev
   ```

2. **Test successful sign-up** (new email):
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-up \
     -H "Content-Type: application/json" \
     -d '{
       "email": "newuser@example.com",
       "password": "SecurePassword123!"
     }'
   ```
   **Expected**: 201 Created with user and session objects

3. **Test duplicate email** (should fail with 409):
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-up \
     -H "Content-Type: application/json" \
     -d '{
       "email": "newuser@example.com",
       "password": "DifferentPassword456!"
     }'
   ```
   **Expected**: 409 Conflict with error code EMAIL_EXISTS

4. **Test invalid email format** (should fail with 400):
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-up \
     -H "Content-Type: application/json" \
     -d '{
       "email": "notanemail",
       "password": "SecurePassword123!"
     }'
   ```
   **Expected**: 400 Bad Request with validation error

5. **Test empty password** (should fail with 400):
   ```bash
   curl -X POST http://localhost:3000/api/auth/sign-up \
     -H "Content-Type: application/json" \
     -d '{
       "email": "anotheruser@example.com",
       "password": ""
     }'
   ```
   **Expected**: 400 Bad Request with validation error

6. **Test rate limiting** (10+ requests rapidly):
   ```bash
   for i in {1..15}; do
     curl -X POST http://localhost:3000/api/auth/sign-up \
       -H "Content-Type: application/json" \
       -d "{\"email\": \"user$i@example.com\", \"password\": \"Pass123!\"}"
   done
   ```
   **Expected**: First 10 succeed (201), remaining fail with 429 Too Many Requests

### Step 9: Verify New User Resources Created

**Database Verification**:

After successful sign-up, verify that related tables are populated:

```bash
# Connect to Supabase dashboard or use SQL console
# Verify user created in auth.users table
SELECT id, email, email_confirmed_at FROM auth.users WHERE email = 'newuser@example.com';

# Verify profile created
SELECT user_id, timezone FROM public.profiles WHERE user_id = '...';

# Verify preferences created with defaults
SELECT user_id, active_categories, report_dow FROM public.preferences WHERE user_id = '...';
```

**Expected**:
- User record in `auth.users` (created by Supabase Auth)
- Profile record with default timezone (UTC or configured default)
- Preferences record with default settings (all categories active, weekly report on Monday at 8am, etc.)

### Step 10: Create Unit Tests

**File**: `/src/controllers/auth.controller.spec.ts`

**Action**: Create tests for sign-up handler

```typescript
describe('signUpHandler', () => {
  it('should return 201 and user/session on successful sign-up', async () => {
    // Mock authService.signUp to return successful response
    // Call signUpHandler with valid email and password
    // Assert status is 201
    // Assert response contains user and session objects
  });

  it('should return 400 on invalid email format', async () => {
    // Call signUpHandler with invalid email (e.g., "notanemail")
    // Assert status is 400
    // Assert error code is VALIDATION_ERROR
  });

  it('should return 400 on empty password', async () => {
    // Call signUpHandler with empty password
    // Assert status is 400
    // Assert error message mentions password
  });

  it('should return 409 when email already exists', async () => {
    // Mock authService.signUp to throw "user already exists" error
    // Call signUpHandler with duplicate email
    // Assert status is 409
    // Assert error code is EMAIL_EXISTS
  });

  it('should return 422 on weak password', async () => {
    // Mock authService.signUp to throw password strength error
    // Call signUpHandler
    // Assert status is 422
    // Assert error code is WEAK_PASSWORD
  });

  it('should return 500 on server error', async () => {
    // Mock authService.signUp to throw unexpected error
    // Call signUpHandler
    // Assert status is 500
    // Assert error code is SERVER_ERROR
  });

  it('should set Location header to /api/auth/me', async () => {
    // Mock successful sign-up
    // Call signUpHandler
    // Assert Location header is set
  });
});
```

### Step 11: Integration Testing

**Action**: Test full flow with frontend

1. Frontend calls `POST /api/auth/sign-up` with valid credentials
2. Backend verifies response includes `access_token` and `refresh_token`
3. Frontend stores tokens in HTTP-only cookie or localStorage
4. Frontend calls `GET /api/auth/me` with Authorization header using token
5. Backend auth middleware validates token and returns user context
6. Frontend navigates to dashboard or prompts for email verification

### Step 12: Email Verification Flow

**Action**: (Optional) Implement email verification

1. On sign-up, Supabase sends verification email if configured
2. Email contains verification link with token
3. Frontend displays message: "Please check your email to verify your account"
4. User clicks verification link in email
5. Supabase automatically confirms email in `auth.users.email_confirmed_at`
6. Frontend can show verified status via `GET /api/auth/me`

### Step 13: Documentation & Deployment

**Action**:

1. Document endpoint in API documentation (OpenAPI/Swagger)
   - Include request/response schemas
   - Document error codes and status codes
   - Include rate limiting behavior

2. Update team wiki with sign-up flow diagram
   - Client → Backend → Supabase Auth flow
   - Error scenarios and retry logic

3. Configure monitoring/alerting for auth endpoints
   - Alert on error rate > 5%
   - Alert on response time p95 > 500ms
   - Monitor rate limiter triggers

4. Deploy to staging environment for QA testing
   - Verify end-to-end sign-up flow
   - Test email verification (if applicable)
   - Load test with concurrent registrations

5. Deploy to production with monitoring enabled
   - Monitor sign-up success rate
   - Track response times
   - Monitor for security incidents

---

## Implementation Checklist

- [ ] Add `SignUpRequestSchema` to `/src/validation/auth.ts`
- [ ] Add `signUp()` method to `/src/services/auth.service.ts`
- [ ] Add `signUpHandler` to `/src/controllers/auth.controller.ts`
- [ ] Update `/src/routes/auth.router.ts` with `POST /sign-up` route
- [ ] Add rate limiter to sign-up route (10/15min or similar)
- [ ] Verify `express-rate-limit` is in `package.json` dependencies
- [ ] Verify `.env` contains `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- [ ] Test successful sign-up with valid credentials (expect 201)
- [ ] Test duplicate email error (expect 409)
- [ ] Test invalid email format (expect 400)
- [ ] Test empty password (expect 400)
- [ ] Test rate limiting (10+ requests should return 429)
- [ ] Verify database records created (profiles, preferences)
- [ ] Create unit tests in `/src/controllers/auth.controller.spec.ts`
- [ ] Create integration tests with frontend
- [ ] Test email verification flow (if applicable)
- [ ] Update API documentation (OpenAPI/Swagger)
- [ ] Deploy to staging environment
- [ ] QA testing in staging
- [ ] Deploy to production
- [ ] Monitor error rates and response times in production
- [ ] Document in team wiki/runbooks
