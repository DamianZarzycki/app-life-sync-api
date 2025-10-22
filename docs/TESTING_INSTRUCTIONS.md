# 🧪 Testing Instructions - PUT /api/preferences

## Quick Start

### Option 1: Run All Tests (Recommended)
```bash
cd app-life-sync-api
chmod +x test-preferences.sh
./test-preferences.sh
```

**Output**: Comprehensive test results with pass/fail counts

---

### Option 2: Individual Curl Commands
```bash
cd app-life-sync-api
cat CURL_QUICK_REFERENCE.md
```

Pick any command and run it from the terminal.

---

### Option 3: Manual Testing
Copy curl examples from `CURL_QUICK_REFERENCE.md` and paste into terminal.

---

## Prerequisites

### 1. API Server Running
```bash
cd app-life-sync-api
npm install
npm run dev
```

**Expected Output**:
```
✅ Server running on http://localhost:3000
```

### 2. Development Dependencies (Optional)
For pretty-printed JSON output, install `jq`:
```bash
# macOS
brew install jq

# Ubuntu/Debian
sudo apt-get install jq

# Or just skip and view raw JSON
```

---

## Testing Modes

### Dev Mode (Default - No JWT Required)
The API runs in dev mode by default. No authentication header needed:

```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "X-Mock-User-Id: 00000000-0000-0000-0000-000000000001" \
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

### Production Mode (JWT Required)
1. Get a JWT token from sign-in endpoint:
```bash
curl -X POST http://localhost:3000/api/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

2. Use the `access_token` in preferences requests:
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ ... }'
```

---

## Test Script Usage

### Run All Tests (Dev Mode)
```bash
./test-preferences.sh
```

### Run Tests with JWT Token
```bash
./test-preferences.sh "your_jwt_token_here"
```

### Script Output
```
╔════════════════════════════════════════════════════════════╗
║ PUT /api/preferences - Test Suite                          ║
╚════════════════════════════════════════════════════════════╝

Using DEV MODE (mock user)
Mock User ID: 00000000-0000-0000-0000-000000000001

╔════════════════════════════════════════════════════════════╗
║ SECTION 1: Success Cases (200 OK)                         ║
╚════════════════════════════════════════════════════════════╝

→ Test: Valid request with empty categories
Response:
{
  "user_id": "...",
  "active_categories": [],
  ...
}
✓ PASS: Got expected status code: 200

...

╔════════════════════════════════════════════════════════════╗
║ Test Summary                                              ║
╚════════════════════════════════════════════════════════════╝

Passed: 18
Failed: 0

Total: 18 tests

✓ All tests passed!
```

---

## Manual Testing Workflow

### Step 1: Test Success Case
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "X-Mock-User-Id: 00000000-0000-0000-0000-000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }' | jq
```

**Expected**: Status 200 with updated preferences

### Step 2: Verify Database Update
- Check that `updated_at` timestamp is recent
- Check that preferences values match what was sent
- Verify in Supabase console if available

### Step 3: Test Validation Error (Missing Field)
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "X-Mock-User-Id: 00000000-0000-0000-0000-000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 0,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null
  }' | jq
```

**Expected**: Status 400 with "max_daily_notes is required"

### Step 4: Test Constraint Error (Out of Range)
```bash
curl -X PUT http://localhost:3000/api/preferences \
  -H "X-Mock-User-Id: 00000000-0000-0000-0000-000000000001" \
  -H "Content-Type: application/json" \
  -d '{
    "active_categories": [],
    "report_dow": 7,
    "report_hour": 2,
    "preferred_delivery_channels": ["in_app", "email"],
    "email_unsubscribed_at": null,
    "max_daily_notes": 4
  }' | jq
```

**Expected**: Status 422 with "report_dow must be between 0 and 6"

---

## Common Test Scenarios

### ✅ Success Cases to Test

1. **Empty categories, both channels**
   - Status: 200
   - File: `CURL_QUICK_REFERENCE.md` → "Basic Valid Request"

2. **Single delivery channel**
   - Status: 200
   - File: `CURL_QUICK_REFERENCE.md` → "Email-Only Delivery"

3. **With unsubscribed timestamp**
   - Status: 200
   - File: `CURL_QUICK_REFERENCE.md` → "With Email Unsubscribed Timestamp"

4. **Boundary values (min/max)**
   - Status: 200
   - File: `CURL_QUICK_REFERENCE.md` → "Maximum/Minimum Boundaries"

### ❌ Error Cases to Test

1. **Missing field** → 400
2. **Wrong type** → 400
3. **Value out of range** → 422
4. **Invalid enum** → 422
5. **Empty array** → 422
6. **Too many items** → 422
7. **Missing JWT** → 401
8. **Invalid JWT** → 401

---

## Troubleshooting

### "curl: command not found"
curl should be pre-installed on macOS. For Linux:
```bash
sudo apt-get install curl
```

### "Connection refused"
API not running. Start with:
```bash
npm run dev
```

### JSON parse errors
Response is valid but `jq` can't parse. Try without `jq`:
```bash
curl ... # without | jq
```

### "Invalid token" (401)
- In dev mode: ignore JWT errors, use mock headers
- In prod mode: use valid JWT from `/api/auth/sign-in`

### "PREFERENCES_NOT_FOUND" (404)
- Rare in normal operation
- Means user has no preferences record
- Create a new user profile to generate preferences

### "VALIDATION_ERROR" with category IDs
- Category UUIDs don't exist in database
- Use valid UUIDs from your categories table
- Test with empty array first: `"active_categories": []`

---

## Automation Ideas

### Run Tests in CI/CD
Add to your pipeline:
```bash
cd app-life-sync-api
./test-preferences.sh $JWT_TOKEN
```

### Monitor Test Results
```bash
# Run and save results
./test-preferences.sh > test-results.txt 2>&1

# Check results
grep "failed" test-results.txt
```

### Load Testing
Use the script multiple times:
```bash
for i in {1..10}; do
  ./test-preferences.sh
done
```

---

## Testing Checklist

- [ ] Start API server with `npm run dev`
- [ ] Run test script: `./test-preferences.sh`
- [ ] Verify all tests pass
- [ ] Manually test one success case
- [ ] Manually test one validation error
- [ ] Check database for updated preferences
- [ ] Verify `updated_at` timestamp changed
- [ ] Test with maximum values (10 max_daily_notes, 6 report_dow, 23 report_hour)
- [ ] Test with minimum values (1 max_daily_notes, 0 report_dow, 0 report_hour)
- [ ] Test with empty categories
- [ ] Test with both delivery channels
- [ ] Test with single delivery channel

---

## Files Reference

| File | Purpose |
|------|---------|
| `test-preferences.sh` | Automated test suite (18 tests) |
| `CURL_QUICK_REFERENCE.md` | Individual curl commands for manual testing |
| `ENDPOINT_TESTING_GUIDE.md` | Detailed testing scenarios (was provided before) |
| `src/validation/preferences.ts` | Zod schema (what's being tested) |
| `src/controllers/preferences.controller.ts` | Handler logic (what's being tested) |
| `src/services/preferences.service.ts` | Service logic (what's being tested) |

---

## Expected Test Results

Running `./test-preferences.sh` should produce:

```
Passed: 18
Failed: 0
Total: 18 tests

✓ All tests passed!
```

If any test fails:
1. Check the error message
2. Review the failing test scenario
3. Check implementation code
4. Review the implementation plan

---

## Next Steps After Testing

1. ✅ All 18 tests pass
2. ⏳ Proceed to Step 6: Unit Tests (if needed)
3. ⏳ Proceed to Step 7: Integration Tests (if needed)
4. ⏳ Proceed to Step 8: Documentation & Deployment

---

## Support

For questions:
1. Review `CURL_QUICK_REFERENCE.md` for command examples
2. Check `ENDPOINT_TESTING_GUIDE.md` for detailed scenarios
3. Review implementation plan: `api/preferences-implementation-plan.md`
4. Check implementation code comments

---

**Happy Testing! 🎉**
