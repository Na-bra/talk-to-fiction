/**
 * Lists the models the configured key can actually reach, so AI_MODEL and
 * AI_MODEL_FAST can be set from fact rather than from a guess.
 *
 *   npm run models
 */
import { GoogleGenAI } from '@google/genai';
import { config, hasAiKey } from '../src/config/env.js';

if (!hasAiKey()) {
  console.error('No AI_API_KEY in server/.env');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: config.ai.apiKey });
const names = [];
for await (const model of await ai.models.list()) {
  const id = (model.name || '').replace(/^models\//, '');
  if (model.supportedActions && !model.supportedActions.includes('generateContent')) continue;
  names.push(id);
}

names.sort();
console.log(`\n${names.length} models available for generateContent:\n`);
names.forEach((name) => {
  const mark = name === config.ai.model ? '  ← AI_MODEL' : name === config.ai.fastModel ? '  ← AI_MODEL_FAST' : '';
  console.log(`  ${name}${mark}`);
});

// Appearing in the catalogue does not mean the key may call it — retired models
// still list, then 404 on use. So actually call each configured model once.
console.log('\nProbing the configured models:\n');
let ok = true;
for (const [label, model] of [['AI_MODEL', config.ai.model], ['AI_MODEL_FAST', config.ai.fastModel]]) {
  try {
    await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
      config: { maxOutputTokens: 1 },
    });
    console.log(`  ✓ ${label.padEnd(13)} ${model}`);
  } catch (error) {
    ok = false;
    const detail = (error.message || '').replace(/\s+/g, ' ').slice(0, 160);
    console.log(`  ✗ ${label.padEnd(13)} ${model}\n      ${detail}`);
  }
}
console.log(ok ? '\n✓ Both models are callable.\n' : '\n⚠  Fix the failing model in server/.env.\n');
