"use client";

import { Check, Copy, LoaderCircle, Share2, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

interface Share {
  id: string;
  email: string;
  role: "viewer" | "editor";
  createdAt: string;
}

interface DocumentSharingProps {
  documentId: string;
  isPublic: boolean;
  onVisibilityChange: (isPublic: boolean) => void;
}

export default function DocumentSharing({ documentId, isPublic, onVisibilityChange }: DocumentSharingProps) {
  const [open, setOpen] = useState(false);
  const [shares, setShares] = useState<Share[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    setShareUrl(`${window.location.origin}/documents/${encodeURIComponent(documentId)}`);
  }, [documentId]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    fetch(`/api/documents/${encodeURIComponent(documentId)}/shares`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { shares?: Share[]; error?: string };
        if (!response.ok) throw new Error(payload.error ?? "Unable to load sharing settings.");
        if (active) setShares(payload.shares ?? []);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Unable to load sharing settings.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [documentId, open]);

  const togglePublic = async () => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: !isPublic }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to update link access.");
      onVisibilityChange(!isPublic);
      setMessage(!isPublic ? "Anyone with this unlisted link can now view the note." : "Public link access is off.");
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Unable to update link access.");
    } finally {
      setSaving(false);
    }
  };

  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/shares`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const payload = await response.json() as { error?: string; id?: string; email?: string; role?: Share["role"]; permissionSaved?: boolean; invitationSent?: boolean };
      if (!response.ok) {
        if (payload.permissionSaved) {
          setShares((current) => [
            ...current.filter((share) => share.email !== email.trim().toLowerCase()),
            {
              id: payload.id ?? "",
              email: payload.email ?? email.trim().toLowerCase(),
              role: payload.role ?? role,
              createdAt: new Date().toISOString(),
            },
          ]);
        }
        throw new Error(payload.error ?? "Unable to share this document.");
      }
      setShares((current) => [
        ...current.filter((share) => share.email !== payload.email),
        {
          id: payload.id ?? "",
          email: payload.email ?? email.trim().toLowerCase(),
          role: payload.role ?? role,
          createdAt: new Date().toISOString(),
        },
      ]);
      setEmail("");
      setMessage(payload.invitationSent
        ? "Permission granted and an email invitation was sent."
        : "Permission granted. The verified account can now find this note in its workspace.");
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Unable to share this document.");
    } finally {
      setSaving(false);
    }
  };

  const removeShare = async (share: Share) => {
    if (!share.id) {
      setError("Reload sharing settings before removing this permission.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/documents/${encodeURIComponent(documentId)}/shares?shareId=${encodeURIComponent(share.id)}`,
        { method: "DELETE" },
      );
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Unable to remove permission.");
      setShares((current) => current.filter((item) => item.id !== share.id));
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Unable to remove permission.");
    } finally {
      setSaving(false);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Could not copy the link. Copy it from the address bar instead.");
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-stone-300 px-3 text-xs font-semibold text-stone-700 transition hover:bg-stone-100"
      >
        <Share2 className="h-4 w-4" />
        <span>Share</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section role="dialog" aria-modal="true" aria-labelledby="share-title" className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-[#fbfaf6] p-5 shadow-2xl sm:p-7">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h2 id="share-title" className="text-lg font-semibold">Share this note</h2>
                <p className="mt-1 text-sm text-stone-500">Choose link access or invite people by email.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close sharing dialog" className="grid h-8 w-8 place-items-center rounded-md text-stone-500 hover:bg-stone-200"><X className="h-4 w-4" /></button>
            </header>

            {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
            {message && <p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{message}</p>}

            <section className="mt-6 rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold">Anyone with the link</h3>
                  <p className="mt-1 text-xs leading-5 text-stone-500">Unlisted and view-only. The note won’t appear in public search.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPublic}
                  aria-label="Enable public view link"
                  disabled={saving}
                  onClick={() => void togglePublic()}
                  className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition ${isPublic ? "bg-[#176b52]" : "bg-stone-300"} disabled:opacity-50`}
                >
                  <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${isPublic ? "left-6" : "left-1"}`} />
                </button>
              </div>
              {isPublic && (
                <div className="mt-4 flex gap-2">
                  <input readOnly value={shareUrl} aria-label="Public sharing link" className="h-9 min-w-0 flex-1 rounded-md border border-stone-300 bg-[#f5f4ef] px-2 text-xs" />
                  <button type="button" onClick={() => void copyLink()} className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md bg-[#176b52] px-3 text-xs font-semibold text-white hover:bg-[#12543f]">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>
              )}
            </section>

            <form onSubmit={(event) => void invite(event)} className="mt-6">
              <h3 className="text-sm font-semibold">Invite by email</h3>
              <p className="mt-1 text-xs leading-5 text-stone-500">The recipient needs a verified EdgeNote account using this email address. New users receive an invitation email.</p>
              <label className="mt-3 block text-xs font-medium text-stone-600">
                Email address
                <input type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.currentTarget.value)} placeholder="person@example.com" className="mt-1.5 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none focus:border-[#176b52]" />
              </label>
              <div className="mt-3 flex items-end gap-2">
                <label className="min-w-0 flex-1 text-xs font-medium text-stone-600">
                  Permission
                  <select value={role} onChange={(event) => setRole(event.currentTarget.value as Share["role"])} className="mt-1.5 h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm">
                    <option value="viewer">Can view</option>
                    <option value="editor">Can edit</option>
                  </select>
                </label>
                <button type="submit" disabled={saving || loading} className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#176b52] px-4 text-xs font-semibold text-white hover:bg-[#12543f] disabled:opacity-50">
                  {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Invite
                </button>
              </div>
            </form>

            <section className="mt-6 border-t border-stone-200 pt-5">
              <h3 className="text-sm font-semibold">People with access</h3>
              {loading ? (
                <div className="grid h-16 place-items-center"><LoaderCircle className="h-4 w-4 animate-spin text-[#176b52]" /></div>
              ) : shares.length ? (
                <ul className="mt-3 divide-y divide-stone-200">
                  {shares.map((share) => (
                    <li key={share.id || share.email} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{share.email}</p>
                        <p className="text-xs capitalize text-stone-500">Can {share.role}</p>
                      </div>
                      <button type="button" disabled={saving || !share.id} onClick={() => void removeShare(share)} aria-label={`Remove ${share.email}`} title="Remove access" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-stone-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-stone-500">No one else has private access yet.</p>
              )}
            </section>
          </section>
        </div>
      )}
    </>
  );
}
