import express from 'express';
import cors from 'cors';
import { config, hasAiKey, hasSupabase } from './config/env.js';
import swaggerUi from 'swagger-ui-express';
import routes from './routes/index.js';
import { openapiSpec } from './docs/openapi.js';
import { AiError } from './services/ai/client.js';
import { DbError } from './data/db.js';

const app = express();
// The client is deployed separately, so it always calls this API cross-origin.
// CLIENT_ORIGIN pins the allowed origin in production; unset means allow all,
// which is what you want locally.
app.use(cors({ origin: config.clientOrigin || true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) =>
  res.json({ ok: true, aiConfigured: hasAiKey(), authConfigured: hasSupabase() }),
);

// Interactive API docs. The raw spec is served too, for Postman/Insomnia import.
app.get('/api/openapi.json', (req, res) => res.json(openapiSpec));
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, {
    customSiteTitle: 'AI NPC Generator API',
    swaggerOptions: { docExpansion: 'list', defaultModelsExpandDepth: 1, persistAuthorization: true },
  }),
);

app.use('/api', routes);

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// AI failures get their own status codes so the UI can explain what went wrong.
app.use((error, req, res, next) => {
  if (error instanceof AiError) {
    const status = error.code === 'missing_key' ? 503 : error.code === 'refused' ? 422 : 502;
    return res.status(status).json({ error: error.message, code: error.code });
  }
  if (error instanceof DbError) {
    // 22xxx bad value, 23xxx constraint rejected the data: the request's fault.
    if (/^2[23]/.test(error.code || '')) return res.status(400).json({ error: error.message });
    // PostgREST cannot find a table: the migration has not been run yet.
    if (error.code === 'PGRST205') {
      return res.status(503).json({
        error: 'The database tables do not exist yet. Run supabase/migrations/0001_init.sql in the Supabase SQL Editor.',
        code: 'missing_schema',
      });
    }
    // Row Level Security refused the write.
    if (error.code === '42501') return res.status(403).json({ error: 'Not allowed.' });
  }
  console.error('[error]', error);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

app.listen(config.port, () => {
  console.log(`[server] http://localhost:${config.port}`);
  console.log(`[server] API docs at http://localhost:${config.port}/api/docs`);
  if (!hasSupabase()) {
    console.warn('[server] SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY not set — signed-in routes will return 503.');
  }
  if (!hasAiKey()) console.warn('[server] AI_API_KEY not set — AI features will return 503.');
});
