import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle } from "drizzle-orm/d1";
import { attachments } from "../../../src/db/schema";
import { getSessionUserId, isStrongSecret } from "../../../src/server/auth";
import { resolveDocumentAccess } from "../../../src/server/document-access";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const PRESIGNED_URL_TTL_SECONDS = 5 * 60;
const ALLOWED_MIME_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

interface UploadBindings {
  DB: D1Database;
  AUTH_SECRET?: string;
  STORAGE: {
    put(
      key: string,
      value: ArrayBuffer,
      options: {
        httpMetadata: { contentType: string };
        customMetadata: { documentId: string; fileName: string };
      },
    ): Promise<unknown>;
    delete(key: string): Promise<void>;
  };
  UPLOAD_SIGNING_SECRET?: string;
}

interface UploadClaims {
  userId: string;
  documentId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  key: string;
  expiresAt: number;
}

function getBindings(): UploadBindings {
  return getCloudflareContext().env as unknown as UploadBindings;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function importSigningKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usage,
  );
}

async function signClaims(claims: UploadClaims, secret: string): Promise<string> {
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(claims)));
  const key = await importSigningKey(secret, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return `${payload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function verifyClaims(token: string, secret: string): Promise<UploadClaims | null> {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;

  try {
    const key = await importSigningKey(secret, ["verify"]);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;

    const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as UploadClaims;
    if (
      typeof claims.userId !== "string" ||
      typeof claims.documentId !== "string" ||
      typeof claims.fileName !== "string" ||
      typeof claims.fileSize !== "number" ||
      typeof claims.mimeType !== "string" ||
      typeof claims.key !== "string" ||
      typeof claims.expiresAt !== "number" ||
      claims.expiresAt <= Date.now() ||
      claims.fileSize <= 0 ||
      claims.fileSize > MAX_FILE_SIZE ||
      !ALLOWED_MIME_TYPES.has(claims.mimeType)
    ) {
      return null;
    }

    return claims;
  } catch {
    return null;
  }
}

async function canEditDocument(request: Request, bindings: UploadBindings, documentId: string, userId: string): Promise<boolean> {
  const access = await resolveDocumentAccess(request, documentId, {
    DB: bindings.DB,
    AUTH_SECRET: bindings.AUTH_SECRET ?? "",
  });
  return access.userId === userId && (access.role === "owner" || access.role === "editor");
}

async function saveUpload(
  bindings: UploadBindings,
  details: Omit<UploadClaims, "expiresAt">,
  content: ArrayBuffer,
): Promise<{ attachmentId: string; mediaKey: string }> {
  await bindings.STORAGE.put(details.key, content, {
    httpMetadata: { contentType: details.mimeType },
    customMetadata: {
      documentId: details.documentId,
      fileName: details.fileName,
    },
  });

  try {
    const db = drizzle(bindings.DB);
    const [attachment] = await db
      .insert(attachments)
      .values({
        documentId: details.documentId,
        r2Key: details.key,
        fileName: details.fileName,
        fileSize: details.fileSize,
        mimeType: details.mimeType,
      })
      .returning({ id: attachments.id });

    return { attachmentId: attachment.id, mediaKey: details.key };
  } catch (error) {
    await bindings.STORAGE.delete(details.key).catch(() => undefined);
    throw error;
  }
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function hasImageSignature(content: ArrayBuffer, mimeType: string): boolean {
  const bytes = new Uint8Array(content);
  const text = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));

  switch (mimeType) {
    case "image/avif":
      return text(4, 4) === "ftyp" && ["avif", "avis"].includes(text(8, 4));
    case "image/gif":
      return ["GIF87a", "GIF89a"].includes(text(0, 6));
    case "image/jpeg":
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "image/png":
      return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
        (byte, index) => bytes[index] === byte,
      );
    case "image/webp":
      return text(0, 4) === "RIFF" && text(8, 4) === "WEBP";
    default:
      return false;
  }
}

/**
 * POST accepts multipart/form-data (`documentId`, `file`) for an immediate
 * upload, or JSON (`mode: "presign"`, `documentId`, `fileName`, `fileSize`,
 * `mimeType`) to request a short-lived signed URL for a subsequent PUT.
 * Success returns an attachment ID and media key, or a PUT URL plus expiry.
 */
export async function POST(request: Request): Promise<Response> {
  const bindings = getBindings();
  const userId = await getSessionUserId(request, bindings.AUTH_SECRET ?? "");
  if (!userId) return jsonError("Sign in required.", 401);
  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const contentLength = Number(request.headers.get("content-length") ?? 0);
      if (contentLength > MAX_FILE_SIZE + 128 * 1024) {
        return jsonError("Upload exceeds the 10 MiB file limit.", 413);
      }

      const form = await request.formData();
      const documentId = form.get("documentId");
      const file = form.get("file");
      if (typeof documentId !== "string" || !documentId.trim() || !(file instanceof File)) {
        return jsonError("A documentId and image file are required.", 400);
      }

      if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
        return jsonError("Upload must be between 1 byte and 10 MiB.", 413);
      }
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return jsonError("Unsupported image MIME type.", 415);
      }
      if (!(await canEditDocument(request, bindings, documentId, userId))) {
        return jsonError("Document not found.", 404);
      }

      const content = await file.arrayBuffer();
      if (!hasImageSignature(content, file.type)) {
        return jsonError("File bytes do not match the declared image MIME type.", 415);
      }

      const result = await saveUpload(
        bindings,
        {
          userId,
          documentId,
          fileName: file.name.slice(0, 255),
          fileSize: file.size,
          mimeType: file.type,
          key: `attachments/${crypto.randomUUID()}`,
        },
        content,
      );
      return Response.json(result, { status: 201 });
    }

    if (!contentType.includes("application/json")) {
      return jsonError("Use multipart/form-data or application/json.", 415);
    }

    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("mode" in body) || body.mode !== "presign") {
      return jsonError("JSON upload requests must use mode 'presign'.", 400);
    }

    const input = body as Partial<UploadClaims>;
    if (
      typeof input.documentId !== "string" ||
      !input.documentId.trim() ||
      typeof input.fileName !== "string" ||
      !input.fileName.trim() ||
      typeof input.fileSize !== "number" ||
      !Number.isInteger(input.fileSize) ||
      input.fileSize <= 0 ||
      input.fileSize > MAX_FILE_SIZE ||
      typeof input.mimeType !== "string" ||
      !ALLOWED_MIME_TYPES.has(input.mimeType)
    ) {
      return jsonError("Valid documentId, fileName, fileSize, and supported mimeType are required.", 400);
    }
    if (!isStrongSecret(bindings.UPLOAD_SIGNING_SECRET)) {
      return jsonError("Signed uploads are not configured with a strong secret.", 503);
    }
    if (!(await canEditDocument(request, bindings, input.documentId, userId))) {
      return jsonError("Document not found.", 404);
    }

    const claims: UploadClaims = {
      userId,
      documentId: input.documentId,
      fileName: input.fileName.slice(0, 255),
      fileSize: input.fileSize,
      mimeType: input.mimeType,
      key: `attachments/${crypto.randomUUID()}`,
      expiresAt: Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000,
    };
    const token = await signClaims(claims, bindings.UPLOAD_SIGNING_SECRET);
    const uploadUrl = new URL(request.url);
    uploadUrl.searchParams.set("token", token);

    return Response.json({
      uploadUrl: uploadUrl.toString(),
      expiresAt: new Date(claims.expiresAt).toISOString(),
      mediaKey: claims.key,
    });
  } catch {
    return jsonError("Unable to process upload request.", 500);
  }
}

/** Accepts a short-lived signed upload created by POST mode `presign`. */
export async function PUT(request: Request): Promise<Response> {
  const bindings = getBindings();
  const secret = bindings.UPLOAD_SIGNING_SECRET;
  const token = new URL(request.url).searchParams.get("token");
  if (!isStrongSecret(secret) || !token) return jsonError("A valid upload token is required.", 401);

  const claims = await verifyClaims(token, secret);
  if (!claims) return jsonError("Upload token is invalid or expired.", 401);
  const userId = await getSessionUserId(request, bindings.AUTH_SECRET ?? "");
  if (!userId || userId !== claims.userId) return jsonError("Upload token does not belong to this session.", 401);

  const requestMimeType = request.headers.get("content-type")?.split(";")[0].trim();
  if (requestMimeType !== claims.mimeType) {
    return jsonError("Content-Type does not match the signed upload request.", 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_FILE_SIZE) {
    return jsonError("Upload exceeds the 10 MiB file limit.", 413);
  }

  try {
    const content = await request.arrayBuffer();
    if (content.byteLength !== claims.fileSize) {
      return jsonError("Uploaded file size does not match the signed request.", 400);
    }
    if (!hasImageSignature(content, claims.mimeType)) {
      return jsonError("File bytes do not match the signed image MIME type.", 415);
    }
    if (!(await canEditDocument(request, bindings, claims.documentId, claims.userId))) {
      return jsonError("Document not found.", 404);
    }

    const result = await saveUpload(bindings, claims, content);
    return Response.json(result, { status: 201 });
  } catch {
    return jsonError("Unable to save uploaded file.", 500);
  }
}