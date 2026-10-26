import { relations, sql } from "drizzle-orm";
import {
  integer,
  index,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

const currentTime = sql`(unixepoch() * 1000)`;

export const users = sqliteTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerifiedAt: integer("email_verified_at", { mode: "timestamp_ms" }),
  termsAcceptedAt: integer("terms_accepted_at", { mode: "timestamp_ms" }),
  termsVersion: text("terms_version"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(currentTime),
});

export const accountTokens = sqliteTable(
  "account_tokens",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    purpose: text("purpose").notNull(),
    targetEmail: text("target_email"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(currentTime),
  },
  (table) => ({
    userPurposeIdx: index("account_tokens_user_purpose_idx").on(table.userId, table.purpose),
  }),
);

export const documents = sqliteTable("documents", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  content: text("content").notNull(),
  authorId: text("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  parentFolderId: text("parent_folder_id").references(
    (): AnySQLiteColumn => documents.id,
    { onDelete: "set null" },
  ),
  isPublic: integer("is_public", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(currentTime),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(currentTime),
});

export const documentShares = sqliteTable(
  "document_shares",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ["viewer", "editor"] }).notNull().default("viewer"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(currentTime),
  },
  (table) => ({
    documentEmailUnique: uniqueIndex("document_shares_document_email_unique").on(table.documentId, table.email),
    emailIdx: index("document_shares_email_idx").on(table.email),
  }),
);

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
});

export const documentTags = sqliteTable(
  "document_tags",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.documentId, table.tagId] }),
  }),
);

export const attachments = sqliteTable("attachments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  r2Key: text("r2_key").notNull(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  mimeType: text("mime_type").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .default(currentTime),
});

export const usersRelations = relations(users, ({ many }) => ({
  documents: many(documents),
  accountTokens: many(accountTokens),
}));

export const accountTokensRelations = relations(accountTokens, ({ one }) => ({
  user: one(users, {
    fields: [accountTokens.userId],
    references: [users.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  author: one(users, {
    fields: [documents.authorId],
    references: [users.id],
  }),
  parentFolder: one(documents, {
    fields: [documents.parentFolderId],
    references: [documents.id],
    relationName: "documentHierarchy",
  }),
  childDocuments: many(documents, { relationName: "documentHierarchy" }),
  tags: many(documentTags),
  attachments: many(attachments),
  shares: many(documentShares),
}));

export const documentSharesRelations = relations(documentShares, ({ one }) => ({
  document: one(documents, {
    fields: [documentShares.documentId],
    references: [documents.id],
  }),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  documents: many(documentTags),
}));

export const documentTagsRelations = relations(documentTags, ({ one }) => ({
  document: one(documents, {
    fields: [documentTags.documentId],
    references: [documents.id],
  }),
  tag: one(tags, {
    fields: [documentTags.tagId],
    references: [tags.id],
  }),
}));

export const attachmentsRelations = relations(attachments, ({ one }) => ({
  document: one(documents, {
    fields: [attachments.documentId],
    references: [documents.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type AccountToken = typeof accountTokens.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type DocumentShare = typeof documentShares.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type DocumentTag = typeof documentTags.$inferSelect;
export type NewDocumentTag = typeof documentTags.$inferInsert;
export type Attachment = typeof attachments.$inferSelect;
export type NewAttachment = typeof attachments.$inferInsert;