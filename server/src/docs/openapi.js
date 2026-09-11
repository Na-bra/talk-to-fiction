import { EMOTIONS, SUGGESTED_TRAITS } from '../constants.js';
import { config } from '../config/env.js';

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema, example) => ({
  content: { 'application/json': example ? { schema, example } : { schema } },
});

const idParam = {
  name: 'id',
  in: 'path',
  required: true,
  description: 'Character id (UUID). Run GET /npcs first and copy one from the response.',
  schema: { type: 'string', format: 'uuid', example: '3f6c1e2a-8b4d-4c1e-9a7f-2d5b8e0c4a19' },
};

const errors = {
  400: json(ref('Error')),
  404: json(ref('Error')),
  422: { description: 'The model refused or was blocked by safety filters.', ...json(ref('Error')) },
  502: { description: 'The model provider failed.', ...json(ref('Error')) },
  503: { description: 'No AI_API_KEY configured.', ...json(ref('Error')) },
};

const aiErrors = { 422: errors[422], 502: errors[502], 503: errors[503] };

export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'AI NPC Generator API',
    version: '1.0.0',
    description: [
      'Create fictional characters with a personality, private secrets and a persistent memory,',
      'then talk to them.',
      '',
      'Every account has its own characters, conversations and memories. Every route except',
      '`/health`, `/options` and `/auth/token` needs a signed-in user.',
      '',
      '**To try it here:**',
      '',
      '1. Create an account in the web client.',
      '2. `POST /auth/token` with that email and password, and copy `accessToken`.',
      '3. Click **Authorize** above and paste it.',
      '4. `POST /npcs/sample` to add Kevin Cross, copy his `id`, then `POST /npcs/{id}/chat`.',
      '',
      'Watch `relationship` and `emotionalState` move in each reply, and `GET /npcs/{id}/memories`',
      'to see what he chose to remember.',
      '',
      `Dialogue runs on \`${config.ai.model}\`; state tracking runs on \`${config.ai.fastModel}\`.`,
      'Routes marked **AI** cost money and take a few seconds.',
    ].join('\n'),
  },
  servers: [{ url: '/api', description: 'This server' }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'NPCs', description: 'Character CRUD and AI-assisted generation' },
    { name: 'Chat', description: 'Conversations with a character' },
    { name: 'State', description: 'Memory and test helpers' },
    { name: 'Auth', description: 'Tokens for testing, and who you are signed in as' },
    { name: 'Meta', description: 'Health and vocabulary' },
  ],

  paths: {
    '/auth/token': {
      post: {
        tags: ['Auth'],
        summary: 'Get an access token (for testing here)',
        security: [],
        description: [
          'Exchanges an email and password for an access token. The web client never calls this —',
          'it signs in with Supabase directly. It exists so you can test from this page: copy',
          '`accessToken` from the response, click **Authorize**, and paste it.',
          '',
          'Tokens usually last an hour; call this again for a fresh one.',
        ].join('\n'),
        requestBody: {
          required: true,
          ...json(
            {
              type: 'object',
              required: ['email', 'password'],
              properties: {
                email: { type: 'string', format: 'email' },
                password: { type: 'string', format: 'password' },
              },
            },
            { email: 'you@example.com', password: 'your-password' },
          ),
        },
        responses: {
          200: json({
            type: 'object',
            properties: {
              accessToken: { type: 'string' },
              expiresAt: { type: 'integer', description: 'Unix seconds.' },
              user: ref('User'),
            },
          }),
          400: errors[400],
          401: { description: 'Wrong email or password.', ...json(ref('Error')) },
        },
      },
    },

    '/me': {
      get: {
        tags: ['Auth'],
        summary: 'Who this token belongs to',
        responses: { 200: json(ref('User')) },
      },
    },

    '/health': {
      get: {
        tags: ['Meta'],
        summary: 'Service health',
        security: [],
        description: 'Also reports whether an AI key is configured — check this first if AI routes return 503.',
        responses: {
          200: json({
            type: 'object',
            properties: { ok: { type: 'boolean' }, aiConfigured: { type: 'boolean' } },
            example: { ok: true, aiConfigured: true, authConfigured: true },
          }),
        },
      },
    },

    '/options': {
      get: {
        tags: ['Meta'],
        summary: 'Suggested traits and the emotion vocabulary',
        security: [],
        description: 'The emotion list is enforced server-side — the model cannot invent new labels.',
        responses: {
          200: json({
            type: 'object',
            properties: {
              emotions: { type: 'array', items: { type: 'string' } },
              traits: { type: 'array', items: { type: 'string' } },
            },
            example: { emotions: EMOTIONS, traits: SUGGESTED_TRAITS },
          }),
        },
      },
    },

    '/npcs': {
      get: {
        tags: ['NPCs'],
        summary: 'List all characters',
        responses: { 200: json({ type: 'array', items: ref('Npc') }) },
      },
      post: {
        tags: ['NPCs'],
        summary: 'Create a character',
        description: 'Only `name` is required. Anything omitted stays empty — use `/npcs/generate` to fill it in.',
        requestBody: { required: true, ...json(ref('NpcInput')) },
        responses: { 201: json(ref('Npc')), 400: errors[400] },
      },
    },

    '/npcs/sample': {
      post: {
        tags: ['NPCs'],
        summary: 'Add the Kevin Cross sample character',
        description: [
          'Adds a copy of Kevin Cross — the detective the behaviour tests are written against — to',
          'your registry. Each call makes an independent copy with its own state and memories.',
        ].join('\n'),
        responses: { 201: json(ref('Npc')) },
      },
    },

    '/npcs/generate': {
      post: {
        tags: ['NPCs'],
        summary: 'Draft a character from partial details (**AI**)',
        description: [
          'Completes whatever you leave out and returns a draft. **Nothing is saved** — POST the',
          'result to `/npcs` if you want to keep it.',
          '',
          'Deliberately has no `{id}`: the creator form uses this *before* the character exists.',
          'Send `{}` for a character invented from scratch.',
        ].join('\n'),
        requestBody: json(ref('NpcInput'), {
          name: 'Mara Vance',
          occupation: 'Ship mechanic',
          setting: 'A failing orbital station',
        }),
        responses: { 200: json(ref('CharacterDraft')), ...aiErrors },
      },
    },

    '/npcs/{id}': {
      get: {
        tags: ['NPCs'],
        summary: 'Read one character',
        parameters: [idParam],
        responses: { 200: json(ref('Npc')), 404: errors[404], 400: errors[400] },
      },
      put: {
        tags: ['NPCs'],
        summary: 'Update a character',
        description: 'Only the fields you send are changed. Secrets you resend keep their `knownByPlayer` flag.',
        parameters: [idParam],
        requestBody: { required: true, ...json(ref('NpcInput')) },
        responses: { 200: json(ref('Npc')), 404: errors[404], 400: errors[400] },
      },
      delete: {
        tags: ['NPCs'],
        summary: 'Delete a character',
        description: 'Also deletes their conversations and memories.',
        parameters: [idParam],
        responses: {
          200: json({ type: 'object', properties: { ok: { type: 'boolean' } }, example: { ok: true } }),
          404: errors[404],
        },
      },
    },

    '/npcs/{id}/chat': {
      post: {
        tags: ['Chat'],
        summary: 'Say something to a character (**AI**)',
        description: [
          'The main endpoint. Two model calls happen per request:',
          '',
          '1. an in-character reply, and',
          '2. a separate reflection pass that decides what to remember, how the relationship moved,',
          '   and what the character now feels.',
          '',
          'Omit `conversationId` to start a new conversation — the id comes back in the response.',
          'All state changes are validated server-side: deltas are capped at ±20 per turn and clamped',
          'to 0–100, and a secret only flips to revealed if the character genuinely disclosed it.',
        ].join('\n'),
        parameters: [idParam],
        requestBody: { required: true, ...json(ref('ChatRequest')) },
        responses: { 200: json(ref('ChatResponse')), 404: errors[404], 400: errors[400], ...aiErrors },
      },
    },

    '/npcs/{id}/conversations': {
      get: {
        tags: ['Chat'],
        summary: 'List a character’s conversations',
        parameters: [idParam],
        responses: { 200: json({ type: 'array', items: ref('ConversationSummary') }) },
      },
      post: {
        tags: ['Chat'],
        summary: 'Start an empty conversation',
        description: 'Optional — `/chat` without a `conversationId` creates one for you.',
        parameters: [idParam],
        responses: { 201: json(ref('Conversation')), 404: errors[404] },
      },
    },

    '/npcs/{id}/conversations/{conversationId}': {
      get: {
        tags: ['Chat'],
        summary: 'Read a full transcript',
        description: '`summary` holds older messages folded down once the transcript passes 20 messages.',
        parameters: [
          idParam,
          {
            name: 'conversationId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        responses: { 200: json(ref('Conversation')), 404: errors[404] },
      },
    },

    '/npcs/{id}/memories': {
      get: {
        tags: ['State'],
        summary: 'What the character has chosen to remember',
        description: [
          'Long-term memory, newest first. Only meaningful events are stored — a claim, a lie, a',
          'threat, a revelation — never ordinary small talk, and at most 2 per exchange.',
        ].join('\n'),
        parameters: [idParam],
        responses: { 200: json({ type: 'array', items: ref('Memory') }) },
      },
    },

    '/npcs/{id}/reset': {
      post: {
        tags: ['State'],
        summary: 'Reset all state (test helper)',
        description: [
          'Restores the default relationship and emotion, re-hides every secret, and deletes all',
          'memories and conversations. The character sheet itself is untouched.',
          '',
          'Use this between behaviour tests so each run starts from the same baseline.',
        ].join('\n'),
        parameters: [idParam],
        responses: { 200: json(ref('Npc')), 404: errors[404] },
      },
    },
  },

  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'A Supabase access token. Get one from POST /auth/token.',
      },
    },
    schemas: {
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
        },
      },

      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          code: {
            type: 'string',
            enum: ['missing_key', 'refused', 'bad_output', 'upstream', 'unauthenticated', 'missing_supabase', 'missing_schema', 'invalid_credentials'],
            description: 'Present on AI and auth failures.',
          },
        },
        example: { error: 'No AI_API_KEY configured.', code: 'missing_key' },
      },

      Relationship: {
        type: 'object',
        description: 'How the character regards the player. Every value is clamped to 0–100.',
        properties: {
          trust: { type: 'integer', minimum: 0, maximum: 100 },
          friendship: { type: 'integer', minimum: 0, maximum: 100 },
          suspicion: { type: 'integer', minimum: 0, maximum: 100 },
          fear: { type: 'integer', minimum: 0, maximum: 100 },
        },
        example: { trust: 30, friendship: 15, suspicion: 85, fear: 5 },
      },

      EmotionalState: {
        type: 'object',
        properties: {
          label: { type: 'string', enum: EMOTIONS },
          intensity: { type: 'integer', minimum: 0, maximum: 100 },
          reason: { type: 'string' },
        },
        example: { label: 'Suspicious', intensity: 85, reason: 'The player keeps circling the warehouse.' },
      },

      Secret: {
        type: 'object',
        description: 'Character knowledge. Never revealed just because the player asks.',
        properties: {
          id: { type: 'string', format: 'uuid' },
          content: { type: 'string' },
          knownByPlayer: { type: 'boolean' },
          revealedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },

      Npc: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string' },
          age: { type: 'integer' },
          occupation: { type: 'string' },
          setting: { type: 'string' },
          personality: { type: 'array', items: { type: 'string' } },
          background: { type: 'string' },
          motivations: { type: 'string' },
          goals: { type: 'string' },
          fears: { type: 'string' },
          values: { type: 'string' },
          speechStyle: { type: 'string' },
          secrets: { type: 'array', items: ref('Secret') },
          relationship: ref('Relationship'),
          emotionalState: ref('EmotionalState'),
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },

      NpcInput: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
          occupation: { type: 'string' },
          setting: { type: 'string' },
          personality: { type: 'array', items: { type: 'string' } },
          background: { type: 'string' },
          motivations: { type: 'string' },
          goals: { type: 'string' },
          fears: { type: 'string' },
          values: { type: 'string' },
          speechStyle: { type: 'string' },
          secrets: {
            type: 'array',
            items: { type: 'string' },
            description: 'Plain strings. Existing secrets keep their revealed flag.',
          },
        },
        example: {
          name: 'Kevin Cross',
          age: 32,
          occupation: 'Detective',
          setting: 'A rain-worn port city, present day.',
          personality: ['Suspicious', 'Sarcastic', 'Intelligent', 'Reserved'],
          background: 'Eight years investigating organized crime. His younger brother disappeared three years ago.',
          motivations: 'Find out what happened to his brother.',
          goals: 'Identify who is responsible for his brother’s disappearance.',
          fears: 'Being manipulated by someone he trusts.',
          values: 'Results over procedure. Loyalty, once earned.',
          speechStyle: 'Short sentences. Dry humour. Rarely answers personal questions directly.',
          secrets: ['Kevin destroyed evidence connected to his brother’s disappearance.'],
        },
      },

      CharacterDraft: {
        type: 'object',
        description: 'An unsaved draft. POST it to /npcs to keep it.',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
          occupation: { type: 'string' },
          setting: { type: 'string' },
          personality: { type: 'array', items: { type: 'string' } },
          background: { type: 'string' },
          motivations: { type: 'string' },
          goals: { type: 'string' },
          fears: { type: 'string' },
          values: { type: 'string' },
          speechStyle: { type: 'string' },
          secrets: { type: 'array', items: ref('Secret') },
        },
      },

      Message: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          role: { type: 'string', enum: ['user', 'npc'] },
          content: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      Conversation: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          npcId: { type: 'string' },
          title: { type: 'string' },
          messages: { type: 'array', items: ref('Message') },
          summary: { type: 'string', description: 'Older messages, folded down. Empty on short conversations.' },
          summarisedUpTo: { type: 'integer' },
        },
      },

      ConversationSummary: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          title: { type: 'string' },
          summary: { type: 'string' },
          messageCount: { type: 'integer' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },

      Memory: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          npcId: { type: 'string' },
          content: { type: 'string', description: 'The fact, in third person.' },
          npcInterpretation: { type: 'string', description: 'How the character read it.' },
          importance: { type: 'string', enum: ['low', 'medium', 'high'] },
          source: { type: 'string', enum: ['conversation', 'manual', 'seed'] },
          conversationId: { type: 'string', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
        example: {
          content: 'The player threatened to make Kevin’s brother’s file disappear.',
          npcInterpretation: 'They know how to hit where it hurts.',
          importance: 'high',
          source: 'conversation',
        },
      },

      ChatRequest: {
        type: 'object',
        required: ['message'],
        properties: {
          message: { type: 'string', description: 'What the player says.' },
          conversationId: {
            type: 'string',
            nullable: true,
            description: 'Omit to start a new conversation.',
          },
        },
        example: { message: 'Did you find anything at the warehouse?' },
      },

      ChatResponse: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
          reply: { type: 'string', description: 'What the character said.' },
          npc: {
            type: 'object',
            description: 'The character’s state after this exchange.',
            properties: {
              relationship: ref('Relationship'),
              emotionalState: ref('EmotionalState'),
              secrets: { type: 'array', items: ref('Secret') },
            },
          },
          changes: {
            type: 'object',
            nullable: true,
            description: 'What this exchange changed. Null if the reflection pass failed — the reply still stands.',
            properties: {
              relationshipChange: {
                type: 'object',
                description: 'Applied deltas, after capping and clamping.',
                example: { trust: -10, friendship: -5, suspicion: 15, fear: 5 },
              },
              emotionChanged: { type: 'boolean' },
              revealedSecrets: {
                type: 'array',
                items: { type: 'string' },
                description: 'Secrets the character actually gave away this turn.',
              },
            },
          },
          newMemories: { type: 'array', items: ref('Memory') },
        },
      },
    },
  },
};

// Every operation that needs a signed-in user can answer 401. Added once here
// rather than by hand on each route, so a new route cannot forget it.
for (const operations of Object.values(openapiSpec.paths)) {
  for (const operation of Object.values(operations)) {
    if (Array.isArray(operation.security) && operation.security.length === 0) continue;
    operation.responses[401] = { description: 'Missing, invalid or expired access token.', ...json(ref('Error')) };
  }
}
