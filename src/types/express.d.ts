import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../db/database.types';

declare global {
  namespace Express {
    interface Request {
      supabase: SupabaseClient<Database>;
      auth?: {
        userId: string;
        email: string;
        emailVerified: boolean;
        jwt: string;
      };
    }
  }
}
