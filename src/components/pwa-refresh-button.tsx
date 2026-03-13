"use client";

import { useState } from "react";
import { useIsStandalone } from "@/hooks/use-pwa-refresh";

export function PwaRefreshButton() {
  const isStandalone = useIsStandalone();
  const [spinning, setSpinning] = useState(false);

  if (!isStandalone) return null;

  const handleRefresh = () => {
    setSpinning(true);
    setTimeout(() => window.location.reload(), 400);
  };

  return (
    <button
      onClick={handleRefresh}
      className="text-gray-400 hover:text-gray-600 p-1.5 rounded-md hover:bg-gray-100 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
      title="Osvježi"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={spinning ? "animate-spin" : ""}
      >
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    </button>
  );
}
