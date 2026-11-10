import { getCloudflareContext } from "@opennextjs/cloudflare";
import { desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { documentShares, documents, users } from "../../../src/db/schema";
import { getSessionUserId } from "../../../src/server/auth";

interface DocumentBindings {
  DB: D1Database;
  AUTH_SECRET: string;
}

export async function GET(request: Request): Promise<Response> {
  const env = getCloudflareContext().env as unknown as DocumentBindings;
  const userId = await getSessionUserId(request, env.AUTH_SECRET);
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const db = drizzle(env.DB);
    const owned = await db
      .select({
        id: documents.id,
        title: documents.title,
        content: documents.content,
        isPublic: documents.isPublic,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(eq(documents.authorId, userId))
      .orderBy(desc(documents.updatedAt));
    const [user] = await db
      .select({ email: users.email, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const shared = user?.emailVerifiedAt
      ? await db
        .select({
          id: documents.id,
          title: documents.title,
          content: documents.content,
          isPublic: documents.isPublic,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
          role: documentShares.role,
        })
        .from(documentShares)
        .innerJoin(documents, eq(documents.id, documentShares.documentId))
        .where(eq(documentShares.email, user.email.toLowerCase()))
        .orderBy(desc(documents.updatedAt))
      : [];
    const rows = [
      ...owned.map((document) => ({ ...document, role: "owner" as const })),
      ...shared.filter((document) => document.role === "viewer" || document.role === "editor"),
    ].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    return Response.json({ documents: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to load workspace documents.", error);
    return Response.json({ error: "Unable to load documents." }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const env = getCloudflareContext().env as unknown as DocumentBindings;
  const userId = await getSessionUserId(request, env.AUTH_SECRET);
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Send a JSON object." }, { status: 400 });
  const input = body as Record<string, unknown>;
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const content = typeof input.content === "string" ? input.content : "";
  const isPublic = input.isPublic === true;
  if (input.isPublic !== undefined && typeof input.isPublic !== "boolean") {
    return Response.json({ error: "isPublic must be a boolean." }, { status: 400 });
  }
  if (!title || title.length > 160) return Response.json({ error: "Title must be 1 to 160 characters." }, { status: 400 });

  try {
    const db = drizzle(env.DB);
    const [document] = await db
      .insert(documents)
      .values({ title, content, authorId: userId, isPublic })
      .returning({ id: documents.id, title: documents.title, content: documents.content, isPublic: documents.isPublic });
    return Response.json({ document }, { status: 201 });
  } catch (error) {
    console.error("Unable to create document.", error);
    return Response.json({ error: "Unable to create document." }, { status: 500 });
  }
}