"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowRight, FilePlus2, FileText, Globe2, LayoutDashboard, LoaderCircle, LockKeyhole, Search, Settings, Trash2, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import BrandMark from "./BrandMark";
import CreateDocumentDialog from "./CreateDocumentDialog";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "./ThemeToggle";

interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

interface DocumentSummary {
  id: string;
  title: string;
  content: string;
  isPublic: boolean;
  role: "owner" | "editor" | "viewer";
  updatedAt: string;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export default function Workspace() {
  const router = useRouter();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [deletingDocumentId, setDeletingDocumentId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const loadWorkspace = async () => {
      try {
        const sessionResponse = await fetch("/api/auth/me", { cache: "no-store" });
        const session = await sessionResponse.json() as { user: CurrentUser | null };
        if (!active) return;
        if (!session.user) {
          router.replace("/login");
          return;
        }
        setUser(session.user);

        const documentsResponse = await fetch("/api/documents", { cache: "no-store" });
        const payload = await documentsResponse.json() as { documents?: DocumentSummary[]; error?: string };
        if (!documentsResponse.ok) throw new Error(payload.error ?? "Unable to load your documents.");
        if (active) setDocuments(payload.documents ?? []);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load workspace.");
      } finally {
        if (active) setIsLoading(false);
      }
    };
    void loadWorkspace();
    return () => { active = false; };
  }, [router]);

  const filteredDocuments = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return normalized
      ? documents.filter((document) => document.title.toLowerCase().includes(normalized))
      : documents;
  }, [documents, search]);

  const manageDocument = async (document: DocumentSummary) => {
    const owned = document.role === "owner";
    const confirmed = window.confirm(owned
      ? `Permanently delete “${document.title}” and remove its shared access? This cannot be undone.`
      : `Remove “${document.title}” from your workspace and revoke your access?`);
    if (!confirmed) return;

    setDeletingDocumentId(document.id);
    setError("");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(document.id)}${owned ? "" : "/shares"}`, {
        method: "DELETE",
        ...(owned ? {} : { headers: { "Content-Type": "application/json" } }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? (owned ? "Unable to delete note." : "Unable to remove shared note."));
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch (manageError) {
      setError(manageError instanceof Error ? manageError.message : "Unable to update this note.");
    } finally {
      setDeletingDocumentId("");
    }
  };

  if (isLoading) {
    return <main className="grid min-h-screen place-items-center bg-[#f5f4ef]"><LoaderCircle className="h-5 w-5 animate-spin text-[#176b52]" /></main>;
  }

  return (
    <main className="min-h-screen bg-[#f5f4ef] text-[#17251f]">
      <header className="flex h-[68px] items-center justify-between border-b border-stone-300 bg-[#fbfaf6] px-5 sm:px-8">
        <Link href="/workspace" className="inline-flex items-center gap-3 text-sm font-semibold">
          <BrandMark />
          <span>EdgeNote</span>
        </Link>
        <div className="flex items-center gap-3">
          {user && <span className="hidden text-sm text-stone-500 sm:block">{user.name}</span>}
          {user?.email.toLowerCase() === "alexistrudeau94@gmail.com" && (
            <Link href="/admin" className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-semibold text-[#176b52] transition hover:bg-[#e8eee6]">
              <LayoutDashboard className="h-4 w-4" /><span className="hidden sm:inline">Admin</span>
            </Link>
          )}
          <ThemeToggle />
          <Link href="/settings" aria-label="Account settings" title="Account settings" className="grid h-9 w-9 place-items-center rounded-lg text-stone-500 transition hover:bg-stone-200 hover:text-stone-900"><Settings className="h-4 w-4" /></Link>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="flex flex-col justify-between gap-7 border-b border-stone-300 pb-9 sm:flex-row sm:items-end">
          <div>
            <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-[#78857d]">Your private workspace</p>
            <h1 className="font-display text-4xl leading-tight sm:text-5xl">Good to see you, {user?.name.split(" ")[0]}.</h1>
            <p className="mt-3 text-sm text-stone-500">A clear page for what you’re thinking about.</p>
          </div>
          <button type="button" onClick={() => setShowCreateDialog(true)} className="inline-flex h-11 items-center justify-center gap-2 self-start rounded-lg bg-[#176b52] px-4 text-sm font-semibold text-white transition hover:bg-[#12543f] sm:self-auto">
            <FilePlus2 className="h-4 w-4" />
            New document
          </button>
        </div>

        {error && <p role="alert" className="mt-6 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>}

        <section className="pt-8">
          <div className="mb-5 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h2 className="text-sm font-semibold">Your documents</h2>
              <p className="mt-1 text-xs text-stone-500">{documents.length} {documents.length === 1 ? "document" : "documents"}</p>
            </div>
            <label className="relative block w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <input value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Filter documents" aria-label="Filter documents" className="h-10 w-full rounded-lg border border-stone-300 bg-[#fbfaf6] pl-9 pr-3 text-sm outline-none focus:border-[#176b52] focus:ring-2 focus:ring-[#176b52]/10" />
            </label>
          </div>

          {filteredDocuments.length ? (
            <div className="divide-y divide-stone-200 border-y border-stone-300">
              {filteredDocuments.map((document) => (
                <article key={document.id} className="group grid gap-3 py-4 transition hover:bg-white/50 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-3">
                  <Link href={`/documents/${document.id}`} className="min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[#176b52]">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-[#176b52]" />
                      <h3 className="truncate text-sm font-semibold">{document.title}</h3>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] capitalize text-stone-500">
                        {document.role === "owner" ? document.isPublic ? <Globe2 className="h-3 w-3" /> : <LockKeyhole className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                        {document.role === "owner" ? document.isPublic ? "Public link" : "Private" : `Shared · ${document.role}`}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-1 pl-6 text-xs text-stone-500">{document.content || "No content yet"}</p>
                  </Link>
                  <div className="flex items-center justify-between gap-3 pl-6 text-xs text-stone-400 sm:justify-end sm:pl-0">
                    <span>Edited {formatDate(document.updatedAt)}</span>
                    <Link href={`/documents/${document.id}`} aria-label={`Open ${document.title}`} className="grid h-8 w-8 place-items-center rounded-md text-stone-400 hover:bg-stone-200 hover:text-[#176b52]"><ArrowRight className="h-4 w-4" /></Link>
                    <button
                      type="button"
                      onClick={() => void manageDocument(document)}
                      disabled={deletingDocumentId === document.id}
                      aria-label={document.role === "owner" ? `Delete ${document.title}` : `Remove ${document.title} from workspace`}
                      title={document.role === "owner" ? "Delete note" : "Remove shared note"}
                      className="grid h-8 w-8 place-items-center rounded-md text-stone-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                    >
                      {deletingDocumentId === document.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : document.role === "owner" ? <Trash2 className="h-4 w-4" /> : <X className="h-4 w-4" />}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center border-y border-stone-300 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#e4e9df]"><ArrowDownLeft className="h-5 w-5 text-[#176b52]" /></span>
              <h3 className="mt-4 font-display text-2xl">{search ? "No matching documents" : "Start with a blank page"}</h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-stone-500">{search ? "Try a shorter title or clear your filter." : "Create your first note. It stays private to your account until you choose to share it."}</p>
              {!search && <button onClick={() => setShowCreateDialog(true)} className="mt-5 text-sm font-semibold text-[#176b52] hover:underline">Create a document</button>}
            </div>
          )}
        </section>
      </div>
      {showCreateDialog && (
        <CreateDocumentDialog
          onClose={() => setShowCreateDialog(false)}
          onCreated={() => {
            void fetch("/api/documents", { cache: "no-store" })
              .then(async (response) => {
                const payload = await response.json() as { documents?: DocumentSummary[]; error?: string };
                if (!response.ok) throw new Error(payload.error ?? "Unable to refresh documents.");
                setDocuments(payload.documents ?? []);
              })
              .catch((refreshError: unknown) => setError(refreshError instanceof Error ? refreshError.message : "Unable to refresh documents."));
          }}
          onOpenDocument={(documentId) => router.push(`/documents/${encodeURIComponent(documentId)}`)}
        />
      )}
    </main>
  );
}