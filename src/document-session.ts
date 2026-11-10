import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { documentShares, documents, users } from "./db/schema";
import { getSessionUserId } from "./server/auth";

const SAVE_INTERVAL_MS = 5_000;

interface SessionEnv {
  DB: D1Database;
  AUTH_SECRET: string;
}

interface SessionState {
  storage: DurableObjectStorage;
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): WebSocket[];
}

interface CursorMessage {
  type: "cursor";
  position: number;
  selection?: { anchor: number; head: number };
}

interface TextPatchMessage {
  type: "text-patch";
  start: number;
  deleteCount: number;
  insert: string;
  clientMutationId?: string;
}

export class DocumentSession {
  private readonly sockets = new Set<WebSocket>();
  private documentId: string | null = null;
  private content = "";
  private dirty = false;
  private revision = 0;
  private persistedRevision = 0;
  private draftWrite: Promise<void> = Promise.resolve();
  private initialized = false;
  private initializing: Promise<boolean> | null = null;

  constructor(
    private readonly state: SessionState,
    private readonly env: SessionEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "GET" && url.searchParams.get("health") === "1") {
      const documentId = url.searchParams.get("documentId");
      if (!documentId) return Response.json({ error: "documentId is required." }, { status: 400 });
      if (!(await this.loadDocument(documentId))) {
        return Response.json({ error: "Document room not found." }, { status: 404 });
      }
      return Response.json({
        ok: true,
        revision: this.revision,
        persistedRevision: this.persistedRevision,
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (request.method === "DELETE") {
      const documentId = url.searchParams.get("documentId");
      if (!documentId || !(await this.loadDocument(documentId))) {
        return Response.json({ error: "Document room not found." }, { status: 404 });
      }
      for (const socket of this.getSockets()) {
        try {
          socket.close(1000, "Document deleted");
        } catch (error) {
          console.error("Unable to close a deleted document socket.", error);
        }
      }
      await this.state.storage.deleteAll();
      await this.state.storage.deleteAlarm();
      this.sockets.clear();
      this.documentId = null;
      this.content = "";
      this.revision = 0;
      this.persistedRevision = 0;
      this.dirty = false;
      this.initialized = false;
      return Response.json({ ok: true });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }

    const documentId = url.searchParams.get("documentId");
    if (!documentId) {
      return Response.json({ error: "documentId is required." }, { status: 400 });
    }

    const loaded = await this.loadDocument(documentId);
    if (!loaded) {
      return Response.json({ error: "Document not found or session mismatch." }, { status: 404 });
    }
    const userId = await getSessionUserId(request, this.env.AUTH_SECRET);
    if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ userId, documentId });
    this.handleOpen(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!(await this.canEdit(socket))) {
      try {
        socket.close(1008, "Document edit permission was revoked");
      } catch (error) {
        console.error("Unable to close a socket without edit permission.", error);
      }
      return;
    }

    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    let payload: unknown;

    try {
      payload = JSON.parse(raw);
    } catch {
      this.sendError(socket, "Message must be valid JSON.");
      return;
    }

    if (!payload || typeof payload !== "object") {
      this.sendError(socket, "Message must be a JSON object.");
      return;
    }

    const candidate = payload as Record<string, unknown>;
    if (candidate.type === "cursor") {
      if (
        typeof candidate.position !== "number" ||
        !Number.isInteger(candidate.position) ||
        candidate.position < 0 ||
        (candidate.selection !== undefined && !this.isValidSelection(candidate.selection))
      ) {
        this.sendError(socket, "Invalid cursor update.");
        return;
      }

      this.broadcast({
        type: "cursor",
        position: candidate.position,
        ...(candidate.selection ? { selection: candidate.selection } : {}),
      } satisfies CursorMessage, socket);
      return;
    }

    if (candidate.type === "save") {
      const requestId = candidate.requestId;
      if (requestId !== undefined && (typeof requestId !== "string" || requestId.length > 80)) {
        this.sendError(socket, "Invalid save request ID.");
        return;
      }
      try {
        await this.draftWrite;
        if (this.dirty) {
          await this.alarm();
        }
        const acknowledged = !this.dirty && this.persistedRevision >= this.revision;
        this.sendMessage(socket, {
          type: acknowledged ? "save" : "save-error",
          documentId: this.documentId,
          revision: this.persistedRevision,
          savedAt: Date.now(),
          ...(typeof requestId === "string" ? { requestId } : {}),
        });
      } catch (error) {
        console.error("Unable to save a document on request.", {
          documentId: this.documentId,
          error,
        });
        this.sendMessage(socket, {
          type: "save-error",
          revision: this.revision,
          ...(typeof requestId === "string" ? { requestId } : {}),
        });
      }
      return;
    }

    if (candidate.type === "text-patch") {
      if (
        !Number.isInteger(candidate.start) ||
        !Number.isInteger(candidate.deleteCount) ||
        (candidate.start as number) < 0 ||
        (candidate.deleteCount as number) < 0 ||
        typeof candidate.insert !== "string" ||
        (candidate.start as number) + (candidate.deleteCount as number) > this.content.length
      ) {
        this.sendError(socket, "Invalid text patch.");
        return;
      }

      const patch = candidate as unknown as TextPatchMessage;
      if (
        patch.clientMutationId !== undefined &&
        (typeof patch.clientMutationId !== "string" || patch.clientMutationId.length > 80)
      ) {
        this.sendError(socket, "Invalid client mutation ID.");
        return;
      }
      this.content =
        this.content.slice(0, patch.start) +
        patch.insert +
        this.content.slice(patch.start + patch.deleteCount);
      this.revision += 1;
      const patchRevision = this.revision;
      this.dirty = true;

      this.broadcast({ ...patch, revision: patchRevision }, socket);
      try {
        await this.persistDraftAndScheduleSave();
      } catch (error) {
        console.error("Unable to persist the latest document draft.", {
          documentId: this.documentId,
          revision: patchRevision,
          error,
        });
        this.sendError(socket, "Unable to persist the latest draft.");
        return;
      }
      if (patch.clientMutationId) {
        this.sendMessage(socket, {
          type: "patch-accepted",
          clientMutationId: patch.clientMutationId,
          revision: patchRevision,
        });
      }
      return;
    }

    this.sendError(socket, "Unsupported message type.");
  }

  webSocketClose(socket: WebSocket): void {
    this.sockets.delete(socket);
    this.broadcast({ type: "presence", event: "close" }, socket);
  }

  webSocketError(socket: WebSocket): void {
    this.sockets.delete(socket);
  }

  async alarm(): Promise<void> {
    if (!this.initialized) {
      const documentId = await this.state.storage.get<string>("documentId");
      if (documentId) await this.loadDocument(documentId);
    }

    if (this.dirty && this.documentId) {
      const contentToSave = this.content;
      const revisionToSave = this.revision;
      try {
        const db = drizzle(this.env.DB);
        const [savedDocument] = await db
          .update(documents)
          .set({ content: contentToSave, updatedAt: new Date() })
          .where(eq(documents.id, this.documentId))
          .returning({ id: documents.id });
        if (!savedDocument) throw new Error("Document no longer exists.");

        this.persistedRevision = Math.max(this.persistedRevision, revisionToSave);
        await this.state.storage.put("persistedRevision", this.persistedRevision);
        this.dirty = this.revision > this.persistedRevision;
        this.broadcast({
          type: "save",
          documentId: this.documentId,
          revision: this.persistedRevision,
          savedAt: Date.now(),
        });
      } catch {
        console.error("Unable to save the latest document revision.", {
          documentId: this.documentId,
          revision: revisionToSave,
        });
        this.dirty = true;
        this.broadcast({ type: "save-error", revision: revisionToSave });
      }
    }

    if (this.getSockets().size > 0 || this.dirty) {
      await this.state.storage.setAlarm(Date.now() + SAVE_INTERVAL_MS);
    }
  }

  private async loadDocument(documentId: string): Promise<boolean> {
    if (this.initialized) return this.documentId === documentId;
    if (this.initializing) {
      return this.initializing.then(
        (loaded) => loaded && this.documentId === documentId,
      );
    }

    this.initializing = (async () => {
      const storedDocumentId = await this.state.storage.get<string>("documentId");
      if (storedDocumentId && storedDocumentId !== documentId) return false;

      const db = drizzle(this.env.DB);
      const [document] = await db
        .select({ content: documents.content })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!document) return false;

      this.documentId = documentId;
      this.content = (await this.state.storage.get<string>("content")) ?? document.content;
      this.revision = (await this.state.storage.get<number>("revision")) ?? 0;
      this.persistedRevision = (await this.state.storage.get<number>("persistedRevision")) ?? 0;
      this.dirty = this.revision > this.persistedRevision;
      this.initialized = true;
      await this.state.storage.put("documentId", documentId);
      await this.state.storage.put("content", this.content);
      if (this.dirty) await this.state.storage.setAlarm(Date.now() + SAVE_INTERVAL_MS);
      return true;
    })();

    try {
      return await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async canEdit(socket: WebSocket): Promise<boolean> {
    const attachment = socket.deserializeAttachment() as { userId?: unknown; documentId?: unknown } | null;
    if (
      typeof attachment?.userId !== "string" ||
      typeof attachment.documentId !== "string"
    ) return false;
    const documentId = attachment.documentId;
    if (!(await this.loadDocument(documentId))) return false;
    const db = drizzle(this.env.DB);
    const [access] = await db
      .select({
        authorId: documents.authorId,
        shareRole: documentShares.role,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(documents)
      .leftJoin(users, eq(users.id, attachment.userId))
      .leftJoin(documentShares, and(
        eq(documentShares.documentId, documents.id),
        eq(documentShares.email, users.email),
      ))
      .where(eq(documents.id, documentId))
      .limit(1);
    return Boolean(
      access &&
      (access.authorId === attachment.userId ||
        (access.emailVerifiedAt && access.shareRole === "editor")),
    );
  }

  private handleOpen(socket: WebSocket): void {
    this.sockets.add(socket);
    this.sendMessage(socket, {
      type: "open",
      documentId: this.documentId,
      content: this.content,
      revision: this.revision,
      persistedRevision: this.persistedRevision,
    });
    this.broadcast({ type: "presence", event: "open" }, socket);
  }

  private persistDraftAndScheduleSave(): Promise<void> {
    const content = this.content;
    const revision = this.revision;
    const write = this.draftWrite.then(async () => {
      await Promise.all([
        this.state.storage.put("content", content),
        this.state.storage.put("revision", revision),
      ]);
      await this.state.storage.setAlarm(Date.now() + SAVE_INTERVAL_MS);
    });
    this.draftWrite = write.catch((error: unknown) => {
      console.error("Unable to persist a document draft.", error);
    });
    return write;
  }

  private getSockets(): Set<WebSocket> {
    for (const socket of this.state.getWebSockets()) {
      this.sockets.add(socket);
    }
    return this.sockets;
  }

  private broadcast(message: unknown, sender?: WebSocket): void {
    const encoded = JSON.stringify(message);
    for (const socket of this.getSockets()) {
      if (socket === sender) continue;
      try {
        socket.send(encoded);
      } catch (error) {
        console.error("Unable to broadcast a document room message.", error);
        this.sockets.delete(socket);
      }
    }
  }

  private sendError(socket: WebSocket, error: string): void {
    this.sendMessage(socket, { type: "error", error });
  }

  private sendMessage(socket: WebSocket, message: unknown): void {
    try {
      socket.send(JSON.stringify(message));
    } catch (sendError) {
      console.error("Unable to send a document room message.", sendError);
    }
  }

  private isValidSelection(value: unknown): value is { anchor: number; head: number } {
    if (!value || typeof value !== "object") return false;
    const selection = value as Record<string, unknown>;
    return (
      Number.isInteger(selection.anchor) &&
      Number.isInteger(selection.head) &&
      (selection.anchor as number) >= 0 &&
      (selection.head as number) >= 0
    );
  }
}