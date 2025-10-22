import { Request, Response, NextFunction } from 'express';
import { supabaseClient } from '../db/supabase.client.js';

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

