import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

/**
 * Every collection keeps a *string* _id rather than an ObjectId. The shop-floor
 * tablets work offline and generate their own row ids before they ever reach
 * the server, and fixed machine ids ("CRK", "AC_A") are baked into the UI - so
 * the sync endpoints must be able to upsert on an id the client chose.
 */
export const idField = { type: String, default: () => randomUUID() };

export const newId = randomUUID;

const options = {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  versionKey: false,
  id: false,
};

/**
 * Declares a model with the project-wide conventions applied:
 * string _id, snake_case timestamps, and an explicit collection name that
 * matches the TABLES map in config/constants.js.
 */
export function defineModel(name, collection, definition, configure) {
  if (mongoose.models[name]) return mongoose.models[name];
  const schema = new mongoose.Schema({ _id: idField, ...definition }, { ...options, collection });
  configure?.(schema);
  return mongoose.model(name, schema);
}

export default defineModel;
