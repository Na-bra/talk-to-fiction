import mongoose from 'mongoose';

const memorySchema = new mongoose.Schema(
  {
    npcId: { type: mongoose.Schema.Types.ObjectId, ref: 'Npc', required: true, index: true },
    content: { type: String, required: true },
    // How the NPC read the event, which is what keeps memory in character.
    npcInterpretation: { type: String, default: '' },
    importance: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    source: { type: String, enum: ['conversation', 'manual', 'seed'], default: 'conversation' },
    conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', default: null },
  },
  { timestamps: true },
);

export const Memory = mongoose.model('Memory', memorySchema);
