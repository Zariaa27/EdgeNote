import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { documents } from "./db/schema";

const SAVE_INTERVAL_MS = 5_000;

interface SessionEnv {
  DB: D1Database;
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
}

type ClientMessage = CursorMessage | TextPatchMessage;

export class DocumentSession {
  private readonly sockets = new Set<WebSocket>();
  private documentId: string | null = null;
  private content = "";
  private dirty = false;
  private initialized = false;
  private initializing: Promise<boolean> | null = null;

  constructor(
    private readonly state: SessionState,
    private readonly env: SessionEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }

    const documentId = new URL(request.url).searchParams.get("documentId");
    if (!documentId) {
      return Response.json({ error: "documentId is required." }, { status: 400 });
    }

    const loaded = await this.loadDocument(documentId);
    if (!loaded) {
      return Response.json({ error: "Document not found or session mismatch." }, { status: 404 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    this.handleOpen(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
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
      this.content =
        this.content.slice(0, patch.start) +
        patch.insert +
        this.content.slice(patch.start + patch.deleteCount);
      this.dirty = true;

      void this.persistDraftAndScheduleSave().catch(() => {
        this.sendError(socket, "Unable to persist the latest draft.");
      });
      this.broadcast(patch, socket);
      return;
    }

    this.sendError(socket, "Unsupported message type.");
  }

  webSocketClose(socket: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
    this.sockets.delete(socket);
    this.broadcast({ type: "presence", event: "close" }, socket);
  }

  webSocketError(socket: WebSocket): void {
    this.sockets.delete(socket);
  }

  async alarm(): Promise<void> {
    if (this.dirty && this.documentId) {
      const contentToSave = this.content;
      try {
        const db = drizzle(this.env.DB);
        await db
          .update(documents)
          .set({ content: contentToSave, updatedAt: new Date() })
          .where(eq(documents.id, this.documentId));

        if (this.content === contentToSave) {
          this.dirty = false;
          this.broadcast({
            type: "save",
            documentId: this.documentId,
            savedAt: Date.now(),
          });
        }
      } catch {
        this.dirty = true;
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
      this.initialized = true;
      await this.state.storage.put("documentId", documentId);
      await this.state.storage.put("content", this.content);
      return true;
    })();

    try {
      return await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private handleOpen(socket: WebSocket): void {
    this.sockets.add(socket);
    socket.send(JSON.stringify({
      type: "open",
      documentId: this.documentId,
      content: this.content,
    }));
    this.broadcast({ type: "presence", event: "open" }, socket);
  }

  private async persistDraftAndScheduleSave(): Promise<void> {
    await this.state.storage.put("content", this.content);
    await this.state.storage.setAlarm(Date.now() + SAVE_INTERVAL_MS);
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
      } catch {
        this.sockets.delete(socket);
      }
    }
  }

  private sendError(socket: WebSocket, error: string): void {
    socket.send(JSON.stringify({ type: "error", error }));
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