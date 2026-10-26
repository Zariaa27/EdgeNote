import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { accountTokens } from "../../../../../src/db/schema";
import { hashAccountToken } from "../../../../../src/server/account-email";
import { hashPassword } from "../../../../../src/server/auth";

interface PasswordResetBindings {
  DB: D1Database;
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Send a JSON object." }, { status: 400 });
  const input = body as Record<string, unknown>;
  const token = typeof input.token === "string" ? input.token : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return Response.json({ error: "This reset link is invalid or expired." }, { status: 400 });
  }
  if (password.length < 12 || password.length > 128) {
    return Response.json({ error: "Password must be between 12 and 128 characters." }, { status: 400 });
  }

  const env = getCloudflareContext().env as unknown as PasswordResetBindings;
  try {
    const db = drizzle(env.DB);
    const tokenHash = await hashAccountToken(token);
    const [record] = await db
      .select({ id: accountTokens.id, userId: accountTokens.userId })
      .from(accountTokens)
      .where(and(
        eq(accountTokens.tokenHash, tokenHash),
        eq(accountTokens.purpose, "reset-password"),
        gt(accountTokens.expiresAt, new Date()),
      ))
      .limit(1);
    if (!record) return Response.json({ error: "This reset link is invalid or expired." }, { status: 400 });

    const passwordHash = await hashPassword(password);
    const results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE users
         SET password_hash = ?
         WHERE id = ? AND EXISTS (
           SELECT 1 FROM account_tokens
           WHERE id = ? AND token_hash = ? AND purpose = 'reset-password' AND expires_at > ?
         )`,
      ).bind(passwordHash, record.userId, record.id, tokenHash, Date.now()),
      env.DB.prepare("DELETE FROM account_tokens WHERE id = ?").bind(record.id),
      env.DB.prepare("DELETE FROM account_tokens WHERE user_id = ?").bind(record.userId),
    ]);
    if (results[0]?.meta.changes !== 1) {
      return Response.json({ error: "This reset link is invalid or expired." }, { status: 400 });
    }
    return Response.json({ message: "Password updated. You can now sign in." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Password reset confirmation failed.", error);
    return Response.json({ error: "Unable to reset password." }, { status: 500 });
  }
}
