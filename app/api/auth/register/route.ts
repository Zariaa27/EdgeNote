import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { accountTokens, users } from "../../../../src/db/schema";
import {
  createAccountToken,
  getAccountActionUrl,
  sendAccountEmail,
  type AccountEmailBindings,
} from "../../../../src/server/account-email";
import { hashPassword, isStrongSecret } from "../../../../src/server/auth";

const CURRENT_TERMS_VERSION = "2026-10-26";

interface RegisterBindings extends AccountEmailBindings {
  DB: D1Database;
  AUTH_SECRET: string;
}

export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Send a JSON object." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (input.termsAccepted !== true) {
    return Response.json({ error: "Accept the Terms and Privacy Policy and confirm age eligibility to create an account." }, { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!name || name.length > 80) {
    return Response.json({ error: "Name must be between 1 and 80 characters." }, { status: 400 });
  }
  if (password.length < 12 || password.length > 128) {
    return Response.json({ error: "Password must be between 12 and 128 characters." }, { status: 400 });
  }

  const env = getCloudflareContext().env as unknown as RegisterBindings;
  if (!isStrongSecret(env.AUTH_SECRET)) {
    return Response.json({ error: "Authentication is not configured with a strong secret." }, { status: 503 });
  }

  try {
    const db = drizzle(env.DB);
    const [user] = await db
      .insert(users)
      .values({
        email,
        name,
        passwordHash: await hashPassword(password),
        emailVerifiedAt: null,
        termsAcceptedAt: new Date(),
        termsVersion: CURRENT_TERMS_VERSION,
      })
      .returning({ id: users.id, email: users.email, name: users.name });

    const token = await createAccountToken(24 * 60 * 60 * 1000);
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
        explanation: "Confirm your email address to activate your EdgeNote account. This link expires in 24 hours.",
      });
    } catch (error) {
      try {
        await db.delete(accountTokens).where(eq(accountTokens.tokenHash, token.tokenHash));
      } catch (cleanupError) {
        console.error("Unable to clean up an unsent verification token.", cleanupError);
      }
      throw error;
    }
    return Response.json(
      { user, needsVerification: true, message: "Check your email to verify your account before signing in." },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.toLowerCase().includes("unique") || message.toLowerCase().includes("constraint")) {
      return Response.json({ error: "An account with this email already exists." }, { status: 409 });
    }
    console.error("Account registration failed.", error);
    const emailConfigError = message.includes("email is not configured") || message.includes("provider");
    return Response.json(
      { error: emailConfigError ? message : "Unable to create account." },
      { status: emailConfigError ? 503 : 500 },
    );
  }
}