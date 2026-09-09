import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import { Npc } from '../src/models/Npc.js';
import { Conversation } from '../src/models/Conversation.js';
import { Memory } from '../src/models/Memory.js';

const KEVIN = {
  name: 'Kevin Cross',
  age: 32,
  occupation: 'Detective',
  setting: 'A rain-worn port city, present day. Organized crime runs the docks.',
  personality: ['Suspicious', 'Sarcastic', 'Intelligent', 'Reserved'],
  background:
    'Kevin has spent eight years investigating organized crime. His younger brother disappeared three years ago and the case was never solved.',
  motivations: 'Find out what happened to his brother.',
  goals: 'Identify who is responsible for his brother’s disappearance.',
  fears: 'Being manipulated by someone he trusts.',
  values: 'Results over procedure. Loyalty, but only once it has been earned.',
  speechStyle:
    'Short sentences. Dry humour. Rarely answers personal questions directly. Answers a question with a question when pressed.',
  secrets: [{ content: 'Kevin destroyed evidence connected to his brother’s disappearance.' }],
  relationship: { trust: 50, friendship: 20, suspicion: 20, fear: 0 },
  emotionalState: { label: 'Neutral', intensity: 20, reason: '' },
};

await connectDb();

const existing = await Npc.findOne({ name: KEVIN.name });
if (existing) {
  await Promise.all([
    Conversation.deleteMany({ npcId: existing._id }),
    Memory.deleteMany({ npcId: existing._id }),
  ]);
  await existing.deleteOne();
  console.log('[seed] removed previous Kevin Cross and his history');
}

const npc = await Npc.create(KEVIN);
console.log(`[seed] created ${npc.name} (${npc._id})`);
await mongoose.disconnect();
