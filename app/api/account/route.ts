import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { accountTokens, attachments, documentShares, documents, users } from "../../../src/db/schema";
import {
  createAccountToken,
  assertAccountEmailConfigured,
  getAccountActionUrl,
  sendAccountEmail,
  type AccountEmailBindings,
} from "../../../src/server/account-email";
import {
  clearSessionCookie,
  getSessionUserId,
  verifyPassword,
} from "../../../src/server/auth";

interface AccountBindings extends AccountEmailBindings {
  DB: D1Database;
  AUTH_SECRET: string;
  STORAGE: R2Bucket;
  VECTOR_INDEX: VectorizeIndex;
  DOCUMENT_SESSIONS: DurableObjectNamespace;
}

function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function GET(request: Request): Promise<Response> {
  const env = getCloudflareContext().env as unknown as AccountBindings;
  const userId = await getSessionUserId(request, env.AUTH_SECRET);
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const db = drizzle(env.DB);
    const [user] = await db
      .select({
        name: users.name,
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return Response.json({ error: "Account not found." }, { status: 404 });
    return Response.json({ user }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Unable to load account settings.", error);
    return Response.json({ error: "Unable to load account settings." }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const env = getCloudflareContext().env as unknown as AccountBindings & { AUTH_SECRET?: string };
  const userId = await getSessionUserId(request, env.AUTH_SECRET);
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Send a JSON object." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const currentPassword = typeof input.currentPassword === "string" ? input.currentPassword : "";
  if (!currentPassword) {
    return Response.json({ error: "Enter your current password to update account details." }, { status: 400 });
  }

  try {
    const db = drizzle(env.DB);
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      return Response.json({ error: "Current password is incorrect." }, { status: 403 });
    }

    if (typeof input.name === "string") {
      if (input.email !== undefined) {
        return Response.json({ error: "Update your name or email separately." }, { status: 400 });
      }
      const name = input.name.trim();
      if (!name || name.length > 80) {
        return Response.json({ error: "Name must be between 1 and 80 characters." }, { status: 400 });
      }
      await db.update(users).set({ name }).where(eq(users.id, userId));
      return Response.json({ message: "Name updated.", name }, { headers: { "Cache-Control": "no-store" } });
    }

    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return Response.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (email === user.email.toLowerCase()) {
      return Response.json({ message: "That is already your email address." });
    }

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing) return Response.json({ error: "That email address is already in use." }, { status: 409 });

    assertAccountEmailConfigured(env);
    const token = await createAccountToken(60 * 60 * 1000);
    await db.delete(accountTokens).where(
      and(eq(accountTokens.userId, userId), eq(accountTokens.purpose, "change-email")),
    );
    await db.insert(accountTokens).values({
      userId,
      tokenHash: token.tokenHash,
      purpose: "change-email",
      targetEmail: email,
      expiresAt: token.expiresAt,
    });
    try {
      await sendAccountEmail(env, {
        to: email,
        subject: "Confirm your new EdgeNote email",
        actionUrl: getAccountActionUrl(env, "/verify-email", token.rawToken),
        actionLabel: "Confirm email address",
        explanation: "Confirm this email address to finish changing the email on your EdgeNote account.",
      });
    } catch (error) {
      try {
        await db.delete(accountTokens).where(eq(accountTokens.tokenHash, token.tokenHash));
      } catch (cleanupError) {
        console.error("Unable to clean up an unsent email change token.", cleanupError);
      }
      throw error;
    }
    return Response.json({ message: "Check your new email address to confirm the change." });
  } catch (error) {
    console.error("Unable to update account settings.", error);
    const message = error instanceof Error ? error.message : "";
    return Response.json(
      { error: message.includes("email is not configured") || message.includes("provider") ? message : "Unable to update account settings." },
      { status: message.includes("email is not configured") || message.includes("provider") ? 503 : 500 },
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!sameOrigin(request)) return Response.json({ error: "Request origin is not allowed." }, { status: 403 });
  const env = getCloudflareContext().env as unknown as AccountBindings & { AUTH_SECRET?: string };
  const userId = await getSessionUserId(request, env.AUTH_SECRET ?? "");
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Send a JSON object." }, { status: 400 });
  const input = body as Record<string, unknown>;
  const password = typeof input.password === "string" ? input.password : "";
  if (input.confirmation !== "DELETE" || !password) {
    return Response.json({ error: "Enter your password and type DELETE to confirm." }, { status: 400 });
  }

  try {
    const db = drizzle(env.DB);
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return Response.json({ error: "Password is incorrect." }, { status: 403 });
    }

    const ownedDocuments = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.authorId, userId));
    const documentIds = ownedDocuments.map((document) => document.id);
    if (documentIds.length) {
      const roomResults = await Promise.all(documentIds.map(async (documentId) => {
        const room = env.DOCUMENT_SESSIONS.get(env.DOCUMENT_SESSIONS.idFromName(documentId));
        const response = await room.fetch(
          new Request(`https://document-session.internal/?documentId=${encodeURIComponent(documentId)}`, { method: "DELETE" }),
        );
        if (!response.ok && response.status !== 404) throw new Error(`Could not clear document room (${response.status}).`);
        return documentId;
      }));

      const vectors = await env.VECTOR_INDEX.deleteByIds(roomResults);
      if (!vectors) throw new Error("Could not remove account vectors.");
    }

    const rows = await db
      .select({ r2Key: attachments.r2Key })
      .from(attachments)
      .innerJoin(
        documents,
        eq(attachments.documentId, documents.id),
      )
      .where(eq(documents.authorId, userId));
    await Promise.all(rows.map((row) => env.STORAGE.delete(row.r2Key)));
    await db.delete(documentShares).where(eq(documentShares.email, user.email.toLowerCase()));
    await db.delete(users).where(eq(users.id, userId));

    const response = Response.json({ ok: true });
    response.headers.append("Set-Cookie", clearSessionCookie(request));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Account deletion failed.", error);
    return Response.json({ error: "Unable to fully delete the account and its stored data. Please retry or contact support." }, { status: 500 });
  }
}
