import { getCloudflareContext } from "@opennextjs/cloudflare";
import { resolveDocumentAccess } from "./document-access";

export interface RealtimeBindings {
  DB: D1Database;
  AUTH_SECRET: string;
  DOCUMENT_SESSIONS: DurableObjectNamespace;
}

export async function handleRealtimeRequest(
  request: Request,
  bindings?: RealtimeBindings,
): Promise<Response> {
  if (request.method !== "GET") {
    return Response.json({ error: "Method not allowed." }, { status: 405 });
  }

  const documentId = new URL(request.url).searchParams.get("documentId");
  if (!documentId) return Response.json({ error: "documentId is required." }, { status: 400 });

  try {
    const env = bindings ?? getCloudflareContext().env as unknown as RealtimeBindings;
    const access = await resolveDocumentAccess(request, documentId, env);
    if (!access.document) return Response.json({ error: "Document not found." }, { status: 404 });
    if (access.role !== "owner" && access.role !== "editor") {
      return Response.json({ error: "You have view-only access to this document." }, { status: 403 });
    }

    const room = env.DOCUMENT_SESSIONS.get(env.DOCUMENT_SESSIONS.idFromName(documentId));
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      const healthUrl = new URL("https://document-session.internal/");
      healthUrl.searchParams.set("documentId", documentId);
      healthUrl.searchParams.set("health", "1");
      const health = await room.fetch(new Request(healthUrl, { headers: { "Cache-Control": "no-store" } }));
      if (!health.ok) {
        const payload = await health.json().catch(() => null) as { error?: string } | null;
        return Response.json(
          { error: payload?.error ?? "Realtime document room is unavailable." },
          { status: health.status, headers: { "Cache-Control": "no-store" } },
        );
      }
      return health;
    }

    const response = await room.fetch(request);
    if (response.status !== 101) {
      console.error("Realtime Durable Object did not accept the WebSocket upgrade.", {
        documentId,
        status: response.status,
      });
    }
    return response;
  } catch (error) {
    console.error("Realtime document room connection failed.", error);
    return Response.json({ error: "Unable to connect to this document room." }, { status: 500 });
  }
}
