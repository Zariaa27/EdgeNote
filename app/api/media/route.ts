import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { attachments } from "../../../src/db/schema";
import { resolveDocumentAccess } from "../../../src/server/document-access";

interface MediaBindings {
  DB: D1Database;
  STORAGE: R2Bucket;
  AUTH_SECRET: string;
}

export async function GET(request: Request): Promise<Response> {
  const env = getCloudflareContext().env as unknown as MediaBindings;
  const key = new URL(request.url).searchParams.get("key");
  if (!key?.startsWith("attachments/")) return Response.json({ error: "Valid media key required." }, { status: 400 });

  try {
    const db = drizzle(env.DB);
    const [attachment] = await db
      .select({ id: attachments.id, documentId: attachments.documentId, r2Key: attachments.r2Key, mimeType: attachments.mimeType })
      .from(attachments)
      .where(eq(attachments.r2Key, key))
      .limit(1);
    if (!attachment) return Response.json({ error: "Media not found." }, { status: 404 });
    const access = await resolveDocumentAccess(request, attachment.documentId, env);
    if (!access.document) return Response.json({ error: "Media not found." }, { status: 404 });

    const object = await env.STORAGE.get(attachment.r2Key);
    if (!object) return Response.json({ error: "Media not found." }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Length": String(object.size),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Unable to load document media.", error);
    return Response.json({ error: "Unable to load media." }, { status: 500 });
  }
}