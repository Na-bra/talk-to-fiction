import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Resolve .env relative to this file, not the working directory, so the server
// behaves the same whether it is started from the repo root or from server/.
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(serverRoot, '.env') });

export const config = {
  port: Number(process.env.PORT) || 4000,
  supabase: {
    url: (process.env.SUPABASE_URL || '').replace(/\/$/, ''),
    // Publishable key ("anon" on older projects). Safe to expose — Row Level
    // Security is what protects the data, not this key.
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '',
    // Secret key ("service_role" on older projects). Bypasses Row Level
    // Security, so only scripts use it — never a request path.
    secretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  // Deployed client origin, e.g. https://ai-npc-generator.vercel.app
  // Unset allows any origin — fine locally, not in production.
  clientOrigin: process.env.CLIENT_ORIGIN || '',
  ai: {
    apiKey: process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '',
    // Dialogue model. This is the one that has to hold a character together.
    model: process.env.AI_MODEL || 'gemini-3.5-flash-lite',
    // Cheaper model for the mechanical work: reflection and summarisation.
    // Both are structured extraction, not performance, so a smaller model
    // does them fine at a fraction of the cost.
    fastModel: process.env.AI_MODEL_FAST || 'gemini-3.5-flash-lite',
  },
};

export const hasAiKey = () => Boolean(config.ai.apiKey);
export const hasSupabase = () => Boolean(config.supabase.url && config.supabase.publishableKey);
