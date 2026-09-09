import mongoose from 'mongoose';
import {
  EMOTIONS,
  DEFAULT_RELATIONSHIP,
  DEFAULT_EMOTION,
} from '../constants.js';

// A secret is character knowledge, not prompt context. `knownByPlayer` flips
// only when the NPC actually chooses to reveal it during a conversation.
const secretSchema = new mongoose.Schema(
  {
    content: { type: String, required: true, trim: true },
    knownByPlayer: { type: Boolean, default: false },
    revealedAt: { type: Date, default: null },
  },
  { _id: true },
);

const relationshipSchema = new mongoose.Schema(
  {
    trust: { type: Number, min: 0, max: 100, default: DEFAULT_RELATIONSHIP.trust },
    friendship: { type: Number, min: 0, max: 100, default: DEFAULT_RELATIONSHIP.friendship },
    suspicion: { type: Number, min: 0, max: 100, default: DEFAULT_RELATIONSHIP.suspicion },
    fear: { type: Number, min: 0, max: 100, default: DEFAULT_RELATIONSHIP.fear },
  },
  { _id: false },
);

const emotionalStateSchema = new mongoose.Schema(
  {
    label: { type: String, enum: EMOTIONS, default: DEFAULT_EMOTION.label },
    intensity: { type: Number, min: 0, max: 100, default: DEFAULT_EMOTION.intensity },
    reason: { type: String, default: '' },
  },
  { _id: false },
);

const npcSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    age: { type: Number, min: 0, max: 5000 },
    occupation: { type: String, trim: true, default: '' },
    setting: { type: String, trim: true, default: '' },

    personality: { type: [String], default: [] },
    background: { type: String, default: '' },
    goals: { type: String, default: '' },
    fears: { type: String, default: '' },
    motivations: { type: String, default: '' },
    values: { type: String, default: '' },
    speechStyle: { type: String, default: '' },
    secrets: { type: [secretSchema], default: [] },

    // Single implicit player (no auth in the MVP), so relationship and emotion
    // are embedded 1:1 rather than living in their own collection.
    relationship: { type: relationshipSchema, default: () => ({}) },
    emotionalState: { type: emotionalStateSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export const Npc = mongoose.model('Npc', npcSchema);
