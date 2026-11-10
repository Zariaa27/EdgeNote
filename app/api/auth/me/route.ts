import { getCloudflareContext } from "@opennextjs/cloudflare";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { users } from "../../../../src/db/schema";
import { getSessionUserId, isStrongSecret } from "../../../../src/server/auth";

interface AuthBindings {
  DB: D1Database;
  AUTH_SECRET: string;
}

export async function GET(request: Request): Promise<Response> {
  const env = getCloudflareContext().env as unknown as AuthBindings;
  if (!isStrongSecret(env.AUTH_SECRET)) {
    return Response.json({ error: "Authentication is not configured with a strong secret." }, { status: 503 });
  }
  const userId = await getSessionUserId(request, env.AUTH_SECRET);
  if (!userId) return Response.json({ user: null }, { status: 200, headers: { "Cache-Control": "no-store" } });

  try {
    const db = drizzle(env.DB);
    const [user] = await db
      .select({ id: users.id, email: users.email, name: users.name, emailVerifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return Response.json({ user: user ?? null }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Unable to read session." }, { status: 500 });
  }
}