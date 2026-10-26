import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq, gt, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { accountTokens, users } from "../../../../../src/db/schema";
import { hashAccountToken } from "../../../../../src/server/account-email";
import { createSessionCookie } from "../../../../../src/server/auth";

interface VerificationBindings {
  DB: D1Database;
  AUTH_SECRET: string;
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const tokenValue = body && typeof body === "object" && "token" in body && typeof body.token === "string"
    ? body.token
    : "";
  if (!/^[a-f0-9]{64}$/.test(tokenValue)) {
    return Response.json({ error: "This verification link is invalid or expired." }, { status: 400 });
  }

  const env = getCloudflareContext().env as unknown as VerificationBindings;
  try {
    const db = drizzle(env.DB);
    const tokenHash = await hashAccountToken(tokenValue);
    const [record] = await db
      .select({
        id: accountTokens.id,
        userId: accountTokens.userId,
        targetEmail: accountTokens.targetEmail,
        purpose: accountTokens.purpose,
      })
      .from(accountTokens)
      .where(and(
        eq(accountTokens.tokenHash, tokenHash),
        gt(accountTokens.expiresAt, new Date()),
        inArray(accountTokens.purpose, ["verify-email", "change-email"]),
      ))
      .limit(1);
    if (!record) return Response.json({ error: "This verification link is invalid or expired." }, { status: 400 });

    if (record.purpose === "change-email") {
      if (!record.targetEmail) return Response.json({ error: "This verification link is invalid or expired." }, { status: 400 });
      const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, record.targetEmail)).limit(1);
      if (existing && existing.id !== record.userId) {
        return Response.json({ error: "That email address is already in use." }, { status: 409 });
      }
      const results = await env.DB.batch([
        env.DB.prepare(
          `UPDATE users SET email = ?, email_verified_at = ?
           WHERE id = ? AND EXISTS (
             SELECT 1 FROM account_tokens
             WHERE id = ? AND token_hash = ? AND purpose = 'change-email' AND expires_at > ?
           )`,
        ).bind(record.targetEmail, Date.now(), record.userId, record.id, tokenHash, Date.now()),
        env.DB.prepare("DELETE FROM account_tokens WHERE id = ?").bind(record.id),
        env.DB.prepare("DELETE FROM account_tokens WHERE user_id = ? AND purpose = 'change-email'").bind(record.userId),
      ]);
      if (results[0]?.meta.changes !== 1) {
        return Response.json({ error: "This verification link is invalid or expired." }, { status: 400 });
      }
    } else {
      const results = await env.DB.batch([
        env.DB.prepare(
          `UPDATE users SET email_verified_at = ?
           WHERE id = ? AND EXISTS (
             SELECT 1 FROM account_tokens
             WHERE id = ? AND token_hash = ? AND purpose = 'verify-email' AND expires_at > ?
           )`,
        ).bind(Date.now(), record.userId, record.id, tokenHash, Date.now()),
        env.DB.prepare("DELETE FROM account_tokens WHERE id = ?").bind(record.id),
      ]);
      if (results[0]?.meta.changes !== 1) {
        return Response.json({ error: "This verification link is invalid or expired." }, { status: 400 });
      }
    }

    const response = Response.json({ message: "Email address verified." });
    response.headers.append("Set-Cookie", await createSessionCookie(record.userId, env.AUTH_SECRET, request));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("Email verification failed.", error);
    return Response.json({ error: "Unable to verify this email address." }, { status: 500 });
  }
}
