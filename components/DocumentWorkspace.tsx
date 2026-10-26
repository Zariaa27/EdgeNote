"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LoaderCircle, LockKeyhole, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import Editor from "./Editor";
import DocumentSharing from "./DocumentSharing";
import LogoutButton from "./LogoutButton";
import ThemeToggle from "./ThemeToggle";

interface DocumentWorkspaceProps {
  documentId: string;
}

export default function DocumentWorkspace({ documentId }: DocumentWorkspaceProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [savedTitle, setSavedTitle] = useState("");
  const [role, setRole] = useState<"owner" | "editor" | "viewer">("owner");
  const [isPublic, setIsPublic] = useState(false);
  const [titleSaveState, setTitleSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [titleSaveError, setTitleSaveError] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch(`/api/documents/${encodeURIComponent(documentId)}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { document?: { title: string; content: string; isPublic: boolean }; role?: "owner" | "editor" | "viewer"; error?: string };
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok || !payload.document) throw new Error(payload.error ?? "Document not found.");
        if (active) {
          setTitle(payload.document.title);
          setSavedTitle(payload.document.title);
          setContent(payload.document.content);
          setRole(payload.role ?? "viewer");
          setIsPublic(payload.document.isPublic);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load document.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [documentId, router]);

  const updateTitle = async () => {
    if (role === "viewer") return;
    const nextTitle = title.trim() || "Untitled document";
    setTitle(nextTitle);
    if (nextTitle === savedTitle) {
      setTitleSaveState("saved");
      return;
    }
    setTitleSaveState("saving");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to save document title.");
      setSavedTitle(nextTitle);
      setTitleSaveState("saved");
      setTitleSaveError("");
    } catch (saveError) {
      setTitleSaveState("error");
      setTitleSaveError(saveError instanceof Error ? saveError.message : "Unable to save document title.");
    }
  };

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f5f4ef]"><LoaderCircle className="h-5 w-5 animate-spin text-[#176b52]" /></main>;
  if (error) return <main className="grid min-h-screen place-items-center bg-[#f5f4ef] px-6"><div className="max-w-md text-center"><p className="text-sm text-rose-700">{error}</p><Link href="/workspace" className="mt-4 inline-block text-sm font-semibold text-[#176b52]">Back to workspace</Link></div></main>;

  return (
    <main className="flex min-h-screen flex-col bg-[#f5f4ef]">
      <header className="flex h-14 items-center gap-3 border-b border-stone-300 bg-[#fbfaf6] px-3 sm:px-6">
        <Link href="/workspace" aria-label="Back to workspace" title="Back to workspace" className="grid h-9 w-9 place-items-center rounded-md text-stone-600 hover:bg-stone-200"><ArrowLeft className="h-4 w-4" /></Link>
        <span className="hidden h-5 w-px bg-stone-300 sm:block" />
        <input value={title} readOnly={role === "viewer"} onChange={(event) => { setTitle(event.currentTarget.value); setTitleSaveState(event.currentTarget.value === savedTitle ? "saved" : "unsaved"); setTitleSaveError(""); }} onBlur={() => void updateTitle()} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} aria-label="Document title" maxLength={160} className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-stone-400 read-only:cursor-default" />
        {role !== "viewer" && <span role={titleSaveState === "error" ? "alert" : "status"} aria-live="polite" title={titleSaveError} className={`hidden text-xs sm:inline ${titleSaveState === "error" ? "text-rose-700" : titleSaveState === "saved" ? "text-emerald-800" : "text-amber-800"}`}>
          {titleSaveState === "saved" ? "Title saved" : titleSaveState === "saving" ? "Saving title…" : titleSaveState === "error" ? "Title not saved" : "Title not saved yet"}
        </span>}
        {role === "viewer" && <span className="inline-flex items-center gap-1 text-xs text-stone-500"><LockKeyhole className="h-3.5 w-3.5" /> View only</span>}
        {role === "owner" && <DocumentSharing documentId={documentId} isPublic={isPublic} onVisibilityChange={setIsPublic} />}
        <ThemeToggle />
        {role !== "viewer" && <Link href="/settings" aria-label="Account settings" title="Account settings" className="grid h-9 w-9 place-items-center rounded-md text-stone-500 hover:bg-stone-200"><Settings className="h-4 w-4" /></Link>}
        {role !== "viewer" && <LogoutButton />}
      </header>
      <div className="flex-1">
        <Editor documentId={documentId} initialContent={content} onContentChange={setContent} readOnly={role === "viewer"} />
      </div>
    </main>
  );
}