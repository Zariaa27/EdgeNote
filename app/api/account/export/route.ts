import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { attachments, documentShares, documents, users } from "../../../../src/db/schema";
import { getSessionUserId } from "../../../../src/server/auth";

interface ExportBindings {
  DB: D1Database;
  AUTH_SECRET: string;
  STORAGE: R2Bucket;
}

interface ExportAttachment {
  id: string;
  documentId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: Date;
  r2Key: string;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

export async function GET(request: Request): Promise<Response> {
  const env = getCloudflareContext().env as unknown as ExportBindings;
  const userId = await getSessionUserId(request, env.AUTH_SECRET);
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const db = drizzle(env.DB);
    const [user] = await db
      .select({ name: users.name, email: users.email, emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return Response.json({ error: "Account not found." }, { status: 404 });

    const ownedDocuments = await db
      .select({
        id: documents.id,
        title: documents.title,
        content: documents.content,
        parentFolderId: documents.parentFolderId,
        isPublic: documents.isPublic,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
      })
      .from(documents)
      .where(eq(documents.authorId, userId));
    const ownedAttachments = await db
      .select({
        id: attachments.id,
        documentId: attachments.documentId,
        fileName: attachments.fileName,
        fileSize: attachments.fileSize,
        mimeType: attachments.mimeType,
        createdAt: attachments.createdAt,
        r2Key: attachments.r2Key,
      })
      .from(attachments)
      .innerJoin(documents, eq(attachments.documentId, documents.id))
      .where(eq(documents.authorId, userId));
    const ownedShares = ownedDocuments.length
      ? await db
        .select({
          id: documentShares.id,
          documentId: documentShares.documentId,
          email: documentShares.email,
          role: documentShares.role,
          createdAt: documentShares.createdAt,
        })
        .from(documentShares)
        .where(inArray(documentShares.documentId, ownedDocuments.map((document) => document.id)))
      : [];
    const receivedShares = await db
      .select({
        documentId: documentShares.documentId,
        email: documentShares.email,
        role: documentShares.role,
        createdAt: documentShares.createdAt,
      })
      .from(documentShares)
      .where(eq(documentShares.email, user.email.toLowerCase()));

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        void (async () => {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode(JSON.stringify({
            exportedAt: new Date().toISOString(),
            account: user,
            documents: ownedDocuments,
            sharesGiven: ownedShares,
            sharesReceived: receivedShares,
          }).slice(0, -1) + ',"attachments":['));

          for (let index = 0; index < ownedAttachments.length; index += 1) {
            const attachment: ExportAttachment = ownedAttachments[index];
            const object = await env.STORAGE.get(attachment.r2Key);
            if (!object) throw new Error(`Attachment object ${attachment.id} is missing from storage.`);
            controller.enqueue(encoder.encode(
              `${index ? "," : ""}${JSON.stringify({
                id: attachment.id,
                documentId: attachment.documentId,
                fileName: attachment.fileName,
                fileSize: attachment.fileSize,
                mimeType: attachment.mimeType,
                createdAt: attachment.createdAt,
                contentBase64: encodeBase64(new Uint8Array(await object.arrayBuffer())),
              })}`,
            ));
          }

          controller.enqueue(encoder.encode("]}"));
          controller.close();
        })().catch((error: unknown) => {
          console.error("Account data export stream failed.", error);
          controller.error(new Error("Unable to complete account data export."));
        });
      },
    });

    return new Response(body, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="edgenote-data-${new Date().toISOString().slice(0, 10)}.json"`,
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    console.error("Account data export failed.", error);
    return Response.json({ error: "Unable to export account data." }, { status: 500 });
  }
}
