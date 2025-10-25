import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types.js';

dotenv.config({ path: '.env.dev' });

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables: SUPABASE_URL and SUPABASE_SERVICE_KEY');
}

// Service client for server-side operations with elevated privileges
export const supabaseClient = createClient<Database>(supabaseUrl, supabaseServiceKey);
