import { Suspense } from "react";
import QuickTrackForm from "@/components/QuickTrackForm";

export const metadata = {
  title: "Track Savings Status | Brand Deals Hub",
  description: "Check the live status of your order verification and UPI savings payout with reference details.",
};

function TrackContent({ initialQuery }: { initialQuery?: string }) {
  return (
    <div className="container" style={{ paddingTop: 40, paddingBottom: 60, maxWidth: 760 }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
          Savings tracker
        </h1>
        <p className="muted" style={{ margin: 0, fontSize: 15 }}>
          Track your order verification and UPI savings payout with reference details.
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
