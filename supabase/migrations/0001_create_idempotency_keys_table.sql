-- Create idempotency_keys table for tracking duplicate report generation requests
-- Purpose: Prevent duplicate report generation when requests are retried
-- TTL: Keys expire after 24 hours

-- Create the table
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  key TEXT NOT NULL,
  report_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Foreign key constraints
  CONSTRAINT fk_idempotency_keys_user_id 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT fk_idempotency_keys_report_id 
    FOREIGN KEY (report_id) REFERENCES public.reports(id) ON DELETE CASCADE,
  
  -- Unique constraint ensures one key per user per idempotency_key string
  CONSTRAINT unique_user_idempotency_key 
    UNIQUE(user_id, key)
);

-- Create index for fast lookup by user and key
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_user_key 
  ON public.idempotency_keys(user_id, key);

-- Create index for cleanup: fast lookup of expired keys
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at 
  ON public.idempotency_keys(expires_at) 
  WHERE expires_at < now();

-- Enable Row Level Security (RLS)
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- Create RLS policy: Users can only see their own idempotency keys
CREATE POLICY "Users can view their own idempotency keys" 
  ON public.idempotency_keys FOR SELECT
  USING (auth.uid() = user_id);

-- Create RLS policy: Users can only insert their own idempotency keys
CREATE POLICY "Users can insert their own idempotency keys" 
  ON public.idempotency_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Note: Cleanup of expired keys can be done via:
-- - Scheduled function (pg_cron) running periodically
-- - Or: DELETE FROM idempotency_keys WHERE expires_at < now();
-- For now, they'll be cleaned up when the TTL expires naturally in queries.
