import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { attachments, documents } from "../../../../src/db/schema";
import { resolveDocumentAccess } from "../../../../src/server/document-access";

interface DocumentBindings {
  DB: D1Database;
  AUTH_SECRET: string;
  STORAGE: R2Bucket;
  VECTOR_INDEX: VectorizeIndex;
  DOCUMENT_SESSIONS: DurableObjectNamespace;
}

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { documentId } = await context.params;
  const env = getCloudflareContext().env as unknown as DocumentBindings;
  try {
    const { document, role } = await resolveDocumentAccess(request, documentId, env);
    if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
    return Response.json({ document, role }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to load document with sharing permissions.", error);
    return Response.json({ error: "Unable to load document." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const { documentId } = await context.params;
  const env = getCloudflareContext().env as unknown as DocumentBindings;
  let access: Awaited<ReturnType<typeof resolveDocumentAccess>>;
  try {
    access = await resolveDocumentAccess(request, documentId, env);
  } catch (error) {
    console.error("Unable to check document edit permissions.", error);
    return Response.json({ error: "Unable to check document permissions." }, { status: 500 });
  }
  if (!access.document) return Response.json({ error: "Document not found." }, { status: 404 });
  if (access.role !== "owner" && access.role !== "editor") {
    return Response.json({ error: "You have view-only access to this document." }, { status: 403 });
  }
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Send a JSON object." }, { status: 400 });

  const input = body as Record<string, unknown>;
  const values: { title?: string; content?: string; isPublic?: boolean; updatedAt: Date } = { updatedAt: new Date() };
  let hasUpdate = false;
  if (input.title !== undefined) {
    if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 160) {
      return Response.json({ error: "Title must be 1 to 160 characters." }, { status: 400 });
    }
    values.title = input.title.trim();
    hasUpdate = true;
  }
  if (input.content !== undefined) {
    if (typeof input.content !== "string") return Response.json({ error: "Content must be a string." }, { status: 400 });
    values.content = input.content;
    hasUpdate = true;
  }
  if (input.isPublic !== undefined) {
    if (typeof input.isPublic !== "boolean") return Response.json({ error: "isPublic must be a boolean." }, { status: 400 });
    if (access.role !== "owner") return Response.json({ error: "Only the document owner can change sharing." }, { status: 403 });
    values.isPublic = input.isPublic;
    hasUpdate = true;
  }
  if (!hasUpdate) return Response.json({ error: "No document fields supplied." }, { status: 400 });

  try {
    const [document] = await access.db
      .update(documents)
      .set(values)
      .where(eq(documents.id, documentId))
      .returning({ id: documents.id, title: documents.title, content: documents.content, updatedAt: documents.updatedAt });
    if (!document) return Response.json({ error: "Document not found." }, { status: 404 });
    return Response.json({ document });
  } catch (error) {
    console.error("Unable to update document.", error);
    return Response.json({ error: "Unable to update document." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const { documentId } = await context.params;
  const env = getCloudflareContext().env as unknown as DocumentBindings;
  try {
    const access = await resolveDocumentAccess(request, documentId, env);
    if (!access.document) return Response.json({ error: "Document not found." }, { status: 404 });
    if (access.role !== "owner") return Response.json({ error: "Only the document owner can delete it." }, { status: 403 });

    const documentAttachments = await access.db
      .select({ r2Key: attachments.r2Key })
      .from(attachments)
      .where(eq(attachments.documentId, documentId));
    const room = env.DOCUMENT_SESSIONS.get(env.DOCUMENT_SESSIONS.idFromName(documentId));
    const roomResponse = await room.fetch(
      new Request(`https://document-session.internal/?documentId=${encodeURIComponent(documentId)}`, { method: "DELETE" }),
    );
    if (!roomResponse.ok && roomResponse.status !== 404) {
      throw new Error(`Could not clear the collaboration room (${roomResponse.status}).`);
    }
    const vectorResult = await env.VECTOR_INDEX.deleteByIds([documentId]);
    if (!vectorResult) throw new Error("Could not remove the document search index.");
    await Promise.all(documentAttachments.map(({ r2Key }) => env.STORAGE.delete(r2Key)));

    const [deleted] = await access.db
      .delete(documents)
      .where(eq(documents.id, documentId))
      .returning({ id: documents.id });
    if (!deleted) return Response.json({ error: "Document not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Unable to delete document.", error);
    return Response.json({ error: "Unable to delete document." }, { status: 500 });
  }
}