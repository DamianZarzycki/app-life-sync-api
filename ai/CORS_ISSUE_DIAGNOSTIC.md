# CORS Issue Diagnostic: POST /api/notes

## Problem
CORS errors received when calling `POST /api/notes` endpoint

## Root Cause Analysis

### Current Configuration (src/index.ts)
```typescript
app.use(cors());  // Line 19
app.use(express.json());
```

**Issue**: Default `cors()` configuration may not handle:
1. Custom headers properly
2. Credentials (cookies/auth tokens)
3. Specific origin requirements
4. Content-Type: application/json

---

## Solution

### Option 1: Explicit CORS Configuration (Recommended)

**Update**: `src/index.ts` (lines 19-20)

```typescript
// Replace this:
app.use(cors());
app.use(express.json());

// With this:
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
}));
app.use(express.json({ limit: '10kb' }));
```

### Option 2: Development CORS (Allow All)

```typescript
app.use(cors({
  origin: '*',  // Allow all origins (development only!)
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
}));
app.use(express.json());
```

### Option 3: Environment-Based Configuration

```typescript
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.FRONTEND_URL || 'https://lifesync.app')
    : ['http://localhost:3000', 'http://localhost:4200'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 3600,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json());
```

---

## Common CORS Issues & Fixes

### 1. Preflight Request Failing (OPTIONS)

**Error**: `No 'Access-Control-Allow-Origin' header`

**Cause**: Preflight OPTIONS request not being handled

**Fix**: Ensure CORS middleware is first (before routes)
```typescript
// CORRECT ORDER:
app.use(cors(corsOptions));     // FIRST
app.use(express.json());         // SECOND
app.use(supabaseMiddleware);     // THIRD
app.use('/api', authRouter);     // Routes last
```

### 2. Authorization Header Blocked

**Error**: `Authorization header not allowed`

**Cause**: `allowedHeaders` doesn't include 'Authorization'

**Fix**:
```typescript
cors({
  allowedHeaders: ['Content-Type', 'Authorization'],  // Add Authorization!
  credentials: true,
})
```

### 3. Credentials/Cookies Not Working

**Error**: Cookies not being sent with request

**Cause**: `credentials` not set in CORS config

**Fix**:
```typescript
cors({
  credentials: true,  // Allow cookies
  origin: 'http://localhost:4200',  // Specific origin (not *)
})
```

### 4. Content-Type Mismatch

**Error**: Request fails with Content-Type issue

**Cause**: CORS or body parsing issue

**Fix**:
```typescript
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: true }));
```

---

## Testing CORS with CURL

### Test 1: Preflight (OPTIONS) Request
```bash
curl -X OPTIONS http://localhost:3000/api/notes \
  -H "Origin: http://localhost:4200" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: Content-Type,Authorization" \
  -v
```

**Expected Response Headers**:
```
Access-Control-Allow-Origin: http://localhost:4200
Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
Access-Control-Allow-Credentials: true
```

### Test 2: POST Request with CORS
```bash
curl -X POST http://localhost:3000/api/notes \
  -H "Origin: http://localhost:4200" \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"category_id":"uuid","title":"Test","content":"Test note"}' \
  -v
```

**Expected Response Headers**:
```
Access-Control-Allow-Origin: http://localhost:4200
Access-Control-Allow-Credentials: true
```

---

## Browser Console Error Diagnostics

### Error: "No 'Access-Control-Allow-Origin' header"
→ Check CORS middleware is configured and first in middleware chain

### Error: "Credentials mode is 'include' but Access-Control-Allow-Credentials is missing"
→ Add `credentials: true` to CORS config

### Error: "Authorization is not allowed by Access-Control-Allow-Headers"
→ Add 'Authorization' to `allowedHeaders`

### Error: "Method POST is not allowed by Access-Control-Allow-Methods"
→ Add 'POST' to `methods` array

---

## Environment Variables to Add

**`.env` file**:
```
# CORS Configuration
FRONTEND_URL=http://localhost:4200
NODE_ENV=development
```

**`.env.production`**:
```
FRONTEND_URL=https://lifesync.app
NODE_ENV=production
```

---

## Recommended Fix (Immediate)

Update `src/index.ts` line 19:

```typescript
// BEFORE (line 19):
app.use(cors());

// AFTER (line 19):
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:4200',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200,
}));
```

Then restart server:
```bash
npm run dev
# or
node dist/index.js
```

---

## Verification Steps

1. ✅ Check server logs for CORS errors
2. ✅ Use browser DevTools Network tab to inspect requests
3. ✅ Test preflight (OPTIONS) request works
4. ✅ Test POST request with Authorization header
5. ✅ Verify Location header in 201 response
6. ✅ Verify response body is full NoteDto

---

## Additional Resources

- [MDN: CORS](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
- [Express CORS npm package](https://www.npmjs.com/package/cors)
- [CORS preflight requests](https://developer.mozilla.org/en-US/docs/Glossary/Preflight_request)

---

## Summary

**Quick Fix**: Add explicit CORS configuration with `credentials: true` and `allowedHeaders: ['Content-Type', 'Authorization']`

**Action Items**:
1. Update CORS configuration in `src/index.ts`
2. Add environment variables to `.env`
3. Restart the server
4. Test with CURL/Postman
5. Test from browser

Should resolve POST endpoint CORS issues ✅

