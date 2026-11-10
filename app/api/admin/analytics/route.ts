import { getCloudflareContext } from "@opennextjs/cloudflare";
import { count, desc, gte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { documents, users } from "../../../../src/db/schema";
import { getSessionUserId } from "../../../../src/server/auth";

interface AdminBindings {
  DB: D1Database;
  AUTH_SECRET: string;
}

const ADMIN_EMAIL = "alexistrudeau94@gmail.com";

export async function GET(request: Request): Promise<Response> {
  const env = getCloudflareContext().env as unknown as AdminBindings;
  const userId = await getSessionUserId(request, env.AUTH_SECRET);
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });

  try {
    const db = drizzle(env.DB);
    const [admin] = await db
      .select({ email: users.email })
      .from(users)
      .where(sql`${users.id} = ${userId} AND lower(${users.email}) = ${ADMIN_EMAIL}`)
      .limit(1);
    if (!admin) return Response.json({ error: "Admin access required." }, { status: 403 });

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [totalUsers, totalDocuments, newUsers, newDocuments, recentUsers, signupsByDay, documentsByDay] =
      await Promise.all([
        db.select({ value: count() }).from(users),
        db.select({ value: count() }).from(documents),
        db.select({ value: count() }).from(users).where(gte(users.createdAt, weekAgo)),
        db.select({ value: count() }).from(documents).where(gte(documents.createdAt, weekAgo)),
        db
          .select({ name: users.name, email: users.email, createdAt: users.createdAt })
          .from(users)
          .orderBy(desc(users.createdAt))
          .limit(8),
        db
          .select({
            day: sql<string>`date(${users.createdAt} / 1000, 'unixepoch')`,
            value: count(),
          })
          .from(users)
          .where(gte(users.createdAt, weekAgo))
          .groupBy(sql`date(${users.createdAt} / 1000, 'unixepoch')`),
        db
          .select({
            day: sql<string>`date(${documents.createdAt} / 1000, 'unixepoch')`,
            value: count(),
          })
          .from(documents)
          .where(gte(documents.createdAt, weekAgo))
          .groupBy(sql`date(${documents.createdAt} / 1000, 'unixepoch')`),
      ]);

    return Response.json(
      {
        overview: {
          totalUsers: totalUsers[0]?.value ?? 0,
          totalDocuments: totalDocuments[0]?.value ?? 0,
          newUsersLast7Days: newUsers[0]?.value ?? 0,
          newDocumentsLast7Days: newDocuments[0]?.value ?? 0,
        },
        recentUsers,
        signupsByDay,
        documentsByDay,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Admin analytics query failed.", error);
    return Response.json({ error: "Unable to load admin analytics." }, { status: 500 });
  }
}
