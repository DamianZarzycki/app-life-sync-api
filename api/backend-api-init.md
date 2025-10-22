# Backend API with Supabase Integration

This document provides a reproducible guide to create the necessary file structure for integrating Supabase with your Node.js/Express backend API.

## Prerequisites

- Your backend should use Node.js with Express.js and TypeScript 5.
- Install the `@supabase/supabase-js` package.
- Ensure that `/supabase/config.toml` exists
- Ensure that a file `/src/db/database.types.ts` exists and contains the correct type definitions for your database.

IMPORTANT: Check prerequisites before performing actions below. If they're not met, stop and ask a user for the fix.

## File Structure and Setup

### 1. Supabase Client Initialization

Create the file `/src/db/supabase.client.ts` with the following content:

```ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabaseClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
```

This file initializes the Supabase client using the environment variables `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` (use the service role key for backend operations).

### 2. Environment Configuration

Create the file `/.env` (if it doesn't exist) with the following content:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
PORT=3000
```

Make sure to add `.env` to your `.gitignore` file.

### 3. Express Middleware Setup

Create the file `/src/middleware/supabase.middleware.ts` with the following content:

```ts
import { Request, Response, NextFunction } from 'express';
import { supabaseClient } from '../db/supabase.client';

export interface RequestWithSupabase extends Request {
  supabase: typeof supabaseClient;
}

export const supabaseMiddleware = (
  req: RequestWithSupabase,
  res: Response,
  next: NextFunction
) => {
  req.supabase = supabaseClient;
  next();
};
```

This middleware adds the Supabase client to Express request objects, making it available in all route handlers.

### 4. TypeScript Type Definitions

Create the file `/src/types/express.d.ts` with the following content:

```ts
import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../db/database.types';

declare global {
  namespace Express {
    interface Request {
      supabase: SupabaseClient<Database>;
    }
  }
}
```

This file augments the Express Request type to include the Supabase client, ensuring proper typing throughout your application.

### 5. Main Server Setup Example

Update or create `/src/index.ts` (or `/src/server.ts`) to use the middleware:

```ts
import express from 'express';
import cors from 'cors';
import { supabaseMiddleware } from './middleware/supabase.middleware';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(supabaseMiddleware);

// Your routes will now have access to req.supabase
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', database: 'connected' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### 6. Install Required Dependencies

Make sure to install these packages:

```bash
npm install express cors dotenv @supabase/supabase-js
npm install -D @types/express @types/cors @types/node typescript ts-node
```

## Usage in Routes

Once the middleware is set up, you can access the Supabase client in any route handler:

```ts
app.get('/api/users', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('users')
      .select('*');
    
    if (error) throw error;
    
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

