"use client";

import * as React from "react";
import nextDynamic from "next/dynamic";
import { useAddFlightOpen } from "@/lib/add-flight-store";

const LazyAddFlightSheet = nextDynamic(
  () => import("./add-flight-sheet").then((m) => m.AddFlightSheet),
  {
    ssr: false,
    loading: () => null,
  },
);

export default function AddFlightSheetLoader() {
  const open = useAddFlightOpen();
  const [hasOpened, setHasOpened] = React.useState(open);

  React.useEffect(() => {
    if (open) setHasOpened(true);
  }, [open]);

  return hasOpened ? <LazyAddFlightSheet /> : null;
}
