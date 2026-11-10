"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const signOut = async () => {
    setLoggingOut(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Unable to sign out. Please try again.");
      router.replace("/login");
      router.refresh();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Unable to sign out.");
      setLoggingOut(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void signOut()}
        disabled={loggingOut}
        aria-label={loggingOut ? "Signing out" : "Log out"}
        title={loggingOut ? "Signing out" : "Log out"}
        className="inline-flex h-9 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-stone-600 transition hover:bg-stone-200 hover:text-stone-900 disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" />
        <span className="hidden sm:inline">{loggingOut ? "Signing out…" : "Log out"}</span>
      </button>
      {error && <span role="alert" className="text-xs text-rose-700">{error}</span>}
    </>
  );
}
