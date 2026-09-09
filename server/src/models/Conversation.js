import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['user', 'npc'], required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const conversationSchema = new mongoose.Schema(
  {
    npcId: { type: mongoose.Schema.Types.ObjectId, ref: 'Npc', required: true, index: true },
    title: { type: String, default: 'New conversation' },
    messages: { type: [messageSchema], default: [] },
    // Rolling summary of everything older than the recent window, so the
    // prompt never has to carry the whole transcript.
    summary: { type: String, default: '' },
    summarisedUpTo: { type: Number, default: 0 },
  },
  { timestamps: true },
);

export const Conversation = mongoose.model('Conversation', conversationSchema);
