import express from 'express';
import cors from 'cors';
import { config, hasAiKey } from './config/env.js';
import { connectDb } from './config/db.js';
import swaggerUi from 'swagger-ui-express';
import routes from './routes/index.js';
import { openapiSpec } from './docs/openapi.js';
import { AiError } from './services/ai/client.js';

const app = express();
// The client is deployed separately, so it always calls this API cross-origin.
// CLIENT_ORIGIN pins the allowed origin in production; unset means allow all,
// which is what you want locally.
app.use(cors({ origin: config.clientOrigin || true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true, aiConfigured: hasAiKey() }));

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
  if (error?.name === 'CastError') {
    return res.status(400).json({ error: 'Malformed id' });
  }
  if (error?.name === 'ValidationError') {
    return res.status(400).json({ error: error.message });
  }
  console.error('[error]', error);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

await connectDb();
app.listen(config.port, () => {
  console.log(`[server] http://localhost:${config.port}`);
  console.log(`[server] API docs at http://localhost:${config.port}/api/docs`);
  if (!hasAiKey()) console.warn('[server] AI_API_KEY not set — AI features will return 503.');
});
