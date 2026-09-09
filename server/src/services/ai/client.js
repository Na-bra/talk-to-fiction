import { GoogleGenAI, ApiError, HarmCategory, HarmBlockThreshold } from '@google/genai';
import { z } from 'zod';
import { config, hasAiKey } from '../../config/env.js';

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AiError';
    this.code = code; // 'missing_key' | 'refused' | 'bad_output' | 'upstream'
  }
}

let client = null;

function getClient() {
  if (!hasAiKey()) {
    throw new AiError(
      'missing_key',
      'No AI_API_KEY configured. Add a Gemini API key to server/.env to enable AI features.',
    );
  }
  if (!client) client = new GoogleGenAI({ apiKey: config.ai.apiKey });
  return client;
}

// These characters lie, threaten and keep ugly secrets. Default filters are
// tuned for assistants, not fiction, so they are relaxed to "only high" —
// still blocking genuinely harmful output, but not ordinary drama.
const SAFETY_SETTINGS = [
  HarmCategory.HARM_CATEGORY_HARASSMENT,
  HarmCategory.HARM_CATEGORY_HATE_SPEECH,
  HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
  HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
].map((category) => ({ category, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH }));

/** Gemini uses 'model' where the rest of the app says 'assistant'. */
function toContents(messages) {
  return messages.map((message) => ({
    role: message.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: message.content }],
  }));
}

function readResponse(response) {
  const blocked = response.promptFeedback?.blockReason;
  if (blocked) {
    throw new AiError('refused', `The request was blocked by the provider (${blocked}).`);
  }

  const candidate = response.candidates?.[0];
  const finish = candidate?.finishReason;
  if (finish === 'SAFETY' || finish === 'PROHIBITED_CONTENT' || finish === 'BLOCKLIST') {
    throw new AiError('refused', `The model stopped for safety reasons (${finish}).`);
  }

  const text = (response.text || '').trim();
  if (!text) {
    throw new AiError('upstream', `The model returned no text (finish reason: ${finish ?? 'unknown'}).`);
  }
  return text;
}

function wrap(error) {
  if (error instanceof AiError) return error;
  if (error instanceof ApiError) {
    if (error.status === 400 && /api[_ ]?key/i.test(error.message)) {
      return new AiError('missing_key', 'The configured AI_API_KEY was rejected by Gemini.');
    }
    if (error.status === 401 || error.status === 403) {
      return new AiError('missing_key', 'The configured AI_API_KEY was rejected by Gemini.');
    }
    if (error.status === 404) {
      return new AiError(
        'upstream',
        `Model not found. Check AI_MODEL / AI_MODEL_FAST in server/.env — run "npm run models" to list what your key can reach. (${error.message})`,
      );
    }
    if (error.status === 429) {
      return new AiError('upstream', 'Rate limited by Gemini. Try again shortly.');
    }
    return new AiError('upstream', error.message);
  }
  return new AiError('upstream', error?.message || 'Unexpected AI error.');
}

/** Free-form text generation — the in-character reply and summaries. */
export async function generateText({
  system,
  messages,
  maxTokens = 1200,
  temperature = 0.9,
  model = config.ai.model,
}) {
  try {
    const response = await getClient().models.generateContent({
      model,
      contents: toContents(messages),
      config: {
        systemInstruction: system,
        maxOutputTokens: maxTokens,
        temperature,
        safetySettings: SAFETY_SETTINGS,
      },
    });
    return readResponse(response);
  } catch (error) {
    throw wrap(error);
  }
}

/**
 * Schema-constrained generation — character drafts and reflection.
 * Gemini is asked for JSON matching the schema, and the result is then parsed
 * and validated with Zod. Constrained decoding is not trusted on its own.
 */
export async function generateObject({
  system,
  messages,
  schema,
  maxTokens = 2000,
  temperature = 0.4,
  model = config.ai.model,
}) {
  if (!schema) throw new AiError('bad_output', 'generateObject was called without a schema.');
  const { $schema, ...jsonSchema } = z.toJSONSchema(schema);

  let text;
  try {
    const response = await getClient().models.generateContent({
      model,
      contents: toContents(messages),
      config: {
        systemInstruction: system,
        maxOutputTokens: maxTokens,
        temperature,
        responseMimeType: 'application/json',
        responseJsonSchema: jsonSchema,
        safetySettings: SAFETY_SETTINGS,
      },
    });
    text = readResponse(response);
  } catch (error) {
    throw wrap(error);
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new AiError('bad_output', 'The model returned output that was not valid JSON.');
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new AiError(
      'bad_output',
      `The model returned output that did not match the schema: ${result.error.issues
        .map((issue) => `${issue.path.join('.')} ${issue.message}`)
        .join('; ')}`,
    );
  }
  return result.data;
}
