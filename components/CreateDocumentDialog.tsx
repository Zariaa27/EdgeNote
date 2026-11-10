"use client";

import { Globe2, LoaderCircle, LockKeyhole, X } from "lucide-react";
import { FormEvent, useState } from "react";

interface CreateDocumentDialogProps {
  onClose: () => void;
  onCreated: () => void;
  onOpenDocument: (documentId: string) => void;
}

interface CreateResponse {
  document?: { id: string };
  error?: string;
}

export default function CreateDocumentDialog({
  onClose,
  onCreated,
  onOpenDocument,
}: CreateDocumentDialogProps) {
  const [title, setTitle] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [invitees, setInvitees] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ documentId: string; warnings: string[] } | null>(null);

  const createDocument = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setError("");

    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), content: "", isPublic }),
      });
      const payload = await response.json() as CreateResponse;
      if (!response.ok || !payload.document) throw new Error(payload.error ?? "Unable to create document.");

      const emails = [...new Set(invitees.split(/[,\n;]/).map((value) => value.trim().toLowerCase()).filter(Boolean))];
      const warnings: string[] = [];
      for (const email of emails) {
        try {
          const shareResponse = await fetch(`/api/documents/${encodeURIComponent(payload.document.id)}/shares`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, role }),
          });
          const share = await shareResponse.json() as { error?: string; permissionSaved?: boolean };
          if (!shareResponse.ok && !share.permissionSaved) {
            warnings.push(`${email}: ${share.error ?? "permission could not be saved"}`);
          } else if (!shareResponse.ok && share.error) {
            warnings.push(`${email}: permission saved, but ${share.error}`);
          }
        } catch {
          warnings.push(`${email}: unable to contact the sharing service`);
        }
      }

      onCreated();
      if (warnings.length) {
        setResult({ documentId: payload.document.id, warnings });
      } else {
        onOpenDocument(payload.document.id);
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Unable to create document.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isCreating) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-document-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-[#fbfaf6] p-5 shadow-2xl sm:p-7"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="create-document-title" className="text-lg font-semibold">
              {result ? "Note created" : "Create a note"}
            </h2>
            <p className="mt-1 text-sm text-stone-500">
              {result ? "Your note is ready. Review the sharing results below." : "Name it and choose who can access it."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isCreating}
            aria-label="Close create note dialog"
            className="grid h-8 w-8 place-items-center rounded-md text-stone-500 hover:bg-stone-200 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

        {result ? (
          <>
            <div role="alert" className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-900">
              <p className="font-semibold">The note was created, but some invitations need attention:</p>
              <ul className="mt-2 list-inside list-disc space-y-1">
                {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
              <p className="mt-2">You can retry or change permissions from the note’s Share dialog.</p>
            </div>
            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} className="h-10 rounded-lg border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100">Stay in workspace</button>
              <button type="button" onClick={() => onOpenDocument(result.documentId)} className="h-10 rounded-lg bg-[#176b52] px-4 text-sm font-semibold text-white hover:bg-[#12543f]">Open note</button>
            </div>
          </>
        ) : (
          <form onSubmit={(event) => void createDocument(event)} className="mt-6 space-y-5">
            <label className="block text-xs font-semibold text-stone-700">
              Note name
              <input
                autoFocus
                required
                maxLength={160}
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                placeholder="Untitled note"
                className="mt-2 h-11 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-normal outline-none focus:border-[#176b52] focus:ring-2 focus:ring-[#176b52]/10"
              />
            </label>

            <fieldset>
              <legend className="text-xs font-semibold text-stone-700">Link access</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={!isPublic}
                  onClick={() => setIsPublic(false)}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left ${!isPublic ? "border-[#176b52] bg-[#e8eee6]" : "border-stone-200 bg-white"}`}
                >
                  <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[#176b52]" />
                  <span><span className="block text-sm font-semibold">Private</span><span className="mt-1 block text-xs leading-5 text-stone-500">Only you and invited people can access it.</span></span>
                </button>
                <button
                  type="button"
                  aria-pressed={isPublic}
                  onClick={() => setIsPublic(true)}
                  className={`flex items-start gap-3 rounded-xl border p-3 text-left ${isPublic ? "border-[#176b52] bg-[#e8eee6]" : "border-stone-200 bg-white"}`}
                >
                  <Globe2 className="mt-0.5 h-4 w-4 shrink-0 text-[#176b52]" />
                  <span><span className="block text-sm font-semibold">Public link</span><span className="mt-1 block text-xs leading-5 text-stone-500">Anyone with its unlisted link can view it.</span></span>
                </button>
              </div>
            </fieldset>

            <div>
              <label htmlFor="create-note-invitees" className="block text-xs font-semibold text-stone-700">Invite people by email <span className="font-normal text-stone-500">(optional)</span></label>
              <textarea
                id="create-note-invitees"
                rows={3}
                value={invitees}
                onChange={(event) => setInvitees(event.currentTarget.value)}
                placeholder={"alex@example.com\nsam@example.com"}
                className="mt-2 w-full resize-y rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-[#176b52] focus:ring-2 focus:ring-[#176b52]/10"
              />
              <p className="mt-1 text-xs text-stone-500">Separate addresses with a comma, semicolon, or new line. Invites require a verified account email.</p>
              <label className="mt-3 block text-xs font-semibold text-stone-700">
                Permission for invitees
                <select value={role} onChange={(event) => setRole(event.currentTarget.value as "viewer" | "editor")} className="mt-2 h-10 w-full rounded-lg border border-stone-300 bg-white px-3 text-sm font-normal">
                  <option value="viewer">Viewer — can read the note</option>
                  <option value="editor">Editor — can edit the note</option>
                </select>
              </label>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-stone-200 pt-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={onClose} disabled={isCreating} className="h-10 rounded-lg border border-stone-300 px-4 text-sm font-semibold text-stone-700 hover:bg-stone-100 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isCreating || !title.trim()} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#176b52] px-4 text-sm font-semibold text-white hover:bg-[#12543f] disabled:opacity-50">
                {isCreating && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {isCreating ? "Creating…" : "Create note"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
