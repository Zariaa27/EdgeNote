"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SessionRedirect() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const session = await response.json() as { user?: { id: string } | null };
        if (active && session.user) router.replace("/workspace");
      })
      .catch((error: unknown) => {
        console.error("Unable to check the current session on the home page.", error);
      });

    return () => {
      active = false;
    };
  }, [router]);

  return null;
}
