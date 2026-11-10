"use client";

import {
  Bold,
  Code2,
  FileText,
  Heading1,
  ImagePlus,
  Italic,
  LoaderCircle,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Search,
  Sparkles,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected";
type SaveState = "checking" | "saved" | "saving" | "unsaved" | "error";

interface SearchResult {
  documentId: string;
  title: string;
  snippet: string;
  score?: number;
}

/** Props for the collaborative Markdown editor. */
export interface EditorProps {
  /** ID of the existing D1 document and Durable Object room to edit. */
  documentId: string;
  /** Initial Markdown shown before the Durable Object sends its canonical snapshot. */
  initialContent?: string;
  /** Optional WebSocket URL. Defaults to `/api/realtime?documentId=...` on this host. */
  webSocketUrl?: string;
  /** Semantic search API endpoint; expects `{ results: SearchResult[] }`. */
  searchEndpoint?: string;
  /** Maps an R2 media key to a URL that can be rendered by the browser. */
  mediaUrlForKey?: (mediaKey: string) => string;
  /** Called when local or remote collaboration changes the Markdown content. */
  onContentChange?: (content: string) => void;
  /** Render content without opening a realtime connection or allowing edits. */
  readOnly?: boolean;
}

interface TextPatch {
  type: "text-patch";
  start: number;
  deleteCount: number;
  insert: string;
  clientMutationId?: string;
}

const EDITOR_TEXT = "min-h-[60vh] w-full resize-none bg-transparent px-5 py-6 font-mono text-[15px] leading-7 text-stone-800 outline-none placeholder:text-stone-400 sm:px-10 sm:py-9";
const TOOL_BUTTON = "inline-flex h-9 w-9 items-center justify-center rounded-md text-stone-600 transition-colors hover:bg-stone-200 hover:text-stone-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";

function createPatch(before: string, after: string): TextPatch {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) {
    start += 1;
  }

  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  return {
    type: "text-patch",
    start,
    deleteCount: oldEnd - start,
    insert: after.slice(start, newEnd),
  };
}

function applyPatch(content: string, patch: TextPatch): string {
  return (
    content.slice(0, patch.start) +
    patch.insert +
    content.slice(patch.start + patch.deleteCount)
  );
}

function insertAtSelection(
  textarea: HTMLTextAreaElement | null,
  content: string,
  inserted: string,
  update: (next: string) => void,
): void {
  if (!textarea) return;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const next = content.slice(0, start) + inserted + content.slice(end);
  update(next);
  requestAnimationFrame(() => {
    textarea.focus();
    const cursor = start + inserted.length;
    textarea.setSelectionRange(cursor, cursor);
  });
}

function getSearchResults(payload: unknown): SearchResult[] {
  if (!payload || typeof payload !== "object" || !("results" in payload)) return [];
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];

  return results.flatMap((result): SearchResult[] => {
    if (!result || typeof result !== "object") return [];
    const item = result as Record<string, unknown>;
    if (!item.document || typeof item.document !== "object") return [];
    const document = item.document as Record<string, unknown>;
    if (typeof document.id !== "string" || typeof document.title !== "string" || typeof document.content !== "string") return [];
    return [{
      documentId: document.id,
      title: document.title,
      snippet: document.content.slice(0, 220),
      ...(typeof item.score === "number" ? { score: item.score } : {}),
    }];
  });
}

/** Collaborative Markdown editor with a summary and semantic-search drawer. */
export default function Editor({
  documentId,
  initialContent = "",
  webSocketUrl,
  searchEndpoint = "/api/search",
  mediaUrlForKey = (mediaKey) => `/api/media?key=${encodeURIComponent(mediaKey)}`,
  onContentChange,
  readOnly = false,
}: EditorProps) {
  const [content, setContent] = useState(initialContent);
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [connectionError, setConnectionError] = useState("");
  const [connectionRetry, setConnectionRetry] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [summaryNotice, setSummaryNotice] = useState("");
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [peerCount, setPeerCount] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("checking");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const contentRef = useRef(initialContent);
  const onContentChangeRef = useRef(onContentChange);
  const snapshotReceivedRef = useRef(false);
  const localEditsRef = useRef(false);
  const latestRevisionRef = useRef(0);
  const persistedRevisionRef = useRef(0);
  const pendingMutationsRef = useRef(new Set<string>());
  const summarySaveWaiterRef = useRef<{
    requestId: string;
    resolve: () => void;
    reject: (error: Error) => void;
    timeoutId: number;
  } | null>(null);

  useEffect(() => {
    onContentChangeRef.current = onContentChange;
  }, [onContentChange]);

  const updateContent = (next: string, sync = true) => {
    if (readOnly) return;
    const previous = contentRef.current;
    contentRef.current = next;
    setContent(next);
    onContentChange?.(next);

    if (sync && previous !== next) {
      localEditsRef.current = true;
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN && snapshotReceivedRef.current) {
        const clientMutationId = crypto.randomUUID();
        pendingMutationsRef.current.add(clientMutationId);
        setSaveState("saving");
        try {
          socket.send(JSON.stringify({ ...createPatch(previous, next), clientMutationId }));
        } catch {
          pendingMutationsRef.current.delete(clientMutationId);
          setSaveState("unsaved");
          socket.close();
        }
      } else {
        setSaveState("unsaved");
      }
    }
  };

  useEffect(() => {
    if (readOnly) {
      setConnection("disconnected");
      setSaveState("saved");
      return;
    }
    let disposed = false;
    let retryTimer: number | undefined;
    let handshakeTimer: number | undefined;
    let attempts = 0;

    const scheduleRetry = (error: string) => {
      setConnection("disconnected");
      setConnectionError(error);
      attempts += 1;
      if (attempts >= 8) return;
      retryTimer = window.setTimeout(() => {
        setConnection("reconnecting");
        void connect();
      }, Math.min(1_000 * 2 ** Math.min(attempts - 1, 4), 15_000));
    };

    const connect = async () => {
      if (disposed) return;
      setConnection(attempts === 0 ? "connecting" : "reconnecting");
      setConnectionError("");
      let socket: WebSocket;
      try {
        const url = webSocketUrl
          ? new URL(webSocketUrl, window.location.href)
          : new URL("/api/realtime", window.location.href);
        url.searchParams.set("documentId", documentId);
        const healthUrl = new URL(url);
        healthUrl.protocol = healthUrl.protocol === "wss:" ? "https:" : healthUrl.protocol === "ws:" ? "http:" : healthUrl.protocol;
        const health = await fetch(healthUrl, { cache: "no-store" });
        const healthPayload = await health.json().catch(() => null) as { error?: string } | null;
        if (!health.ok) {
          const error = healthPayload?.error ?? `Realtime check failed (${health.status}).`;
          if (health.status >= 500) scheduleRetry(error);
          else {
            setConnection("disconnected");
            setConnectionError(error);
          }
          return;
        }
        if (disposed) return;
        url.protocol = url.protocol === "https:" ? "wss:" : url.protocol === "http:" ? "ws:" : url.protocol;
        socket = new WebSocket(url);
      } catch (error) {
        scheduleRetry(error instanceof Error ? error.message : "Unable to start realtime connection.");
        return;
      }
      socketRef.current = socket;
      let transportError = "";
      handshakeTimer = window.setTimeout(() => {
        if (socketRef.current === socket && !snapshotReceivedRef.current) {
          setConnectionError("Realtime server did not send a document snapshot.");
          socket.close();
        }
      }, 12_000);

      socket.onopen = () => {
        setConnection("connecting");
      };

      socket.onmessage = (event) => {
        if (socketRef.current !== socket) return;
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(String(event.data)) as Record<string, unknown>;
        } catch {
          return;
        }

        const applyRemoteContent = (next: string) => {
          contentRef.current = next;
          setContent(next);
          onContentChangeRef.current?.(next);
        };

        if (message.type === "open" && typeof message.content === "string") {
          const serverContent = message.content;
          const localContent = contentRef.current;
          snapshotReceivedRef.current = true;
          if (handshakeTimer) window.clearTimeout(handshakeTimer);
          pendingMutationsRef.current.clear();
          attempts = 0;
          setConnection("connected");
          setConnectionError("");
          const serverRevision = Number.isInteger(message.revision) ? Number(message.revision) : 0;
          const serverPersistedRevision = Number.isInteger(message.persistedRevision)
            ? Number(message.persistedRevision)
            : serverRevision;
          latestRevisionRef.current = Math.max(latestRevisionRef.current, serverRevision);
          persistedRevisionRef.current = Math.max(persistedRevisionRef.current, serverPersistedRevision);
          if (localEditsRef.current && localContent !== serverContent) {
            const pendingPatch = createPatch(serverContent, localContent);
            if (socket.readyState === WebSocket.OPEN && (pendingPatch.deleteCount > 0 || pendingPatch.insert)) {
              const clientMutationId = crypto.randomUUID();
              pendingMutationsRef.current.add(clientMutationId);
              try {
                socket.send(JSON.stringify({ ...pendingPatch, clientMutationId }));
                setSaveState("saving");
              } catch {
                pendingMutationsRef.current.delete(clientMutationId);
                setSaveState("unsaved");
                socket.close();
              }
            }
          } else {
            applyRemoteContent(serverContent);
            localEditsRef.current = false;
            setSaveState(serverPersistedRevision >= serverRevision ? "saved" : "saving");
          }
          return;
        }

        if (
          message.type === "text-patch" &&
          Number.isInteger(message.start) &&
          Number.isInteger(message.deleteCount) &&
          typeof message.insert === "string"
        ) {
          applyRemoteContent(applyPatch(contentRef.current, message as unknown as TextPatch));
          if (Number.isInteger(message.revision)) {
            latestRevisionRef.current = Math.max(latestRevisionRef.current, Number(message.revision));
          }
          setSaveState(persistedRevisionRef.current >= latestRevisionRef.current ? "saved" : "saving");
          return;
        }

        if (
          message.type === "patch-accepted" &&
          typeof message.clientMutationId === "string" &&
          Number.isInteger(message.revision)
        ) {
          pendingMutationsRef.current.delete(message.clientMutationId);
          latestRevisionRef.current = Math.max(latestRevisionRef.current, Number(message.revision));
          if (
            pendingMutationsRef.current.size === 0 &&
            persistedRevisionRef.current >= latestRevisionRef.current
          ) {
            setSaveState("saved");
            localEditsRef.current = false;
          } else {
            setSaveState("saving");
          }
          return;
        }

        if (message.type === "presence" && message.event === "open") {
          setPeerCount((count) => count + 1);
        }
        if (message.type === "presence" && message.event === "close") {
          setPeerCount((count) => Math.max(0, count - 1));
        }
        if (message.type === "save" && Number.isInteger(message.revision)) {
          persistedRevisionRef.current = Math.max(persistedRevisionRef.current, Number(message.revision));
          if (
            typeof message.requestId === "string" &&
            message.requestId === summarySaveWaiterRef.current?.requestId
          ) {
            window.clearTimeout(summarySaveWaiterRef.current.timeoutId);
            summarySaveWaiterRef.current.resolve();
            summarySaveWaiterRef.current = null;
          }
          if (
            persistedRevisionRef.current >= latestRevisionRef.current &&
            pendingMutationsRef.current.size === 0
          ) {
            setSaveState("saved");
            localEditsRef.current = false;
          } else {
            setSaveState("saving");
          }
          return;
        }
        if (message.type === "save-error") {
          if (
            typeof message.requestId === "string" &&
            message.requestId === summarySaveWaiterRef.current?.requestId
          ) {
            window.clearTimeout(summarySaveWaiterRef.current.timeoutId);
            summarySaveWaiterRef.current.reject(new Error("The latest edits could not be saved. Try again before summarizing."));
            summarySaveWaiterRef.current = null;
          }
          if (
            Number.isInteger(message.revision) &&
            Number(message.revision) > persistedRevisionRef.current
          ) setSaveState("error");
          return;
        }
        if (message.type === "error") {
          setSaveState("error");
        }
      };

      socket.onclose = (event) => {
        if (handshakeTimer) window.clearTimeout(handshakeTimer);
        if (socketRef.current === socket) socketRef.current = null;
        snapshotReceivedRef.current = false;
        pendingMutationsRef.current.clear();
        if (disposed) return;
        const closeDetails = transportError || (event.reason
          ? `Connection closed (${event.code}): ${event.reason}`
          : event.code === 1006
            ? "WebSocket closed unexpectedly (1006). The Worker may not have completed the realtime upgrade; check Worker logs."
            : `Connection closed (${event.code}).`);
        if (localEditsRef.current || latestRevisionRef.current > persistedRevisionRef.current) {
          setSaveState("unsaved");
        }
        scheduleRetry(closeDetails);
      };

      socket.onerror = () => {
        transportError = "WebSocket transport failed. The browser cannot expose the server response; check Worker logs for the upgrade request.";
        setConnectionError(transportError);
        socket.close();
      };
    };

    void connect();
    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (handshakeTimer) window.clearTimeout(handshakeTimer);
      if (summarySaveWaiterRef.current) {
        window.clearTimeout(summarySaveWaiterRef.current.timeoutId);
        summarySaveWaiterRef.current.reject(new Error("Realtime disconnected before the latest edits were saved."));
        summarySaveWaiterRef.current = null;
      }
      snapshotReceivedRef.current = false;
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [documentId, webSocketUrl, connectionRetry, readOnly]);

  const formatSelection = (before: string, after = before) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = content.slice(start, end) || "text";
    insertAtSelection(textarea, content, `${before}${selected}${after}`, updateContent);
    requestAnimationFrame(() => textarea.setSelectionRange(start + before.length, start + before.length + selected.length));
  };

  const addHeading = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const lineStart = content.lastIndexOf("\n", start - 1) + 1;
    insertAtSelection(textarea, content, "## ", updateContent);
    requestAnimationFrame(() => textarea.setSelectionRange(lineStart + 3, lineStart + 3));
  };

  const uploadImage = async (file: File) => {
    if (readOnly) return;
    if (!file.type.startsWith("image/")) {
      setSummaryError("Choose an image file to upload.");
      return;
    }
    setIsUploading(true);
    setSummaryError("");
    try {
      const form = new FormData();
      form.set("documentId", documentId);
      form.set("file", file);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const payload = await response.json() as { mediaKey?: string; error?: string };
      if (!response.ok || !payload.mediaKey) {
        throw new Error(payload.error ?? "Image upload failed.");
      }

      const imageUrl = mediaUrlForKey(payload.mediaKey);
      const altText = file.name.replace(/[\[\]]/g, "");
      const imageMarkdown = `![${altText}](${imageUrl})`;
      insertAtSelection(textareaRef.current, contentRef.current, imageMarkdown, updateContent);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "Image upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const summarize = async () => {
    setDrawerOpen(true);
    setIsSummarizing(true);
    setSummaryError("");
    setSummaryNotice("");
    setSummary("");
    try {
      const socket = socketRef.current;
      if (connection !== "connected" || socket?.readyState !== WebSocket.OPEN || !snapshotReceivedRef.current) {
        throw new Error("Connect to the document before requesting a summary so the latest saved note can be used.");
      }
      const requestId = crypto.randomUUID();
      await new Promise<void>((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
          if (summarySaveWaiterRef.current?.requestId !== requestId) return;
          summarySaveWaiterRef.current = null;
          reject(new Error("Timed out saving the latest edits. Try again."));
        }, 15_000);
        summarySaveWaiterRef.current = { requestId, resolve, reject, timeoutId };
        try {
          socket.send(JSON.stringify({ type: "save", requestId }));
        } catch {
          window.clearTimeout(timeoutId);
          summarySaveWaiterRef.current = null;
          reject(new Error("Could not request a save. Check the document connection and try again."));
        }
      });
      const response = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId }),
      });
      const payload = await response.json() as { summary?: string; error?: string; indexingWarning?: string };
      if (!response.ok || !payload.summary) throw new Error(payload.error ?? "Unable to summarize this document.");
      setSummary(payload.summary);
      if (payload.indexingWarning) setSummaryNotice(payload.indexingWarning);
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : "Unable to summarize this document.");
    } finally {
      setIsSummarizing(false);
    }
  };

  const searchDocuments = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) return;
    setDrawerOpen(true);
    setIsSearching(true);
    setSearchError("");
    try {
      const searchUrl = new URL(searchEndpoint, window.location.href);
      searchUrl.searchParams.set("query", query.trim());
      const response = await fetch(searchUrl);
      const payload: unknown = await response.json();
      if (!response.ok) {
        const error = payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error: unknown }).error)
          : "Semantic search is unavailable.";
        throw new Error(error);
      }
      setResults(getSearchResults(payload));
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Semantic search is unavailable.");
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const sendCursor = () => {
    const textarea = textareaRef.current;
    const socket = socketRef.current;
    if (!textarea || socket?.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({
      type: "cursor",
      position: textarea.selectionStart,
      selection: { anchor: textarea.selectionStart, head: textarea.selectionEnd },
    }));
  };

  const saveNow = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !snapshotReceivedRef.current) {
      setSaveState("unsaved");
      return;
    }
    try {
      setSaveState("saving");
      socket.send(JSON.stringify({ type: "save" }));
    } catch {
      setSaveState("error");
    }
  };

  return (
    <section className="flex min-h-[calc(100vh-4rem)] flex-col overflow-hidden bg-[#f5f4ef] text-stone-900">
      <header className="flex min-h-14 items-center justify-between border-b border-stone-300 bg-[#fbfaf6] px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <FileText aria-hidden="true" className="h-4 w-4 shrink-0 text-emerald-800" />
          <span className="truncate text-sm font-semibold">Markdown workspace</span>
          <span className="hidden text-xs text-stone-400 sm:inline">/</span>
          <span className="hidden truncate font-mono text-xs text-stone-500 sm:inline">{documentId}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          {!readOnly && <div className="flex items-center gap-1">
            <span
              role="status"
              className={`inline-flex items-center gap-1.5 text-[10px] sm:text-xs ${
                connection === "connected" ? "text-emerald-800" : "text-amber-800"
              }`}
              title={connectionError || (connection === "connected" ? "Realtime collaboration is connected." : "Realtime collaboration is not currently connected.")}
            >
              {connection === "connected" ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {connection === "connected"
                ? <><span className="hidden sm:inline">Connected · </span>{peerCount + 1} in room</>
                : connection === "connecting" ? "Connecting" : connection === "reconnecting" ? "Reconnecting…" : "Disconnected"}
            </span>
            {connection === "disconnected" && (
              <button
                type="button"
                onClick={() => setConnectionRetry((attempt) => attempt + 1)}
                className="rounded px-1 text-[10px] font-semibold text-[#176b52] underline sm:text-xs"
                title={connectionError || "Retry the realtime connection"}
              >
                Retry
              </button>
            )}
          </div>}
          {!readOnly && <button
            type="button"
            onClick={saveNow}
            disabled={connection !== "connected" || saveState === "checking"}
            aria-label={`Save document now. Current status: ${saveState}`}
            aria-live="polite"
            className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] transition hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-60 sm:text-xs ${
              saveState === "saved" ? "text-emerald-800" : saveState === "error" ? "text-rose-700" : saveState === "checking" ? "text-stone-500" : "text-amber-800"
            }`}
            title={connection !== "connected"
              ? "Reconnect before saving; local edits are not yet confirmed."
              : saveState === "saved"
                ? "Latest acknowledged changes are saved to the database."
                : saveState === "saving"
                  ? "Changes are being synchronized and persisted."
                  : saveState === "checking"
                    ? "Checking the document's persisted revision."
                  : saveState === "error"
                    ? "The server could not persist the latest changes yet."
                    : "Local changes have not yet been acknowledged by the server."
            }
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{saveState === "saved" ? "Saved" : saveState === "saving" ? "Saving…" : saveState === "checking" ? "Checking…" : saveState === "error" ? "Save failed" : "Not saved"}</span>
          </button>}
          <button
            type="button"
            aria-label={drawerOpen ? "Close insights drawer" : "Open insights drawer"}
            title={drawerOpen ? "Close insights" : "Open insights"}
            onClick={() => setDrawerOpen((open) => !open)}
            className={TOOL_BUTTON}
          >
            {drawerOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
          </button>
        </div>
      </header>
      {!readOnly && connection === "disconnected" && connectionError && (
        <p role="alert" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900 sm:px-6">
          Realtime unavailable: {connectionError}
        </p>
      )}

      <div className="relative flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-14 flex-wrap items-center gap-1 border-b border-stone-300 bg-[#f8f7f2] px-3 sm:px-6">
            <button type="button" aria-label="Bold" title="Bold" disabled={readOnly} className={TOOL_BUTTON} onClick={() => formatSelection("**")}><Bold className="h-4 w-4" /></button>
            <button type="button" aria-label="Italic" title="Italic" disabled={readOnly} className={TOOL_BUTTON} onClick={() => formatSelection("_")}><Italic className="h-4 w-4" /></button>
            <button type="button" aria-label="Code block" title="Code block" disabled={readOnly} className={TOOL_BUTTON} onClick={() => formatSelection("```\n", "\n```")}><Code2 className="h-4 w-4" /></button>
            <button type="button" aria-label="Heading" title="Heading" disabled={readOnly} className={TOOL_BUTTON} onClick={addHeading}><Heading1 className="h-4 w-4" /></button>
            <span className="mx-2 h-5 w-px bg-stone-300" />
            <button type="button" aria-label="Upload image" title="Upload image" disabled={isUploading || readOnly} className={TOOL_BUTTON} onClick={() => fileInputRef.current?.click()}>
              {isUploading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/avif,image/gif,image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void uploadImage(file);
                event.currentTarget.value = "";
              }}
            />
            {!readOnly && <button type="button" aria-label="AI Summarize" className="ml-auto inline-flex h-9 items-center gap-2 rounded-md bg-emerald-800 px-3 text-xs font-semibold text-white transition-colors hover:bg-emerald-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50" onClick={() => void summarize()} disabled={isSummarizing}>
              {isSummarizing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">AI Summarize</span>
            </button>}
          </div>

          <div
            className={`relative flex flex-1 justify-center overflow-y-auto ${isDragging ? "bg-emerald-50" : ""}`}
            onDragEnter={(event) => {
              if (readOnly) return;
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (readOnly) return;
              setIsDragging(false);
              const image = Array.from(event.dataTransfer.files).find((file) => file.type.startsWith("image/"));
              if (image) void uploadImage(image);
            }}
          >
            <div className="w-full max-w-4xl py-7 sm:py-12">
              <div className="mb-3 px-5 font-mono text-[10px] uppercase tracking-[0.12em] text-stone-400 sm:px-10">Document · Markdown</div>
              <textarea
                ref={textareaRef}
                aria-label="Markdown document content"
                value={content}
                readOnly={readOnly}
                onChange={(event) => updateContent(event.currentTarget.value)}
                onClick={sendCursor}
                onKeyUp={sendCursor}
                placeholder="# Start writing..."
                spellCheck
                className={EDITOR_TEXT}
              />
              {isDragging && (
                <div className="pointer-events-none absolute inset-4 flex items-center justify-center border-2 border-dashed border-emerald-700 bg-[#f5f4ef]/90 text-sm font-medium text-emerald-900">
                  Drop an image to upload
                </div>
              )}
              {summaryError && <p role="alert" className="mx-5 mt-3 text-sm text-rose-700 sm:mx-10">{summaryError}</p>}
              {summaryNotice && <p role="status" className="mx-5 mt-3 text-sm text-amber-800 sm:mx-10">{summaryNotice}</p>}
            </div>
          </div>
          <footer className="flex h-9 min-w-0 items-center justify-between gap-2 border-t border-stone-300 bg-[#fbfaf6] px-3 text-[10px] text-stone-500 sm:px-6 sm:text-[11px]">
            <span className="min-w-0 truncate">{content.length.toLocaleString()} characters · {readOnly ? "View only" : connection === "connected" ? "Realtime on" : saveState === "unsaved" || saveState === "error" ? "Offline changes are not confirmed" : connection === "disconnected" ? "Realtime unavailable" : "Reconnecting to realtime"}</span>
            <span>Markdown</span>
          </footer>
        </main>

        {drawerOpen && (
          <aside aria-label="Document insights" className="absolute inset-y-0 right-0 z-10 flex w-full flex-col border-l border-stone-300 bg-[#fbfaf6] sm:relative sm:z-0 sm:w-[340px] sm:shrink-0 lg:w-[380px]">
            <div className="flex h-14 items-center justify-between border-b border-stone-200 px-5">
              <h2 className="text-sm font-semibold">Document insights</h2>
              <button type="button" aria-label="Close insights" title="Close insights" className={TOOL_BUTTON} onClick={() => setDrawerOpen(false)}><X className="h-4 w-4" /></button>
            </div>

            <div className="border-b border-stone-200 p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-stone-500"><Sparkles className="h-3.5 w-3.5 text-emerald-800" /> AI summary</div>
              {isSummarizing ? (
                <div className="flex items-center gap-2 text-sm text-stone-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Summarizing document</div>
              ) : summary ? (
                <p className="text-sm leading-6 text-stone-700">{summary}</p>
              ) : (
                <p className="text-sm leading-6 text-stone-400">Summarize this document to see its key points here.</p>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col p-5">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-stone-500"><Search className="h-3.5 w-3.5 text-emerald-800" /> Semantic search</div>
              <form onSubmit={(event) => void searchDocuments(event)} className="flex gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Find related notes"
                  aria-label="Search related documents"
                  className="h-9 min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 text-sm outline-none placeholder:text-stone-400 focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700"
                />
                <button type="submit" disabled={isSearching || !query.trim()} aria-label="Search documents" title="Search documents" className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-stone-800 text-white hover:bg-stone-700 disabled:opacity-50">
                  {isSearching ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </button>
              </form>

              {searchError && <p role="alert" className="mt-3 text-xs leading-5 text-rose-700">{searchError}</p>}
              <div className="mt-4 flex-1 space-y-1 overflow-y-auto">
                {results.map((result) => (
                  <article key={result.documentId} className="border-b border-stone-200 py-3 last:border-0">
                    <h3 className="text-sm font-medium text-stone-800">{result.title}</h3>
                    <p className="mt-1 line-clamp-3 text-xs leading-5 text-stone-500">{result.snippet}</p>
                    {typeof result.score === "number" && <span className="mt-2 block font-mono text-[10px] text-stone-400">match {(result.score * 100).toFixed(0)}%</span>}
                  </article>
                ))}
                {!results.length && !searchError && !isSearching && (
                  <p className="pt-2 text-xs leading-5 text-stone-400">Search across your workspace for conceptually related documents.</p>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
}