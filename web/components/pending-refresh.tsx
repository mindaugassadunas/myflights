"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

/**
 * Mounted on flight detail when `resolutionStatus === "pending"`. Polls
 * `router.refresh()` every 2s for up to ~30s. Once the server-side
 * render sees a terminal status, the parent stops rendering this
 * component and the polling halts naturally.
 */
export function PendingRefresh() {
  const router = useRouter();

  React.useEffect(() => {
    let attempts = 0;
    const id = window.setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 15) {
        window.clearInterval(id);
      }
    }, 2000);
    return () => window.clearInterval(id);
  }, [router]);

  return null;
}
