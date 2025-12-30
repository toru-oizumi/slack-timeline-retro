import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { slackRoutes } from '@/presentation';
import { AppError } from '@/shared/errors';
import type { Env } from '@/shared/types';

const app = new Hono<{ Bindings: Env }>();

// Middleware
app.use('*', cors());
app.use('*', prettyJSON());
app.use('*', logger());

// Error handling
app.onError((err, c) => {
  console.error('Error:', err);

  if (err instanceof AppError) {
    return c.json(err.toJSON(), err.statusCode as 400 | 401 | 403 | 404 | 500);
  }

  return c.json(
    {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
    500 as const
  );
});

// 404 handling
app.notFound((c) => {
  return c.json(
    {
      code: 'NOT_FOUND',
      message: 'Not found',
    },
    404
  );
});

// Route registration
app.route('/', slackRoutes);

// Root path response
app.get('/', (c) => {
  return c.json({
    name: 'Slack Timeline Retro',
    version: '1.0.0',
    description: 'Slack Activity Summary Tool',
  });
});

// Start server
const port = Number(process.env.PORT) || 8080;

console.log(`Starting server on port ${port}...`);

serve({
  fetch: app.fetch,
  port,
});

console.log(`Server is running on http://localhost:${port}`);

export default app;
