import { Suspense } from "react";
import QuickTrackForm from "@/components/QuickTrackForm";

export const metadata = {
  title: "Track Order & Refund Payout Status | Brand Promotion",
  description: "Check the live status of your order proof verification, review approval, and UPI refund payout with bank UTR reference.",
};

function TrackContent({ initialQuery }: { initialQuery?: string }) {
  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 760 }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
          Order &amp; payout tracker
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>
          Track your Amazon/Flipkart order confirmation, review verification status, and UPI payout UTR reference.
        </p>
      </div>

      <QuickTrackForm initialQuery={initialQuery} />
    </div>
  );
}

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <Suspense fallback={<div className="container" style={{ paddingTop: 60, textAlign: "center" }}>Loading tracker…</div>}>
      <TrackContent initialQuery={q} />
    </Suspense>
  );
}
