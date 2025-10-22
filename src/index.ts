import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { supabaseMiddleware } from './middleware/supabase.middleware.js';
import authRouter from './routes/auth.router.js';
import preferencesRouter from './routes/preferences.router.js';
import notesRouter from './routes/notes.router.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(supabaseMiddleware);

// Routes
app.use('/api', authRouter);
app.use('/api/preferences', preferencesRouter);
app.use('/api/notes', notesRouter);

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'LifeSync API is running' });
});

// Example route with Supabase
app.get('/api/test', async (req, res) => {
  try {
    const { data, error } = await req.supabase
      .from('profiles')
      .select('*')
      .limit(1);

    if (error) throw error;

    res.json({ status: 'ok', data });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`✅ Server WEWEWE running on http://localhost:${PORT}`);
});

