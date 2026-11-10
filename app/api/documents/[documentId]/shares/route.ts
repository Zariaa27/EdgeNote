import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, asc, eq } from "drizzle-orm";
import { documentShares, users } from "../../../../../src/db/schema";
import { assertAccountEmailConfigured, sendAccountEmail, type AccountEmailBindings } from "../../../../../src/server/account-email";
import { resolveDocumentAccess } from "../../../../../src/server/document-access";

interface ShareBindings extends AccountEmailBindings {
  DB: D1Database;
  AUTH_SECRET: string;
}

interface RouteContext {
  params: Promise<{ documentId: string }>;
}

type DocumentAccess = Awaited<ReturnType<typeof resolveDocumentAccess>>;
type OwnerDocumentResult =
  | { kind: "ok"; db: DocumentAccess["db"]; document: NonNullable<DocumentAccess["document"]> }
  | { kind: "error"; response: Response };

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function getOwnerDocument(request: Request, documentId: string, env: ShareBindings): Promise<OwnerDocumentResult> {
  const access = await resolveDocumentAccess(request, documentId, env);
  if (!access.document) return { kind: "error", response: Response.json({ error: "Document not found." }, { status: 404 }) };
  if (access.role !== "owner") {
    return { kind: "error", response: Response.json({ error: "Only the document owner can manage sharing." }, { status: 403 }) };
  }
  return { kind: "ok", db: access.db, document: access.document };
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const { documentId } = await context.params;
  const env = getCloudflareContext().env as unknown as ShareBindings;
  try {
    const result = await getOwnerDocument(request, documentId, env);
    if (result.kind === "error") return result.response;
    const shares = await result.db
      .select({ id: documentShares.id, email: documentShares.email, role: documentShares.role, createdAt: documentShares.createdAt })
      .from(documentShares)
      .where(eq(documentShares.documentId, documentId))
      .orderBy(asc(documentShares.email));
    return Response.json({ isPublic: result.document.isPublic, shares }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to list document shares.", error);
    return Response.json({ error: "Unable to load sharing settings." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const { documentId } = await context.params;
  const env = getCloudflareContext().env as unknown as ShareBindings;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Send a JSON object." }, { status: 400 });
  const input = body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const role = input.role;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (role !== "viewer" && role !== "editor") {
    return Response.json({ error: "Role must be viewer or editor." }, { status: 400 });
  }

  try {
    const result = await getOwnerDocument(request, documentId, env);
    if (result.kind === "error") return result.response;
    const [owner] = await result.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, result.document.authorId))
      .limit(1);
    if (owner?.email.toLowerCase() === email) {
      return Response.json({ error: "You already have owner access." }, { status: 400 });
    }

    const [existingUser] = await result.db
      .select({ id: users.id, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    await result.db
      .insert(documentShares)
      .values({ documentId, email, role })
      .onConflictDoUpdate({
        target: [documentShares.documentId, documentShares.email],
        set: { role },
      });
    const [share] = await result.db
      .select({ id: documentShares.id })
      .from(documentShares)
      .where(and(eq(documentShares.documentId, documentId), eq(documentShares.email, email)))
      .limit(1);
    if (!share) throw new Error("The document permission was not returned after saving.");

    let invitationError: string | null = null;
    let invitationSent = false;
    if (!existingUser?.emailVerifiedAt) {
      try {
        assertAccountEmailConfigured(env);
        const inviteUrl = new URL(existingUser ? "/verify-email" : "/register", env.APP_URL);
        inviteUrl.searchParams.set("next", `/documents/${encodeURIComponent(documentId)}`);
        await sendAccountEmail(env, {
          to: email,
          subject: "You have been invited to an EdgeNote document",
          actionUrl: inviteUrl.toString(),
          actionLabel: existingUser ? "Verify your account" : "Create your account",
          explanation: existingUser
            ? "Verify your EdgeNote account email to access the private document shared with you."
            : "Create and verify an EdgeNote account using this email address to access the private document shared with you.",
        });
        invitationSent = true;
      } catch (error) {
        invitationError = error instanceof Error ? error.message : "Email invitation could not be sent.";
      }
    }

    if (invitationError) {
      return Response.json({
        error: `Permission saved for ${email}, but the invitation email failed: ${invitationError}`,
        permissionSaved: true,
        id: share.id,
        email,
        role,
      }, { status: 502 });
    }
    return Response.json({ ok: true, id: share.id, email, role, invitationSent }, { status: 201 });
  } catch (error) {
    console.error("Unable to save document share.", error);
    return Response.json({ error: "Unable to save this document permission." }, { status: 500 });
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const { documentId } = await context.params;
  const env = getCloudflareContext().env as unknown as ShareBindings;
  const shareId = new URL(request.url).searchParams.get("shareId");

  try {
    if (!shareId) {
      const access = await resolveDocumentAccess(request, documentId, env);
      if (!access.document || !access.userId || access.role === "owner") {
        return Response.json({ error: "Shared document access not found." }, { status: 404 });
      }
      const [user] = await access.db
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, access.userId))
        .limit(1);
      if (!user) return Response.json({ error: "Account not found." }, { status: 404 });
      const [deleted] = await access.db
        .delete(documentShares)
        .where(and(eq(documentShares.documentId, documentId), eq(documentShares.email, user.email.toLowerCase())))
        .returning({ id: documentShares.id });
      if (!deleted) return Response.json({ error: "Shared document access not found." }, { status: 404 });
      return Response.json({ ok: true, removed: true });
    }

    const result = await getOwnerDocument(request, documentId, env);
    if (result.kind === "error") return result.response;
    const [deleted] = await result.db
      .delete(documentShares)
      .where(and(eq(documentShares.id, shareId), eq(documentShares.documentId, documentId)))
      .returning({ id: documentShares.id });
    if (!deleted) return Response.json({ error: "Share not found." }, { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Unable to remove document share.", error);
    return Response.json({ error: "Unable to remove this permission." }, { status: 500 });
  }
}
