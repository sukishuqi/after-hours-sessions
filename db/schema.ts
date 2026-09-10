import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  value: text('value').notNull(),
});
export const songs = sqliteTable('songs', {
  preferredKey: text('preferred_key').notNull().default(''),
  versionUrl: text('version_url').notNull().default(''),
  nominationNote: text('nomination_note').notNull().default(''),
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  artist: text('artist').notNull(),
  normal: text('normal').notNull().unique(),
  roles: text('roles').notNull(),
  final: integer('final').notNull().default(0),
});
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  config: text('config').notNull(),
  usePublicLibrary: integer('use_public_library').notNull().default(1),
  created: text('created').notNull(),
});
export const sessionSongs = sqliteTable('session_songs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  songId: text('song_id').notNull(),
  final: integer('final').notNull().default(0),
});
export const people = sqliteTable('people', {
  sessionId: text('session_id').notNull().default('session-001'),
  slots: text('slots').notNull().default('[]'),
  contactKey: text('contact_key').unique(),
  passwordHash: text('password_hash'),
  participation: text('participation').notNull().default('performer'),
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  name: text('name').notNull(),
  contact: text('contact').notNull(),
  availability: text('availability').notNull(),
  selections: text('selections').notNull(),
  note: text('note').notNull().default(''),
  status: text('status').notNull().default('intent'),
  assignment: text('assignment').notNull().default(''),
  receipt: text('receipt'),
  paymentMethod: text('payment_method'),
  reviewNote: text('review_note').notNull().default(''),
  created: text('created').notNull(),
});
export const accessAttempts = sqliteTable('access_attempts', {
  id: text('id').primaryKey(),
  attempts: integer('attempts').notNull(),
  expires: integer('expires').notNull(),
});
