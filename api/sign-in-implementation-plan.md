# API Endpoint Implementation Plan: POST /api/auth/sign-in

## 1. Endpoint Overview

The `POST /api/auth/sign-in` endpoint authenticates a user by verifying their email and password credentials against Supabase Auth. Upon successful authentication, it returns the authenticated user's information along with JWT tokens (access and refresh tokens) that enable subsequent authenticated requests. This is the primary entry point for user authentication in the LifeSync application.

**Purpose**: Enable users to authenticate with email and password, establishing a new session
**Resource**: Authentication / Session Management
**Idempotency**: Not idempotent (repeated calls with same credentials will succeed)

---

## 2. Request Details

### HTTP Method
**POST**

### URL Structure
```
POST /api/auth/sign-in
```

### Parameters

#### Required (Request Body)
- **email** (string, required)
  - User's email address
  - Constraint: Must be a valid email format (RFC 5322 simplified)
  - Example: `"user@example.com"`

- **password** (string, required)
  - User's plaintext password
  - Constraint: Non-empty string; Supabase enforces password strength rules
  - Example: `"securePassword123"`

#### Optional
- None

### Request Body Structure
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

### Request Example
```bash
curl -X POST http://localhost:3000/api/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "securePassword123"
  }'
```

---

## 3. Used Types

### Request DTO (Command Model)
```typescript
// From validation/auth.ts - NEW schema to create
export const SignInRequestSchema = z.object({
  email: z.string({ required_error: 'email is required' })
    .email('email must be a valid email address'),
  password: z.string({ required_error: 'password is required' })
    .min(1, 'password must not be empty')
});

export type SignInRequest = z.infer<typeof SignInRequestSchema>;
```

### Response DTOs
```typescript
// From types.ts - ADD these new types
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

### Related Types (Already Exist)
- `UUID` - String type alias for UUID values from Supabase
- `ErrorResponseDto` - Standard error response format used across API

---

## 4. Response Details

### Success Response (200 OK)

**HTTP Status**: 200 OK

**Response Body Structure**:
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "email_confirmed_at": "2025-01-01T10:00:00Z"
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
- `user.id`: UUID of authenticated user
- `user.email`: Email address of authenticated user
- `user.email_confirmed_at`: ISO 8601 timestamp when email was confirmed, or `null` if not confirmed
- `session.access_token`: JWT token for authenticating subsequent API requests (Bearer token)
- `session.refresh_token`: Token for obtaining new access tokens when current expires
- `session.expires_in`: Seconds until access token expiration (typically 3600 = 1 hour)
- `session.token_type`: Always `"bearer"` (HTTP Bearer authentication scheme)

### Error Responses

#### 400 Bad Request - Invalid Input
**Scenario**: Email or password missing, invalid format, or empty values

**Response**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email must be a valid email address",
    "details": {
      "field": "email",
      "reason": "invalid_email"
    }
  }
}
```

**Possible error codes**:
- `VALIDATION_ERROR` - Invalid email format or empty password
- Message varies based on specific validation failure

#### 401 Unauthorized - Invalid Credentials
**Scenario**: Email not found in system or password is incorrect

**Response**:
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```

**Note**: Backend returns same error message for both "user not found" and "wrong password" to prevent account enumeration attacks.

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

---

## 5. Data Flow

### Sequence Diagram

```
User/Client                  Backend                    Supabase Auth
     |                           |                             |
     |-- POST /api/auth/sign-in --|                             |
     |  {email, password}         |                             |
     |                            |-- signInWithPassword ------>|
     |                            |  (email, password)          |
     |                            |                             |
     |                            |<-- {user, session, error}---|
     |                            |                             |
     |<-- 200 OK SignInResponse --|
     |  {user, session}           |
```

### Data Flow Steps

1. **Request Reception**
   - Frontend sends HTTP POST request to `/api/auth/sign-in`
   - Request body contains email and password in JSON format
   - Content-Type header should be `application/json`

2. **Input Validation**
   - Backend middleware parses request body as JSON
   - Zod schema validates email format and non-empty password
   - If validation fails, return 400 Bad Request immediately
   - If validation passes, proceed to Supabase auth

3. **Supabase Authentication**
   - Backend calls `supabaseClient.auth.signInWithPassword(email, password)`
   - Supabase verifies credentials against `auth.users` table
   - Supabase generates JWT access token and refresh token
   - Supabase returns user object with id, email, email_confirmed_at

4. **Response Mapping**
   - Extract user info: id, email, email_confirmed_at
   - Extract session info: access_token, refresh_token, expires_in, token_type
   - Map to SignInResponseDto structure

5. **Success Response**
   - Return 200 OK HTTP status
   - Return SignInResponseDto with user and session data
   - Frontend receives tokens and stores them for future authenticated requests

### Error Flow

1. **Validation Failure**
   - Zod schema parsing fails (invalid email, empty password)
   - Return 400 Bad Request with validation error details
   - No attempt to contact Supabase

2. **Authentication Failure**
   - Supabase returns error (user not found or password incorrect)
   - Return 401 Unauthorized with generic error message
   - Do not reveal whether user exists to prevent account enumeration

3. **Server Error**
   - Network error, Supabase unavailable, or unexpected exception
   - Log error details to console for debugging
   - Return 500 Server Error with generic message to client

---

## 6. Security Considerations

### Authentication & Authorization
- **No authentication required** for this endpoint (sign-in is the authentication mechanism)
- This endpoint is **public** and accessible without prior JWT
- Response tokens enable authentication for all subsequent requests

### Input Validation & Sanitization
- **Email validation**: Must be valid email format (Zod + browser validation on frontend)
  - Reject empty strings, invalid formats
  - Frontend should normalize email to lowercase
- **Password validation**: Non-empty string required
  - Supabase enforces password strength (minimum length, complexity)
  - No additional backend validation needed
- **No HTML/JavaScript in inputs** (JSON payload mitigates XSS)

### Data Protection
- **Transport security**: Must use HTTPS in production (enforced at infrastructure level)
- **Token storage**: Tokens returned are JWT; frontend should store securely
  - Recommended: HTTP-only cookies (XSS-protected)
  - Alternative: localStorage (XSS-vulnerable but more convenient)
- **Password handling**: Never log or display passwords
  - Passwords sent only to Supabase auth service
  - Supabase handles password hashing/verification

### Threat Mitigation

#### Brute Force Attacks
- **Threat**: Attacker tries multiple password combinations
- **Mitigation**:
  - Implement rate limiting middleware for `/api/auth/sign-in` endpoint
  - Recommended: Max 5 attempts per email per 15-minute window
  - Rate limiting enforced per backend.mdc guidelines
  - Use IP-based or email-based rate limiting

#### Account Enumeration
- **Threat**: Attacker determines if email exists by comparing error responses
- **Mitigation**:
  - Return same 401 error for "user not found" and "wrong password"
  - Generic error message: "Invalid email or password"
  - Do not include user verification status in response

#### Credential Stuffing
- **Threat**: Attacker uses compromised credentials from other services
- **Mitigation**:
  - Rate limiting prevents rapid-fire attempts
  - Supabase may implement account lockout (configurable)
  - Frontend can implement account recovery/verification flow

#### Man-in-the-Middle (MITM)
- **Threat**: Attacker intercepts credentials and tokens in transit
- **Mitigation**:
  - HTTPS/TLS required in production (infrastructure level)
  - Tokens expire after fixed duration (typically 1 hour)
  - Refresh token rotation recommended (Supabase feature)

#### Token Misuse
- **Threat**: Stolen tokens used to impersonate user
- **Mitigation**:
  - Access tokens expire after short duration (1 hour)
  - Tokens include user ID claim (verified on each request)
  - Backend validates token on each request via auth middleware
  - Logout invalidates session server-side (if implemented)

### OWASP Top 10 Alignments
- **A01:2021 - Broken Access Control**: Auth middleware validates JWT on protected endpoints
- **A02:2021 - Cryptographic Failures**: HTTPS enforced; JWT signed by Supabase
- **A03:2021 - Injection**: Zod validation prevents injection attacks
- **A04:2021 - Insecure Design**: Follow Supabase auth best practices
- **A07:2021 - Cross-Site Scripting (XSS)**: JSON payload + HTTP-only cookie storage
- **A10:2021 - Broken Logging & Monitoring**: Errors logged to console; consider adding observability

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

#### Invalid Email Format
**Trigger**: Email value is not a valid email address
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

### Authentication Errors (401 Unauthorized)

#### User Not Found or Wrong Password
**Trigger**: Email doesn't exist in system OR password is incorrect
**Error Response**:
```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "Invalid email or password"
  }
}
```
**Handling**: Supabase returns error; return 401 with generic message (prevent enumeration)
**Logging**: Log to console with user email for audit purposes (without password)
```typescript
console.log(`Sign-in failed for email: ${email}`);
```

#### User Account Disabled or Unconfirmed
**Trigger**: Supabase returns specific error for disabled/unconfirmed account
**Error Response**: Same as above (401) or configurable per business rules
**Handling**: Check Supabase error type; may return 401 or 403 depending on policy
**Note**: Current spec doesn't specify behavior; recommend accepting unconfirmed emails

### Server Errors (500 Internal Server Error)

#### Supabase Service Unavailable
**Trigger**: Network error or Supabase API down
**Error Response**:
```json
{
  "error": {
    "code": "SERVER_ERROR",
    "message": "Unexpected server error"
  }
}
```
**Handling**: Catch exception; log error details to console
```typescript
console.error('Supabase auth error', err);
```
**Recovery**: Frontend should retry after short delay (exponential backoff)

#### Missing Environment Variables
**Trigger**: SUPABASE_URL or SUPABASE_SERVICE_KEY not set at startup
**Error Response**: Server fails to start; errors logged to console
**Handling**: Validation happens in middleware initialization; prevents runtime errors
**Prevention**: Docker/deployment scripts verify environment setup

#### Unexpected Exception
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
**Handling**: Try/catch block in handler; log full error stack trace
```typescript
console.error('Sign-in handler error', err);
```

### Logging Strategy

**Success Logging**:
```typescript
console.log(`Sign-in successful: ${email}`);
```

**Failure Logging** (with context but no sensitive data):
```typescript
console.log(`Sign-in failed for email: ${email} - reason: invalid_credentials`);
console.error('Supabase error:', err);
```

**No Password Logging**: Never log request body or passwords

---

## 8. Performance Considerations

### Potential Bottlenecks

#### 1. Supabase Auth Service Latency
- **Issue**: Network latency to Supabase auth service (typically 50-200ms)
- **Mitigation**:
  - Use connection pooling (handled by Supabase SDK)
  - Consider adding request timeout (5 seconds recommended)
  - Monitor response times with observability tool

#### 2. Database Query Performance
- **Issue**: Supabase must query `auth.users` table to verify credentials
- **Mitigation**:
  - Supabase handles indexing automatically
  - No backend optimization needed at this level
  - Auth is managed by Supabase; no custom queries

#### 3. JWT Generation & Signing
- **Issue**: JWT token generation has cryptographic overhead
- **Mitigation**:
  - Supabase handles token generation; negligible overhead
  - No backend involvement; transparent operation

#### 4. Rate Limiting Overhead
- **Issue**: Rate limiting checks per request
- **Mitigation**:
  - Use in-memory rate limiter (middleware-level)
  - Consider Redis for distributed rate limiting
  - Negligible overhead for single-instance deployment

### Optimization Strategies

#### Request Validation Caching
- Cache Zod schema compilation (automatic in Zod)
- Minimal optimization needed

#### Connection Reuse
- Supabase SDK maintains connection pooling
- Backend doesn't need optimization here

#### Response Compression
- Enable gzip compression in Express middleware
- Applied to all responses automatically

#### Monitoring & Observability
- Track auth endpoint response times
- Monitor Supabase API latency
- Alert on error rates exceeding thresholds
- Use APM tools (e.g., Datadog, New Relic)

### Load Testing Recommendations
- Test endpoint with 100+ concurrent requests
- Verify rate limiting triggers at configured limits
- Monitor database connection pool exhaustion
- Test timeout behavior when Supabase is slow

---

## 9. Implementation Steps

### Step 1: Update Type Definitions

**File**: `/src/types.ts`

**Action**: Add new DTOs for sign-in request/response
```typescript
// Add to types.ts
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

### Step 2: Update Validation Schema

**File**: `/src/validation/auth.ts`

**Action**: Add Zod schema for sign-in request validation
```typescript
// Add to auth.ts
export const SignInRequestSchema = z.object({
  email: z.string({ required_error: 'email is required' })
    .email('email must be a valid email address'),
  password: z.string({ required_error: 'password is required' })
    .min(1, 'password must not be empty'),
});

export type SignInRequest = z.infer<typeof SignInRequestSchema>;
```

### Step 3: Create Auth Service

**File**: `/src/services/auth.service.ts` (NEW)

**Action**: Create dedicated service for authentication logic
```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types.js';
import type { SignInResponseDto, SignInUserDto } from '../types.js';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export class AuthService {
  private supabaseClient = createClient<Database>(supabaseUrl, supabaseAnonKey);

  async signIn(email: string, password: string): Promise<SignInResponseDto> {
    const { data, error } = await this.supabaseClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw error;
    }

    if (!data.user || !data.session) {
      throw new Error('Invalid authentication response from Supabase');
    }

    return {
      user: {
        id: data.user.id,
        email: data.user.email ?? '',
        email_confirmed_at: data.user.email_confirmed_at ?? null,
      },
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_in: data.session.expires_in ?? 3600,
        token_type: 'bearer',
      },
    };
  }
}
```

### Step 4: Create Sign-In Controller Handler

**File**: `/src/controllers/auth.controller.ts`

**Action**: Add sign-in handler (POST endpoint)
```typescript
import { Request, Response } from 'express';
import { SignInRequestSchema } from '../validation/auth.js';
import { AuthService } from '../services/auth.service.js';

const authService = new AuthService();

export const signInHandler = async (req: Request, res: Response) => {
  try {
    // Validate request body
    const request = SignInRequestSchema.parse(req.body);

    // Call auth service
    const response = await authService.signIn(request.email, request.password);

    // Return success response
    return res.status(200).json(response);
  } catch (err) {
    if (err instanceof ZodError) {
      // Validation error
      return res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: err.errors[0]?.message ?? 'Validation failed',
        },
      });
    }

    if (err instanceof AuthApiError && err.status === 400) {
      // Invalid credentials (Supabase returns 400 for auth failures)
      console.log(`Sign-in failed for email: ${req.body.email}`);
      return res.status(401).json({
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    // Server error
    console.error('Sign-in handler error', err);
    return res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Unexpected server error',
      },
    });
  }
};
```

### Step 5: Update Auth Router

**File**: `/src/routes/auth.router.ts`

**Action**: Add POST sign-in route
```typescript
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { getMeHandler, signInHandler } from '../controllers/auth.controller.js';

const router = Router();

// Public endpoint (no auth required)
router.post('/sign-in', signInHandler);

// Protected endpoint (auth required)
router.get('/me', authMiddleware, getMeHandler);

export default router;
```

### Step 6: Add Rate Limiting Middleware

**File**: `/src/middleware/rateLimit.middleware.ts` (NEW)

**Action**: Create rate limiting middleware for auth endpoints
```typescript
import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// Rate limit: 5 attempts per 15 minutes per IP
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per windowMs
  message: 'Too many sign-in attempts, please try again later',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
```

### Step 7: Apply Rate Limiting to Sign-In Route

**File**: `/src/routes/auth.router.ts`

**Action**: Apply rate limiter to sign-in endpoint
```typescript
import { authRateLimiter } from '../middleware/rateLimit.middleware.js';

// Public endpoint with rate limiting
router.post('/sign-in', authRateLimiter, signInHandler);
```

### Step 8: Update Main Server File

**File**: `/src/index.ts`

**Action**: Ensure auth router is registered
```typescript
import express from 'express';
import authRoutes from './routes/auth.router.js';

const app = express();

// ... middleware setup ...

app.use('/api/auth', authRoutes);

// ... rest of server setup ...
```

### Step 9: Add Environment Variables

**File**: `.env`

**Action**: Verify required environment variables are present
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key
NODE_ENV=development
PORT=3000
```

### Step 10: Install Required Dependencies

**Command**:
```bash
npm install express-rate-limit
```

### Step 11: Test Implementation

**Manual Testing**:
1. Start backend server: `npm run dev`
2. Test successful sign-in:
```bash
curl -X POST http://localhost:3000/api/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'
```
3. Test invalid email format (should return 400)
4. Test wrong password (should return 401)
5. Test rate limiting (5+ requests should be blocked)

### Step 12: Add Unit Tests

**File**: `/src/controllers/auth.controller.spec.ts` (NEW)

**Action**: Create tests for sign-in handler
```typescript
describe('signInHandler', () => {
  it('should return 200 and user/session on successful sign-in', async () => {
    // Test implementation
  });

  it('should return 400 on invalid email format', async () => {
    // Test implementation
  });

  it('should return 400 on empty password', async () => {
    // Test implementation
  });

  it('should return 401 on invalid credentials', async () => {
    // Test implementation
  });

  it('should return 500 on server error', async () => {
    // Test implementation
  });
});
```

### Step 13: Integration Testing

**Action**: Test full flow with frontend
1. Frontend calls POST `/api/auth/sign-in` with valid credentials
2. Verify response includes access_token and refresh_token
3. Use access_token in Authorization header for subsequent requests
4. Verify auth middleware validates token on protected endpoints

### Step 14: Documentation & Deployment

**Action**: 
1. Document endpoint in API documentation (OpenAPI/Swagger)
2. Update team wiki with sign-in flow diagram
3. Configure monitoring/alerting for auth endpoint
4. Deploy to staging environment for QA testing
5. Deploy to production with monitoring enabled

---

## Implementation Checklist

- [ ] Update `/src/types.ts` with SignInResponseDto, SignInUserDto, SignInSessionDto
- [ ] Update `/src/validation/auth.ts` with SignInRequestSchema
- [ ] Create `/src/services/auth.service.ts` with AuthService class
- [ ] Update `/src/controllers/auth.controller.ts` with signInHandler
- [ ] Update `/src/routes/auth.router.ts` with POST /sign-in route
- [ ] Create `/src/middleware/rateLimit.middleware.ts` with rate limiter
- [ ] Apply rate limiter to sign-in route
- [ ] Verify .env file contains SUPABASE_ANON_KEY
- [ ] Install `express-rate-limit` dependency
- [ ] Test manual sign-in via curl
- [ ] Create unit tests in `/src/controllers/auth.controller.spec.ts`
- [ ] Create integration tests
- [ ] Update API documentation
- [ ] Deploy to staging and verify
- [ ] Deploy to production with monitoring
