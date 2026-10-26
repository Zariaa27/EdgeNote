"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const NOTICE_STORAGE_KEY = "edgenote-cookie-notice-seen";

export default function CookieNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(NOTICE_STORAGE_KEY) !== "yes");
    } catch (error) {
      console.warn("Unable to read the cookie notice preference.", error);
      setVisible(true);
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(NOTICE_STORAGE_KEY, "yes");
    } catch (error) {
      console.warn("Unable to save the cookie notice preference.", error);
    }
    setVisible(false);
  };

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => setVisible(true)}
        className="fixed bottom-3 left-3 z-40 rounded-full border border-stone-300 bg-[#fbfaf6] px-3 py-2 text-xs font-semibold text-stone-700 shadow-lg hover:text-[#176b52]"
      >
        Cookie settings
      </button>
    );
  }

  return (
    <aside aria-label="Cookie notice" className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl rounded-xl border border-stone-300 bg-[#fbfaf6] p-4 text-[#17251f] shadow-2xl sm:inset-x-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div>
        <h2 className="text-sm font-semibold">Essential storage only</h2>
        <p className="mt-1 text-xs leading-5 text-stone-600">
          EdgeNote uses essential sign-in storage and browser preferences. No analytics or advertising cookies are active.{" "}
          <Link href="/cookies" className="font-semibold text-[#176b52] underline">Cookie details</Link>
          {" · "}
          <Link href="/privacy" className="font-semibold text-[#176b52] underline">Privacy</Link>
        </p>
      </div>
      <button type="button" onClick={dismiss} className="mt-3 h-10 shrink-0 rounded-lg bg-[#176b52] px-4 text-xs font-semibold text-white hover:bg-[#12543f] sm:mt-0">
        Continue with essential storage
      </button>
    </aside>
  );
}
