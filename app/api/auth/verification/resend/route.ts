import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { accountTokens, users } from "../../../../../src/db/schema";
import {
  createAccountToken,
  assertAccountEmailConfigured,
  getAccountActionUrl,
  sendAccountEmail,
  type AccountEmailBindings,
} from "../../../../../src/server/account-email";

interface VerificationBindings extends AccountEmailBindings {
  DB: D1Database;
}

const GENERIC_MESSAGE = "If the account needs verification, an email will be sent shortly.";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  const email = body && typeof body === "object" && "email" in body && typeof body.email === "string"
    ? body.email.trim().toLowerCase()
    : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const env = getCloudflareContext().env as unknown as VerificationBindings;
  try {
    assertAccountEmailConfigured(env);
    const db = drizzle(env.DB);
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || user.emailVerifiedAt) {
      return Response.json({ message: GENERIC_MESSAGE }, { headers: { "Cache-Control": "no-store" } });
    }

    const recentToken = await db
      .select({ id: accountTokens.id })
      .from(accountTokens)
      .where(and(
        eq(accountTokens.userId, user.id),
        eq(accountTokens.purpose, "verify-email"),
        gt(accountTokens.createdAt, new Date(Date.now() - RESEND_COOLDOWN_MS)),
      ))
      .limit(1);
    if (recentToken.length) {
      return Response.json({ message: GENERIC_MESSAGE }, { headers: { "Cache-Control": "no-store" } });
    }

    const token = await createAccountToken(TOKEN_TTL_MS);
    await db.delete(accountTokens).where(
      and(eq(accountTokens.userId, user.id), eq(accountTokens.purpose, "verify-email")),
    );
    await db.insert(accountTokens).values({
      userId: user.id,
      tokenHash: token.tokenHash,
      purpose: "verify-email",
      expiresAt: token.expiresAt,
    });
    try {
      await sendAccountEmail(env, {
        to: email,
        subject: "Verify your EdgeNote account",
        actionUrl: getAccountActionUrl(env, "/verify-email", token.rawToken),
        actionLabel: "Verify email address",
        explanation: "Confirm your email address to activate your EdgeNote account.",
      });
    } catch (error) {
      try {
        await db.delete(accountTokens).where(eq(accountTokens.tokenHash, token.tokenHash));
      } catch (cleanupError) {
        console.error("Unable to clean up an unsent verification token.", cleanupError);
      }
      throw error;
    }
    return Response.json({ message: GENERIC_MESSAGE }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Verification email request failed.", error);
    const message = error instanceof Error ? error.message : "";
    const status = message.includes("email is not configured") || message.includes("provider") ? 503 : 500;
    return Response.json({ error: status === 503 ? message : "Unable to request verification email." }, { status });
  }
}
