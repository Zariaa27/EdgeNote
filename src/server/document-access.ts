import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { documentShares, documents, users } from "../db/schema";
import { getSessionUserId } from "./auth";

export type DocumentAccessRole = "owner" | "editor" | "viewer";

interface AccessBindings {
  DB: D1Database;
  AUTH_SECRET: string;
}

export async function resolveDocumentAccess(
  request: Request,
  documentId: string,
  env: AccessBindings,
) {
  const db = drizzle(env.DB);
  const [document] = await db
    .select()
    .from(documents)
    .where(eq(documents.id, documentId))
    .limit(1);
  if (!document) return { db, document: null, role: null, userId: null };

  const userId = await getSessionUserId(request, env.AUTH_SECRET);
  if (userId === document.authorId) {
    return { db, document, role: "owner" as const, userId };
  }

  if (userId) {
    const [user] = await db
      .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (user?.emailVerifiedAt) {
      const [share] = await db
        .select({ role: documentShares.role })
        .from(documentShares)
        .where(and(
          eq(documentShares.documentId, documentId),
          eq(documentShares.email, user.email.toLowerCase()),
        ))
        .limit(1);
      if (share) return { db, document, role: share.role, userId };
    }
  }

  if (document.isPublic) return { db, document, role: "viewer" as const, userId };
  return { db, document: null, role: null, userId };
}
