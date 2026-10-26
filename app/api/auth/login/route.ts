import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { users } from "../../../../src/db/schema";
import {
  sendLoginNotification,
  type AccountEmailBindings,
} from "../../../../src/server/account-email";
import { createSessionCookie, isStrongSecret, verifyPassword } from "../../../../src/server/auth";

interface LoginBindings extends AccountEmailBindings {
  DB: D1Database;
  AUTH_SECRET: string;
}

/** Authenticate a verified account, set its session cookie, and send a sign-in notice. */
export async function POST(request: Request): Promise<Response> {
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Send a JSON object." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  if (!email || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  const env = getCloudflareContext().env as unknown as LoginBindings;
  if (!isStrongSecret(env.AUTH_SECRET)) {
    return Response.json({ error: "Authentication is not configured with a strong secret." }, { status: 503 });
  }

  try {
    const db = drizzle(env.DB);
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return Response.json({ error: "Email or password is incorrect." }, { status: 401 });
    }
    if (!user.emailVerifiedAt) {
      return Response.json(
        { error: "Verify your email address before signing in.", needsVerification: true },
        { status: 403 },
      );
    }

    const response = Response.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
    response.headers.append("Set-Cookie", await createSessionCookie(user.id, env.AUTH_SECRET, request));
    response.headers.set("Cache-Control", "no-store");
    try {
      await sendLoginNotification(env, user.email);
    } catch (error) {
      console.error("Unable to send sign-in notification.", error);
    }
    return response;
  } catch (error) {
    console.error("Sign-in failed.", error);
    return Response.json({ error: "Unable to sign in." }, { status: 500 });
  }
}