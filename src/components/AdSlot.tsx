"use client";

import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT } from "@/lib/adsense";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type Props = {
  slot?: string;
  format?: string;
  label?: string;
  minHeight?: number;
};

export default function AdSlot({ slot, format = "auto", label = "Advertisement", minHeight = 90 }: Props) {
  const client = ADSENSE_CLIENT;
  const slotId = slot || process.env.NEXT_PUBLIC_ADSENSE_SLOT_DEFAULT || "";
  const ref = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!client || !slotId || !el) return;
    if (el.getAttribute("data-adsbygoogle-status")) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch {
      /* AdSense script not loaded yet — retried on next mount */
    }
  }, [client, slotId]);

  if (!client || !slotId) return null;

  return (
    <div className="ad-slot">
      <span className="ad-slot-label">{label}</span>
      <ins
        ref={ref}
        className="adsbygoogle"
        style={{ display: "block", minHeight, width: "100%" }}
        data-ad-client={client}
        data-ad-slot={slotId}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
