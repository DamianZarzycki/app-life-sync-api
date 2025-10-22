import { createClient } from '@supabase/supabase-js';
import type { MeResponseDto } from '../types.js';
import type { Database } from '../db/database.types.js';

const supabaseUrl = process.env.SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY as string;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

export class UserContextService {
  private adminClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

  /**
   * Build MeResponseDto ignoring RLS (using service key) – suitable for early development.
   */
  async getMe(auth: { userId: string; email: string; emailVerified: boolean }): Promise<MeResponseDto> {
    // Fetch existence of profile
    const { data: profileData, error: profileError } = await this.adminClient
      .from('profiles')
      .select('user_id')
      .eq('user_id', auth.userId)
      .maybeSingle();

    if (profileError) throw profileError;

    const { data: prefData, error: prefError } = await this.adminClient
      .from('preferences')
      .select('user_id')
      .eq('user_id', auth.userId)
      .maybeSingle();

    if (prefError) throw prefError;

    return {
      userId: auth.userId,
      email: auth.email,
      emailVerified: auth.emailVerified,
      hasProfile: !!profileData,
      hasPreferences: !!prefData,
    };
  }
}
